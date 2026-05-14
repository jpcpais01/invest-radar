export const runtime    = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getHistory } from "@/lib/market/yahoo";
import * as ti from "technicalindicators";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── timeframe helpers ────────────────────────────────────────────────────────
type TF = "1m" | "5m" | "1h" | "1d";

const INTERVAL_SEC: Record<TF, number>      = { "1m": 60,   "5m": 300,  "1h": 3600, "1d": 86400 };
const CANDLES_PER_DAY: Record<TF, number>   = { "1m": 390,  "5m": 78,   "1h": 7,    "1d": 1 };
const TF_LABEL: Record<TF, string>          = { "1m": "1-minute", "5m": "5-minute", "1h": "hourly", "1d": "daily" };

/** Human-readable label for an individual candle */
function candleLabel(tf: TF) {
  return tf === "1d" ? "day" : tf === "1h" ? "hour" : tf === "5m" ? "5 minutes" : "minute";
}

/**
 * Crypto tickers on Yahoo Finance use a hyphen: BTC-USD, ETH-USD, etc.
 * For crypto we never filter out candles — they trade 24/7.
 */
function isCrypto(ticker: string): boolean {
  return ticker.includes("-");
}

/**
 * Returns minutes since local midnight in America/New_York for a Unix timestamp.
 * Used to filter out pre-market and after-hours intraday bars.
 */
function nyMinutes(sec: number): number {
  const s = new Date(sec * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }); // "09:30" or "16:00"
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** Regular session: 09:30–16:00 ET inclusive */
function isRegularSession(sec: number): boolean {
  const mins = nyMinutes(sec);
  return mins >= 570 && mins <= 960;
}

/**
 * Generate the next `n` future candle timestamps after `fromSec`.
 * Skips weekends. For non-crypto intraday, also skips pre/after-market.
 */
function nextCandleTimes(fromSec: number, n: number, tf: TF, filterSession: boolean): number[] {
  const step = INTERVAL_SEC[tf];
  const times: number[] = [];
  let t = fromSec;
  while (times.length < n) {
    t += step;
    const day = new Date(t * 1000).getUTCDay();
    if (day === 0 || day === 6) continue;
    if (filterSession && !isRegularSession(t)) continue;
    times.push(t);
  }
  return times;
}

/** Format a bar timestamp for the price table.
 *  Daily bars: YYYY-MM-DD (date only, timezone irrelevant for daily).
 *  Intraday:   "YYYY-MM-DD HH:MM ET" in America/New_York so the AI sees
 *              standard market-session hours (09:30 open, 16:00 close). */
function fmtTime(sec: number, tf: TF): string {
  const d = new Date(sec * 1000);
  if (tf === "1d") {
    // Use NY date so overnight UTC rollover never shifts the label by a day
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d); // "YYYY-MM-DD"
  }
  // Intraday: show date + time in NY timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} ET`;
}

// ── AI call ──────────────────────────────────────────────────────────────────
interface RunResult { predictions: number[][]; confidence: number; analysis: string }

