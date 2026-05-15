export const runtime     = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/market/yahoo";
import {
  TF, CANDLES_PER_DAY, isCrypto, isRegularSession, fmtTime,
  computeAtr14, buildTechnicalsNote, buildPriceTable,
  runOnce, aggregate,
} from "@/lib/ai/forecastEngine";

/**
 * Walk-forward backtest of the LLM forecast.
 *
 * At each decision point the model sees `nHistory` candles and predicts the
 * next `nForecast`. Decision points are spaced `nForecast` apart (non-overlapping
 * trades → a clean compounding equity curve). The trade GATE (magnitude +
 * directional agreement thresholds) is intentionally NOT applied here — the
 * route returns the raw per-point data so the client can re-filter instantly
 * as the user drags the gate sliders.
 */
export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const ticker    = (sp.get("ticker") ?? "AAPL").toUpperCase();
  const nHistory  = Math.min(252, Math.max(30, parseInt(sp.get("nHistory")  ?? "120")));
  const nForecast = Math.min(30,  Math.max(3,  parseInt(sp.get("nForecast") ?? "20")));
  const nRuns     = Math.min(5,   Math.max(1,  parseInt(sp.get("nRuns")     ?? "3")));
  const nPoints   = Math.min(12,  Math.max(3,  parseInt(sp.get("nPoints")   ?? "6")));
  const withTech  = sp.get("technicals") === "true";

  const rawTF = sp.get("timeframe") ?? "1d";
  const tf: TF = (rawTF === "1m" || rawTF === "5m" || rawTF === "1h" || rawTF === "1d") ? rawTF : "1d";

  try {
    // Total candles the walk-forward window needs, plus buffer.
    const totalCandles = nHistory + nPoints * nForecast + nForecast + 10;
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

    // Decision indices: each needs `nHistory` candles before it and `nForecast` after.
    const minIdx = nHistory - 1;
    const maxIdx = bars.length - 1 - nForecast;
    if (maxIdx <= minIdx)
      return NextResponse.json({ error: "Not enough historical data for this configuration" }, { status: 400 });

    const stride    = nForecast;
    const fitPoints = Math.floor((maxIdx - minIdx) / stride) + 1;
    const usePoints = Math.min(nPoints, fitPoints);

    const decisionIndices: number[] = [];
    for (let i = 0; i < usePoints; i++) decisionIndices.push(maxIdx - i * stride);
    decisionIndices.reverse(); // chronological

    // Run every decision point in parallel. A single point failing (transient
    // model error) shouldn't kill the whole backtest — those return null.
    const settled = await Promise.all(
      decisionIndices.map(async (di) => {
        try {
          const feedSlice  = bars.slice(di - nHistory + 1, di + 1);
          const entryBar   = bars[di];
          const entryPrice = entryBar.close;
          const atr14      = computeAtr14(feedSlice, entryPrice);
          const priceTable = buildPriceTable(feedSlice, tf);
          const techNote   = withTech ? buildTechnicalsNote(feedSlice, entryPrice, atr14) : "";

          const results = await Promise.all(
            Array.from({ length: nRuns }, () =>
              runOnce(
                ticker, fmtTime(entryBar.time, tf),
                entryPrice, nForecast, priceTable, feedSlice.length, tf, techNote,
              ),
            ),
          );

          const agg = aggregate(results, entryPrice, atr14, nForecast);

          const actualBars = bars.slice(di + 1, di + 1 + nForecast);
          const actualPath = actualBars.map(b => b.close);
          const exitBar    = actualBars[actualBars.length - 1];

          const finals     = agg.predictions.map(p => p[p.length - 1]);
          const upCount    = finals.filter(f => f > entryPrice).length;
          const baseFinal  = agg.scenarios.base[agg.scenarios.base.length - 1];

          return {
            time:       entryBar.time,
            entryPrice,
            exitTime:   exitBar.time,
            exitPrice:  exitBar.close,
            basePath:   agg.scenarios.base,
            bullPath:   agg.scenarios.bull,
            bearPath:   agg.scenarios.bear,
            actualPath,
            confidence: agg.confidence,
            analysis:   agg.analysis,
            atr14,
            baseFinal,
            upCount,
            totalPaths: agg.predictions.length,
          };
        } catch (e) {
          console.error(`strategy-backtest: decision point @${di} failed —`, e);
          return null;
        }
      }),
    );

    const points = settled.filter((p): p is NonNullable<typeof p> => p !== null);
    if (points.length < 2)
      return NextResponse.json({ error: "Backtest produced too few valid decision points — try again" }, { status: 502 });

    return NextResponse.json({
      ticker,
      timeframe: tf,
      nHistory,
      nForecast,
      nRuns,
      withTech,
      requestedPoints: nPoints,
      points,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
