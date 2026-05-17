export const runtime     = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import * as ti from "technicalindicators";
import { getHistory } from "@/lib/market/yahoo";
import { TF, CANDLES_PER_DAY, isCrypto, isRegularSession } from "@/lib/ai/forecastEngine";

function getInd<T>(arr: T[], offset: number, i: number): T | undefined {
  const idx = i - offset;
  return idx >= 0 && idx < arr.length ? arr[idx] : undefined;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ticker  = (sp.get("ticker") ?? "AAPL").toUpperCase();
  const nWindow = Math.min(1000, Math.max(10, parseInt(sp.get("window") ?? "60")));

  const rsiPeriod = Math.min(50,  Math.max(2, parseInt(sp.get("rsiPeriod") ?? "14")));
  const emaFastP  = Math.min(100, Math.max(2, parseInt(sp.get("emaFast")   ?? "9")));
  const emaSlowP  = Math.min(200, Math.max(2, parseInt(sp.get("emaSlow")   ?? "21")));
  const smaFastP  = Math.min(100, Math.max(2, parseInt(sp.get("smaFast")   ?? "20")));
  const smaSlowP  = Math.min(500, Math.max(2, parseInt(sp.get("smaSlow")   ?? "50")));
  const bbPeriod  = Math.min(100, Math.max(2, parseInt(sp.get("bbPeriod")  ?? "20")));
  const stochKP   = Math.min(50,  Math.max(2, parseInt(sp.get("stochK")    ?? "14")));
  const stochDP   = Math.min(20,  Math.max(1, parseInt(sp.get("stochD")    ?? "3")));

  const rawTF = sp.get("timeframe") ?? "1d";
  const tf: TF = (rawTF === "1m" || rawTF === "5m" || rawTF === "1h" || rawTF === "1d") ? rawTF : "1d";

  try {
    const warmup       = Math.max(smaSlowP + 10, 80);
    const totalCandles = nWindow + warmup;
    const cpd          = CANDLES_PER_DAY[tf];
    const calDays      = tf === "1m"
      ? 7
      : tf === "1d"
        ? Math.ceil(totalCandles * 1.6) + 20
        : Math.ceil(totalCandles / cpd * 1.6) + 12;
    const from = new Date(Date.now() - calDays * 86400000);

    const rawBars = await getHistory(ticker, tf, from);
    const filterSession = (tf === "1m" || tf === "5m" || tf === "1h") && !isCrypto(ticker);
    const bars = filterSession ? rawBars.filter(b => isRegularSession(b.time)) : rawBars;

    if (bars.length < warmup + 2)
      return NextResponse.json({ error: "Not enough historical data for this configuration" }, { status: 400 });

    const closes = bars.map(b => b.close);
    const highs  = bars.map(b => b.high);
    const lows   = bars.map(b => b.low);

    const rsiVals   = ti.RSI.calculate({ values: closes, period: rsiPeriod });
    const emaFastV  = ti.EMA.calculate({ values: closes, period: emaFastP });
    const emaSlowV  = ti.EMA.calculate({ values: closes, period: emaSlowP });
    const smaFastV  = ti.SMA.calculate({ values: closes, period: smaFastP });
    const smaSlowV  = ti.SMA.calculate({ values: closes, period: smaSlowP });
    const bbVals    = ti.BollingerBands.calculate({ values: closes, period: bbPeriod, stdDev: 2 });
    const stochVals = ti.Stochastic.calculate({
      high: highs, low: lows, close: closes, period: stochKP, signalPeriod: stochDP,
    });

    const rsiOff   = rsiPeriod;
    const emaFOff  = emaFastP - 1;
    const emaSOff  = emaSlowP - 1;
    const smaFOff  = smaFastP - 1;
    const smaSOff  = smaSlowP - 1;
    const bbOff    = bbPeriod - 1;
    const stochOff = stochKP - 1 + stochDP - 1;

    const startIdx = Math.max(warmup - 1, bars.length - nWindow);
    const windowIdx: number[] = [];
    for (let bi = startIdx; bi < bars.length; bi++) windowIdx.push(bi);

    if (windowIdx.length < 2)
      return NextResponse.json({ error: "Not enough historical data for this configuration" }, { status: 400 });

    const candles = windowIdx.map(bi => {
      const c = bars[bi];
      return {
        time:        c.time,
        open:        c.open,
        high:        c.high,
        low:         c.low,
        close:       c.close,
        rsi:         getInd(rsiVals,   rsiOff,   bi) ?? null,
        emaFast:     getInd(emaFastV,  emaFOff,  bi) ?? null,
        emaSlow:     getInd(emaSlowV,  emaSOff,  bi) ?? null,
        smaFast:     getInd(smaFastV,  smaFOff,  bi) ?? null,
        smaSlow:     getInd(smaSlowV,  smaSOff,  bi) ?? null,
        bbUpper:     getInd(bbVals,    bbOff,    bi)?.upper ?? null,
        bbLower:     getInd(bbVals,    bbOff,    bi)?.lower ?? null,
        stochK:      getInd(stochVals, stochOff, bi)?.k     ?? null,
        stochD:      getInd(stochVals, stochOff, bi)?.d     ?? null,
        prevEmaFast: getInd(emaFastV,  emaFOff,  bi - 1) ?? null,
        prevEmaSlow: getInd(emaSlowV,  emaSOff,  bi - 1) ?? null,
        prevSmaFast: getInd(smaFastV,  smaFOff,  bi - 1) ?? null,
        prevSmaSlow: getInd(smaSlowV,  smaSOff,  bi - 1) ?? null,
      };
    });

    return NextResponse.json({ ticker, timeframe: tf, window: nWindow, candles });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
