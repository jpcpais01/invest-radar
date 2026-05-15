export const runtime     = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/market/yahoo";
import {
  TF, CANDLES_PER_DAY, isCrypto, isRegularSession, fmtTime,
  computeAtr14, buildTechnicalsNote, buildPriceTable,
  runOnce, aggregate,
} from "@/lib/ai/forecastEngine";

/** Run async tasks with bounded concurrency — keeps us under model rate limits. */
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

/**
 * Walk-forward backtest of the LLM forecast.
 *
 * The model is run on EVERY candle of the backtest window — at each one it sees
 * `lookback` past candles and predicts `nForecast` ahead. The route returns the
 * raw per-candle prediction + that candle's OHLC. The trade lifecycle (open on
 * signal, close on reversal or stop-loss) is simulated client-side so the
 * agreement and stop-loss sliders re-run instantly without touching the model.
 *
 *   window   — how many candles the backtest walks (the test window)
 *   lookback — how many past candles the model sees at each step
 *   We fetch window + lookback candles so the very first window candle has a
 *   full lookback of warmup behind it.
 */
export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const ticker    = (sp.get("ticker") ?? "AAPL").toUpperCase();
  const nWindow   = Math.min(150, Math.max(10, parseInt(sp.get("window")    ?? "60")));
  const nLookback = Math.min(252, Math.max(20, parseInt(sp.get("lookback")  ?? "120")));
  const nForecast = Math.min(30,  Math.max(3,  parseInt(sp.get("nForecast") ?? "10")));
  const nRuns     = Math.min(3,   Math.max(1,  parseInt(sp.get("nRuns")     ?? "1")));
  const withTech  = sp.get("technicals") === "true";

  const rawTF = sp.get("timeframe") ?? "1d";
  const tf: TF = (rawTF === "1m" || rawTF === "5m" || rawTF === "1h" || rawTF === "1d") ? rawTF : "1d";

  try {
    const totalCandles = nWindow + nLookback + 10;
    const cpd = CANDLES_PER_DAY[tf];
    const calDays = tf === "1m"
      ? 7
      : tf === "1d"
        ? Math.ceil(totalCandles * 1.5) + 20
        : Math.ceil(totalCandles / cpd * 1.5) + 12;
    const from = new Date(Date.now() - calDays * 86400000);

    const rawBars = await getHistory(ticker, tf, from);
    const filterSession = (tf === "1m" || tf === "5m" || tf === "1h") && !isCrypto(ticker);
    const bars = filterSession ? rawBars.filter(b => isRegularSession(b.time)) : rawBars;

    if (bars.length < nLookback + 2)
      return NextResponse.json({ error: "Not enough historical data for this configuration" }, { status: 400 });

    // Window = the last `nWindow` candles that each have a full lookback behind them.
    const startIdx = Math.max(nLookback - 1, bars.length - nWindow);
    const windowIdx: number[] = [];
    for (let bi = startIdx; bi < bars.length; bi++) windowIdx.push(bi);
    if (windowIdx.length < 2)
      return NextResponse.json({ error: "Not enough historical data for this configuration" }, { status: 400 });

    // Analyse every candle in the window (bounded concurrency).
    const candles = await pool(windowIdx, 12, async (bi) => {
      const c = bars[bi];
      try {
        const feedSlice  = bars.slice(bi - nLookback + 1, bi + 1);
        const atr14      = computeAtr14(feedSlice, c.close);
        const priceTable = buildPriceTable(feedSlice, tf);
        const techNote   = withTech ? buildTechnicalsNote(feedSlice, c.close, atr14) : "";

        const results = await Promise.all(
          Array.from({ length: nRuns }, () =>
            runOnce(ticker, fmtTime(c.time, tf), c.close, nForecast, priceTable, feedSlice.length, tf, techNote)),
        );

        const agg     = aggregate(results, c.close, atr14, nForecast);
        const finals  = agg.predictions.map(p => p[p.length - 1]);
        const upCount = finals.filter(f => f > c.close).length;

        return {
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          upCount, totalPaths: agg.predictions.length,
          confidence: agg.confidence, analysis: agg.analysis,
        };
      } catch (e) {
        console.error(`strategy-backtest: candle @${bi} failed —`, e);
        // keep the candle (OHLC still needed for stop-loss) but mark it signal-less
        return {
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          upCount: 0, totalPaths: 0, confidence: 0, analysis: "",
        };
      }
    });

    return NextResponse.json({
      ticker, timeframe: tf, window: nWindow, lookback: nLookback,
      nForecast, nRuns, withTech, candles,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