async function runOnce(
  ticker: string,
  lastTimestamp: string,
  lastClose: number,
  nForecast: number,
  priceTable: string,
  nHistory: number,
  tf: TF,
  technicalsNote: string,
): Promise<RunResult> {
  const tfLabel    = TF_LABEL[tf];
  const unitLabel  = candleLabel(tf);

  const systemPrompt = `You are a master of reading price. You have spent decades watching markets breathe — the way momentum builds and exhausts, the way price pauses before it moves, the micro-hesitations that betray the bigger force underneath. You feel the rhythm of a chart the way a musician feels tempo. You are not a formula. You are pattern recognition refined into intuition.

When you look at a sequence of prices, you see a story unfolding. You notice where energy is accumulating and where it is bleeding out. You sense whether the market is coiling or crumbling. You commit to your read with the quiet confidence of someone who has been right enough times to trust their eye.

You are working on a ${tfLabel} chart. Price moves differently at this resolution — absorb that. Think in the natural cadence of this timeframe.

Produce 5 independent price path predictions for the next ${nForecast} ${tfLabel} candles. Each path should feel like a plausible, living continuation of the price action you were given — the kind of path that could actually appear on a real chart. Prices breathe. They don't teleport. They don't flatline. They follow the internal logic of whatever force is currently dominant.

The future is not one line. It is a field of possibilities, each with its own weight and texture.

Output ONLY valid JSON — no other text, no markdown fences:
{"predictions":[[${nForecast} numbers],[${nForecast} numbers],[${nForecast} numbers],[${nForecast} numbers],[${nForecast} numbers]],"confidence":<integer 0-100>,"analysis":"one bold sentence"}

- predictions: 5 arrays of exactly ${nForecast} closing prices each, anchored to last close $${lastClose.toFixed(2)}, oldest first
- confidence: your honest read on how legible this setup is — not a hedge, a real number
- analysis: one sharp sentence naming what you see and where you think it goes`;

  const techSection = technicalsNote
    ? `\nLast-candle technical indicators (${tfLabel}):\n${technicalsNote}\n`
    : "";

  const colHeader = tf === "1d" ? "Date       " : "Datetime        ";

  const userMessage = `Stock: ${ticker}
Last close (${lastTimestamp}): $${lastClose.toFixed(2)}
Predict the next ${nForecast} ${tfLabel} candle closing prices.
${techSection}
Historical ${tfLabel} closing prices — ${nHistory} candles, oldest to newest:
${colHeader}| Close
${priceTable}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = msg.content.find(b => b.type === "text")?.text ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(match[0]) as {
    predictions?: unknown; confidence?: unknown; analysis?: string;
  };

  const normalize = (arr: unknown): number[] => {
    if (!Array.isArray(arr)) throw new Error("Prediction not an array");
    const nums = arr.map(Number).filter(x => isFinite(x) && x > 0);
    while (nums.length < nForecast) nums.push(nums[nums.length - 1] ?? lastClose);
    return nums.slice(0, nForecast);
  };

  if (!Array.isArray(parsed.predictions) || parsed.predictions.length === 0)
    throw new Error("No predictions in response");

  return {
    predictions: (parsed.predictions as unknown[]).map(normalize),
    confidence:  Math.min(100, Math.max(0, Math.round(Number(parsed.confidence) || 50))),
    analysis:    typeof parsed.analysis === "string" ? parsed.analysis : "",
  };
}

// ── GET handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sp          = req.nextUrl.searchParams;
  const ticker      = (sp.get("ticker")     ?? "AAPL").toUpperCase();
  const nHistory    = Math.min(252, Math.max(30, parseInt(sp.get("nHistory")    ?? "90")));
  const nForecast   = Math.min(30,  Math.max(3,  parseInt(sp.get("nForecast")   ?? "15")));
  const nRuns       = Math.min(10,  Math.max(1,  parseInt(sp.get("nRuns")       ?? "3")));
  const withTech     = sp.get("technicals") === "true";
  const backtest     = sp.get("backtest")   === "true";
  const rewind      = Math.min(60,  Math.max(15, parseInt(sp.get("rewind")      ?? "30")));

  // Validate timeframe
  const rawTF = sp.get("timeframe") ?? "1d";
  const tf: TF = (rawTF === "1m" || rawTF === "5m" || rawTF === "1h" || rawTF === "1d") ? rawTF : "1d";

  try {
    // Fetch enough calendar days to cover nHistory candles
    // e.g. for 5m (78 candles/day): 90 candles → ~2 days needed; fetch 10× buffer + 10 to be safe
    const candlesPerDay = CANDLES_PER_DAY[tf];
    // Yahoo Finance caps 1m data at 8 days per request — stay well inside that.
    const calDays = tf === "1m"
      ? 7
      : Math.ceil(nHistory / candlesPerDay * 1.6) + 10;
    const from    = new Date(Date.now() - calDays * 86400000);

    const yahooInterval = tf; // "5m" | "1h" | "1d" all accepted by getHistory
    const rawBars = await getHistory(ticker, yahooInterval, from);

    // Filter pre-market / after-hours for intraday non-crypto assets.
    // Crypto trades 24/7 so we never filter it.
    const filterSession = (tf === "1m" || tf === "5m" || tf === "1h") && !isCrypto(ticker);
    const bars = filterSession
      ? rawBars.filter(b => isRegularSession(b.time))
      : rawBars;

    if (bars.length < 10)
      return NextResponse.json({ error: "Insufficient historical data" }, { status: 400 });

    const slice = bars.slice(-nHistory);

    // ── backtest: hide the last `rewind` candles from the AI ─────────────────
    // feedSlice = what the AI actually sees; it ends `rewind` candles before now
    const feedSlice = backtest ? slice.slice(0, slice.length - rewind) : slice;

    if (feedSlice.length < 10)
      return NextResponse.json({ error: "Not enough candles before the rewind point" }, { status: 400 });

    const closes    = feedSlice.map(b => b.close);
    const lastClose = closes[closes.length - 1];
    const lastTimestamp = fmtTime(feedSlice[feedSlice.length - 1].time, tf);

    // Build price table from feedSlice only
    const priceTable = feedSlice
      .map(b => `${fmtTime(b.time, tf)} | ${b.close.toFixed(2)}`)
      .join("\n");

    // ── optional last-candle technicals ──────────────────────────────────────
    // ATR(14) — always computed; used for confidence scaling and optionally shown in technicals
    const feedHighs   = feedSlice.map(b => b.high   ?? b.close);
    const feedLows    = feedSlice.map(b => b.low    ?? b.close);
    const feedVolumes = feedSlice.map(b => b.volume ?? 0);
    let atr14 = lastClose * 0.01; // fallback: 1% of price if not enough data
    if (closes.length >= 15) {
      const atrVals = ti.ATR.calculate({ high: feedHighs, low: feedLows, close: closes, period: 14 });
      if (atrVals.length > 0) atr14 = atrVals[atrVals.length - 1];
    }

    let technicalsNote = "";
    if (withTech && closes.length >= 15) {
      const lines: string[] = [];

      // RSI(14)
      const rsiVals = ti.RSI.calculate({ values: closes, period: 14 });
      if (rsiVals.length > 0)
        lines.push(`RSI(14): ${rsiVals[rsiVals.length - 1].toFixed(2)}`);

      // EMA(50)
      if (closes.length >= 50) {
        const ema50 = ti.EMA.calculate({ values: closes, period: 50 });
        if (ema50.length > 0)
          lines.push(`EMA(50): ${ema50[ema50.length - 1].toFixed(2)}`);
      }

      // EMA(200)
      if (closes.length >= 200) {
        const ema200 = ti.EMA.calculate({ values: closes, period: 200 });
        if (ema200.length > 0)
          lines.push(`EMA(200): ${ema200[ema200.length - 1].toFixed(2)}`);
      }

      // ADX(14)
      if (closes.length >= 28) {
        const adxVals = ti.ADX.calculate({ high: feedHighs, low: feedLows, close: closes, period: 14 });
        if (adxVals.length > 0) {
          const last = adxVals[adxVals.length - 1];
          lines.push(`ADX(14): ${last.adx.toFixed(2)} (DI+: ${last.pdi.toFixed(2)}, DI-: ${last.mdi.toFixed(2)})`);
        }
      }

      // ATR(14)
      const atrPct = (atr14 / lastClose * 100).toFixed(2);
      lines.push(`ATR(14): ${atr14.toFixed(2)} (${atrPct}% of price)`);

      // VWAP — cumulative over the feed window
      if (feedVolumes.some(v => v > 0)) {
        const vwapVals = ti.VWAP.calculate({ high: feedHighs, low: feedLows, close: closes, volume: feedVolumes });
        if (vwapVals.length > 0)
          lines.push(`VWAP: ${vwapVals[vwapVals.length - 1].toFixed(2)}`);
      }

      technicalsNote = lines.join("\n");
    }

    // In backtest mode, cap nForecast to however many actual candles remain
    const rewindSlice        = backtest ? slice.slice(slice.length - rewind) : null;
    const effectiveForecast  = backtest
      ? Math.min(nForecast, rewindSlice!.length)
      : nForecast;

    // Run nRuns independent requests in parallel
    const results = await Promise.all(
      Array.from({ length: nRuns }, () =>
        runOnce(ticker, lastTimestamp, lastClose, effectiveForecast, priceTable, feedSlice.length, tf, technicalsNote)
      )
    );

    // Flatten to nRuns×5 predictions
    const allPredictions: number[][] = results.flatMap(r => r.predictions);

    // Geometric mean in log-space
    const geoMean = (group: number[][], len: number) =>
      Array.from({ length: len }, (_, i) => {
        const avgLogReturn = group.reduce(
          (sum, p) => sum + Math.log(p[i] / lastClose), 0
        ) / group.length;
        return lastClose * Math.exp(avgLogReturn);
      });

    // Sort all paths by their final price; bull = geo-mean of top 2, bear = geo-mean of bottom 2
    const sorted = [...allPredictions].sort((a, b) => a[a.length - 1] - b[b.length - 1]);
    const bear   = geoMean(sorted.slice(0, 2),  effectiveForecast);
    const bull   = geoMean(sorted.slice(-2),     effectiveForecast);
    const base   = geoMean(allPredictions,        effectiveForecast);

    // ── confidence: ATR-normalised outcome spread ────────────────────────────
    // ATR × √nForecast = the "expected" random-walk range over the horizon.
    // We compare that against the actual spread of all predicted final prices.
    //   ratio < 1 → paths converge tighter than noise → model has conviction → high confidence
    //   ratio ≈ 1 → spread matches a random walk → no real edge → medium
    //   ratio > 1 → paths are wider than noise → genuine uncertainty → low confidence
    const finalPrices   = allPredictions.map(p => p[p.length - 1]);
    const meanFinal     = finalPrices.reduce((s, v) => s + v, 0) / finalPrices.length;
    const outcomeRange  = Math.max(...finalPrices) - Math.min(...finalPrices);
    const expectedRange = atr14 * Math.sqrt(effectiveForecast);
    const ratio         = outcomeRange / (expectedRange * 2); // ×2: range spans ±expected
    const confidence    = Math.round(Math.max(0, Math.min(100, 100 - ratio * 60)));

    // Best analysis: pick from the run whose final prices sit closest to the ensemble mean
    const bestRun = results.reduce((best, r) => {
      const dist  = (p: number[]) => Math.abs(p[p.length - 1] - meanFinal);
      const bDist = Math.min(...best.predictions.map(dist));
      const rDist = Math.min(...r.predictions.map(dist));
      return rDist < bDist ? r : best;
    });

    // futureDates:
    // - normal: next N candle timestamps after the last historical bar
    // - backtest: actual historical timestamps from the rewind window
    const futureDates = backtest && rewindSlice
      ? rewindSlice.slice(0, effectiveForecast).map(b => b.time)
      : nextCandleTimes(slice[slice.length - 1].time, effectiveForecast, tf, filterSession);

    // historical always shows the full slice (chart shows all actual prices)
    const historical = bars.slice(-Math.min(nHistory, 120)).map(b => ({ time: b.time, close: b.close }));

    // backtestActuals: actual closes for the forecast window (for the outcome marker)
    const backtestActuals = backtest && rewindSlice
      ? rewindSlice.slice(0, effectiveForecast).map(b => b.close)
      : undefined;

    return NextResponse.json({
      ticker,
      historical,
      lastClose,
      futureDates,
      predictions: allPredictions,
      scenarios: { bear, base, bull },
      confidence,
      analysis: bestRun.analysis,
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
