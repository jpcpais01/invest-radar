export const runtime    = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/market/yahoo";
import {
  TF, CANDLES_PER_DAY, isCrypto, isRegularSession, nextCandleTimes,
  fmtTime, computeAtr14, buildTechnicalsNote, buildPriceTable,
  runOnce, aggregate,
} from "@/lib/ai/forecastEngine";

// ── GET handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sp          = req.nextUrl.searchParams;
  const ticker      = (sp.get("ticker")     ?? "AAPL").toUpperCase();
  const nHistory    = Math.min(252, Math.max(30, parseInt(sp.get("nHistory")    ?? "90")));
  const nForecast   = Math.min(30,  Math.max(3,  parseInt(sp.get("nForecast")   ?? "15")));
  const nRuns       = Math.min(50,  Math.max(1,  parseInt(sp.get("nRuns")       ?? "3")));
  const withTech    = sp.get("technicals") === "true";
  const backtest    = sp.get("backtest")   === "true";
  const rewind      = Math.min(60,  Math.max(15, parseInt(sp.get("rewind")      ?? "30")));

  // Validate timeframe
  const rawTF = sp.get("timeframe") ?? "1d";
  const tf: TF = (rawTF === "1m" || rawTF === "5m" || rawTF === "1h" || rawTF === "1d") ? rawTF : "1d";

  try {
    // Fetch enough calendar days to cover nHistory candles.
    // Yahoo Finance caps 1m data at 8 days per request — stay well inside that.
    const candlesPerDay = CANDLES_PER_DAY[tf];
    const calDays = tf === "1m"
      ? 7
      : Math.ceil(nHistory / candlesPerDay * 1.6) + 10;
    const from = new Date(Date.now() - calDays * 86400000);

    const rawBars = await getHistory(ticker, tf, from);

    // Filter pre-market / after-hours for intraday non-crypto assets.
    const filterSession = (tf === "1m" || tf === "5m" || tf === "1h") && !isCrypto(ticker);
    const bars = filterSession ? rawBars.filter(b => isRegularSession(b.time)) : rawBars;

    if (bars.length < 10)
      return NextResponse.json({ error: "Insufficient historical data" }, { status: 400 });

    const slice = bars.slice(-nHistory);

    // backtest: hide the last `rewind` candles from the model
    const feedSlice = backtest ? slice.slice(0, slice.length - rewind) : slice;
    if (feedSlice.length < 10)
      return NextResponse.json({ error: "Not enough candles before the rewind point" }, { status: 400 });

    const closes    = feedSlice.map(b => b.close);
    const lastClose = closes[closes.length - 1];
    const lastTimestamp = fmtTime(feedSlice[feedSlice.length - 1].time, tf);

    const atr14          = computeAtr14(feedSlice, lastClose);
    const priceTable     = buildPriceTable(feedSlice, tf);
    const technicalsNote = withTech ? buildTechnicalsNote(feedSlice, lastClose, atr14) : "";

    // backtest mode: cap nForecast to however many actual candles remain
    const rewindSlice       = backtest ? slice.slice(slice.length - rewind) : null;
    const effectiveForecast = backtest ? Math.min(nForecast, rewindSlice!.length) : nForecast;

    // Run nRuns independent requests in parallel
    const results = await Promise.all(
      Array.from({ length: nRuns }, () =>
        runOnce(ticker, lastTimestamp, lastClose, effectiveForecast, priceTable, feedSlice.length, tf, technicalsNote),
      ),
    );

    const agg = aggregate(results, lastClose, atr14, effectiveForecast);

    // futureDates: next N candle timestamps, or actual historical timestamps in backtest mode
    const futureDates = backtest && rewindSlice
      ? rewindSlice.slice(0, effectiveForecast).map(b => b.time)
      : nextCandleTimes(slice[slice.length - 1].time, effectiveForecast, tf, filterSession);

    const historical = bars.slice(-Math.min(nHistory, 120)).map(b => ({ time: b.time, close: b.close }));

    const backtestActuals = backtest && rewindSlice
      ? rewindSlice.slice(0, effectiveForecast).map(b => b.close)
      : undefined;

    return NextResponse.json({
      ticker,
      historical,
      lastClose,
      futureDates,
      predictions: agg.predictions,
      scenarios: agg.scenarios,
      confidence: agg.confidence,
      analysis: agg.analysis,
      nHistory: slice.length,
      nForecast: effectiveForecast,
      timeframe: tf,
      isBacktest: backtest,
      backtestSepTime: backtest ? feedSlice[feedSlice.length - 1].time : undefined,
      backtestActuals,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
