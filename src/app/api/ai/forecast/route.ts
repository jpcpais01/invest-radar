export const runtime    = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getHistory } from "@/lib/market/yahoo";
import * as ti from "technicalindicators";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── timeframe helpers ────────────────────────────────────────────────────────
type TF = "5m" | "1h" | "1d";

const INTERVAL_SEC: Record<TF, number>      = { "5m": 300,  "1h": 3600, "1d": 86400 };
const CANDLES_PER_DAY: Record<TF, number>   = { "5m": 78,   "1h": 7,    "1d": 1 };
const TF_LABEL: Record<TF, string>          = { "5m": "5-minute", "1h": "hourly", "1d": "daily" };

/** Human-readable label for an individual candle */
function candleLabel(tf: TF) {
  return tf === "1d" ? "day" : tf === "1h" ? "hour" : "5 minutes";
}

/**
 * Generate the next `n` future candle timestamps after `fromSec`.
 * Skips UTC weekends for all timeframes; daily also skips by exact day boundary.
 */
function nextCandleTimes(fromSec: number, n: number, tf: TF): number[] {
  const step = INTERVAL_SEC[tf];
  const times: number[] = [];
  let t = fromSec;
  while (times.length < n) {
    t += step;
    const day = new Date(t * 1000).getUTCDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) times.push(t);
  }
  return times;
}

/** Format a bar timestamp for the price table */
function fmtTime(sec: number, tf: TF): string {
  const d = new Date(sec * 1000);
  if (tf === "1d") return d.toISOString().split("T")[0];
  // "2024-01-15 14:30" UTC
  return d.toISOString().replace("T", " ").slice(0, 16);
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

  const systemPrompt = `You are a quantitative price forecasting model. Analyze the ${tfLabel} closing price history and produce 3 independent price predictions.

Output ONLY valid JSON — no other text, no markdown fences:
{"predictions":[[${nForecast} numbers],[${nForecast} numbers],[${nForecast} numbers]],"confidence":<integer 0-100>,"analysis":"one concise sentence"}

Rules:
- predictions: exactly 3 arrays, each with exactly ${nForecast} positive numbers (${tfLabel} closing prices, oldest first)
- Each array represents a sequence of future closing prices, one per ${unitLabel}
- Each prediction must be a genuinely independent plausible path — vary them meaningfully, not just noise
- Prices must be realistic and anchored to the last close of $${lastClose.toFixed(2)}
- confidence: your 0-100 estimate of how predictable this asset is at the ${tfLabel} timeframe (100 = very high conviction)
- analysis: one sentence summarising the dominant signal driving your ${tfLabel} forecast`;

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
    max_tokens: 512,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw   = msg.content[0].type === "text" ? msg.content[0].text : "";
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
  const withTech    = sp.get("technicals") === "true";
  const backtest    = sp.get("backtest") === "true";
  const rewind      = Math.min(60,  Math.max(15, parseInt(sp.get("rewind")      ?? "30")));

  // Validate timeframe
  const rawTF = sp.get("timeframe") ?? "1d";
  const tf: TF = (rawTF === "5m" || rawTF === "1h" || rawTF === "1d") ? rawTF : "1d";

  try {
    // Fetch enough calendar days to cover nHistory candles
    // e.g. for 5m (78 candles/day): 90 candles → ~2 days needed; fetch 10× buffer + 10 to be safe
    const candlesPerDay = CANDLES_PER_DAY[tf];
    const calDays = Math.ceil(nHistory / candlesPerDay * 1.6) + 10;
    const from    = new Date(Date.now() - calDays * 86400000);

    const yahooInterval = tf; // "5m" | "1h" | "1d" all accepted by getHistory
    const bars = await getHistory(ticker, yahooInterval, from);

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

      // ADX(14) — use feedSlice highs/lows
      const feedHighs = feedSlice.map(b => b.high ?? b.close);
      const feedLows  = feedSlice.map(b => b.low  ?? b.close);
      if (closes.length >= 28) {
        const adxVals = ti.ADX.calculate({ high: feedHighs, low: feedLows, close: closes, period: 14 });
        if (adxVals.length > 0) {
          const last = adxVals[adxVals.length - 1];
          lines.push(`ADX(14): ${last.adx.toFixed(2)} (DI+: ${last.pdi.toFixed(2)}, DI-: ${last.mdi.toFixed(2)})`);
        }
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

    // Flatten to nRuns×3 predictions
    const allPredictions: number[][] = results.flatMap(r => r.predictions);

    // Geometric mean in log-space
    const geoMean = (group: number[][], len: number) =>
      Array.from({ length: len }, (_, i) => {
        const avgLogReturn = group.reduce(
          (sum, p) => sum + Math.log(p[i] / lastClose), 0
        ) / group.length;
        return lastClose * Math.exp(avgLogReturn);
      });

    const sorted = [...allPredictions].sort((a, b) => a[a.length - 1] - b[b.length - 1]);
    const third  = Math.max(1, Math.floor(sorted.length / 3));
    const bear   = geoMean(sorted.slice(0, third), effectiveForecast);
    const bull   = geoMean(sorted.slice(-third),   effectiveForecast);
    const base   = geoMean(allPredictions,          effectiveForecast);

    const confidence = Math.round(
      results.reduce((s, r) => s + r.confidence, 0) / results.length
    );
    const bestRun = results.reduce((best, r) =>
      r.confidence > best.confidence ? r : best
    );

    // futureDates:
    // - normal: next N candle timestamps after the last historical bar
    // - backtest: actual historical timestamps from the rewind window
    const futureDates = backtest && rewindSlice
      ? rewindSlice.slice(0, effectiveForecast).map(b => b.time)
      : nextCandleTimes(slice[slice.length - 1].time, effectiveForecast, tf);

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
