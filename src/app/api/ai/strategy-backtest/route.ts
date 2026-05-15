export const runtime     = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import * as ti from "technicalindicators";
import { getHistory } from "@/lib/market/yahoo";
import {
  TF, CANDLES_PER_DAY, isCrypto, isRegularSession, fmtTime,
  computeAtr14, buildTechnicalsNote, buildPriceTable,
  runOnce, aggregate,
} from "@/lib/ai/forecastEngine";

async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let a = 0; a < attempts; a++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (a < attempts - 1)
        await new Promise(r => setTimeout(r, 800 * 2 ** a + Math.random() * 500));
    }
  }
  throw lastErr;
}

/** Align an indicator output array with the source bar array.
 *  The indicator skips `offset` bars of warmup, so output[0] → bars[offset]. */
function getInd<T>(arr: T[], offset: number, i: number): T | undefined {
  const idx = i - offset;
  return idx >= 0 && idx < arr.length ? arr[idx] : undefined;
}

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const ticker    = (sp.get("ticker") ?? "AAPL").toUpperCase();
  const nWindow   = Math.min(1000, Math.max(10, parseInt(sp.get("window")   ?? "60")));
  const nLookback = Math.min(252, Math.max(20, parseInt(sp.get("lookback")  ?? "120")));
  const nForecast = Math.min(30,  Math.max(3,  parseInt(sp.get("nForecast") ?? "10")));
  const nRuns     = Math.min(3,   Math.max(1,  parseInt(sp.get("nRuns")     ?? "1")));
  const withTech  = sp.get("technicals") === "true";
  const aiEnabled = sp.get("aiEnabled") !== "false";

  // Indicator periods
  const rsiPeriod  = Math.min(50,  Math.max(2, parseInt(sp.get("rsiPeriod") ?? "14")));
  const emaFastP   = Math.min(100, Math.max(2, parseInt(sp.get("emaFast")   ?? "9")));
  const emaSlowP   = Math.min(200, Math.max(2, parseInt(sp.get("emaSlow")   ?? "21")));
  const macdFastP  = Math.min(50,  Math.max(2, parseInt(sp.get("macdFast")  ?? "12")));
  const macdSlowP  = Math.min(200, Math.max(2, parseInt(sp.get("macdSlow")  ?? "26")));
  const macdSigP   = Math.min(50,  Math.max(1, parseInt(sp.get("macdSig")   ?? "9")));
  const bbPeriod   = Math.min(100, Math.max(2, parseInt(sp.get("bbPeriod")  ?? "20")));
  const stochKP    = Math.min(50,  Math.max(2, parseInt(sp.get("stochK")    ?? "14")));
  const stochDP    = Math.min(20,  Math.max(1, parseInt(sp.get("stochD")    ?? "3")));

  const rawTF = sp.get("timeframe") ?? "1d";
  const tf: TF = (rawTF === "1m" || rawTF === "5m" || rawTF === "1h" || rawTF === "1d") ? rawTF : "1d";

  try {
    // Always fetch enough bars for indicator warmup (at least 60) + lookback (for AI)
    const warmup       = Math.max(aiEnabled ? nLookback : 0, 60);
    const totalCandles = nWindow + warmup + 10;
    const cpd          = CANDLES_PER_DAY[tf];
    const calDays      = tf === "1m"
      ? 7
      : tf === "1d"
        ? Math.ceil(totalCandles * 1.5) + 20
        : Math.ceil(totalCandles / cpd * 1.5) + 12;
    const from = new Date(Date.now() - calDays * 86400000);

    const rawBars = await getHistory(ticker, tf, from);
    const filterSession = (tf === "1m" || tf === "5m" || tf === "1h") && !isCrypto(ticker);
    const bars = filterSession ? rawBars.filter(b => isRegularSession(b.time)) : rawBars;

    if (bars.length < warmup + 2)
      return NextResponse.json({ error: "Not enough historical data for this configuration" }, { status: 400 });

    // ── compute indicators on the full bars array ────────────────────────
    const closes = bars.map(b => b.close);
    const highs  = bars.map(b => b.high);
    const lows   = bars.map(b => b.low);

    const rsiVals   = ti.RSI.calculate({ values: closes, period: rsiPeriod });
    const emaFastV  = ti.EMA.calculate({ values: closes, period: emaFastP });
    const emaSlowV  = ti.EMA.calculate({ values: closes, period: emaSlowP });
    const macdVals  = ti.MACD.calculate({
      values: closes, fastPeriod: macdFastP, slowPeriod: macdSlowP, signalPeriod: macdSigP,
      SimpleMAOscillator: false, SimpleMASignal: false,
    });
    const bbVals    = ti.BollingerBands.calculate({ values: closes, period: bbPeriod, stdDev: 2 });
    const stochVals = ti.Stochastic.calculate({
      high: highs, low: lows, close: closes,
      period: stochKP, signalPeriod: stochDP,
    });

    // Warmup offsets: output[0] corresponds to bars[offset]
    const rsiOff   = rsiPeriod;         // RSI needs period+1 bars for first value
    const emaFOff  = emaFastP - 1;
    const emaSOff  = emaSlowP - 1;
    const macdOff  = (macdSlowP - 1) + (macdSigP - 1);
    const bbOff    = bbPeriod - 1;
    const stochOff = stochKP - 1 + stochDP - 1;

    // ── window setup ─────────────────────────────────────────────────────
    const startIdx = Math.max(aiEnabled ? nLookback - 1 : 59, bars.length - nWindow);
    const windowIdx: number[] = [];
    for (let bi = startIdx; bi < bars.length; bi++) windowIdx.push(bi);
    if (windowIdx.length < 2)
      return NextResponse.json({ error: "Not enough historical data for this configuration" }, { status: 400 });

    // ── per-candle analysis ───────────────────────────────────────────────
    let failedCandles = 0;
    const candles = await pool(windowIdx, aiEnabled ? 6 : windowIdx.length, async (bi) => {
      const c = bars[bi];

      const rsi      = getInd(rsiVals,   rsiOff,   bi) ?? null;
      const emaFast  = getInd(emaFastV,  emaFOff,  bi) ?? null;
      const emaSlow  = getInd(emaSlowV,  emaSOff,  bi) ?? null;
      const macdOut  = getInd(macdVals,  macdOff,  bi);
      const bbOut    = getInd(bbVals,    bbOff,    bi);
      const stochOut = getInd(stochVals, stochOff, bi);

      const indicators = {
        rsi,
        emaFast,
        emaSlow,
        macdLine:  macdOut?.MACD    ?? null,
        macdSig:   macdOut?.signal  ?? null,
        bbUpper:   bbOut?.upper     ?? null,
        bbLower:   bbOut?.lower     ?? null,
        stochK:    stochOut?.k      ?? null,
        stochD:    stochOut?.d      ?? null,
        // also carry previous-bar indicator values for cross detection
        prevEmaFast: getInd(emaFastV, emaFOff, bi - 1) ?? null,
        prevEmaSlow: getInd(emaSlowV, emaSOff, bi - 1) ?? null,
        prevMacdLine: getInd(macdVals, macdOff, bi - 1)?.MACD   ?? null,
        prevMacdSig:  getInd(macdVals, macdOff, bi - 1)?.signal ?? null,
      };

      if (!aiEnabled) {
        return {
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          upCount: 0, totalPaths: 0, confidence: 0, analysis: "",
          ...indicators,
        };
      }

      try {
        const feedSlice  = bars.slice(bi - nLookback + 1, bi + 1);
        const atr14      = computeAtr14(feedSlice, c.close);
        const priceTable = buildPriceTable(feedSlice, tf);
        const techNote   = withTech ? buildTechnicalsNote(feedSlice, c.close, atr14) : "";

        const settled = await Promise.allSettled(
          Array.from({ length: nRuns }, () =>
            withRetry(() => runOnce(ticker, fmtTime(c.time, tf), c.close, nForecast, priceTable, feedSlice.length, tf, techNote))),
        );
        const ok = settled.filter(
          (s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof runOnce>>> => s.status === "fulfilled",
        ).map(s => s.value);
        if (ok.length === 0) throw settled.find(s => s.status === "rejected") ?? new Error("all runs failed");

        const agg     = aggregate(ok, c.close, atr14, nForecast);
        const finals  = agg.predictions.map(p => p[p.length - 1]);
        const upCount = finals.filter(f => f > c.close).length;

        return {
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          upCount, totalPaths: agg.predictions.length,
          confidence: agg.confidence, analysis: agg.analysis,
          ...indicators,
        };
      } catch (e) {
        failedCandles++;
        console.error(`strategy-backtest: candle @${bi} failed —`, e);
        return {
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          upCount: 0, totalPaths: 0, confidence: 0, analysis: "",
          ...indicators,
        };
      }
    });

    return NextResponse.json({
      ticker, timeframe: tf, window: nWindow, lookback: nLookback,
      nForecast, nRuns, withTech, aiEnabled, failedCandles, candles,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
