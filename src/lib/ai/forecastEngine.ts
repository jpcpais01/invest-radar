// Shared LLM price-forecast engine.
// Used by both /api/ai/forecast (single forecast) and
// /api/ai/strategy-backtest (walk-forward backtest).

import Anthropic from "@anthropic-ai/sdk";
import * as ti from "technicalindicators";
import { OHLCVBar } from "@/types/market";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── timeframe helpers ────────────────────────────────────────────────────────
export type TF = "1m" | "5m" | "1h" | "1d";

export const INTERVAL_SEC: Record<TF, number>    = { "1m": 60,  "5m": 300, "1h": 3600, "1d": 86400 };
export const CANDLES_PER_DAY: Record<TF, number> = { "1m": 390, "5m": 78,  "1h": 7,    "1d": 1 };
export const TF_LABEL: Record<TF, string>        = { "1m": "1-minute", "5m": "5-minute", "1h": "hourly", "1d": "daily" };

/** Human-readable label for an individual candle */
export function candleLabel(tf: TF) {
  return tf === "1d" ? "day" : tf === "1h" ? "hour" : tf === "5m" ? "5 minutes" : "minute";
}

/** Crypto tickers on Yahoo use a hyphen (BTC-USD). Crypto trades 24/7 — never session-filtered. */
export function isCrypto(ticker: string): boolean {
  return ticker.includes("-");
}

/** Minutes since local midnight in America/New_York for a Unix timestamp. */
export function nyMinutes(sec: number): number {
  const s = new Date(sec * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** Regular session: 09:30–16:00 ET inclusive */
export function isRegularSession(sec: number): boolean {
  const mins = nyMinutes(sec);
  return mins >= 570 && mins <= 960;
}

/**
 * Generate the next `n` future candle timestamps after `fromSec`.
 * Skips weekends. For non-crypto intraday, also skips pre/after-market.
 */
export function nextCandleTimes(fromSec: number, n: number, tf: TF, filterSession: boolean): number[] {
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

/** Format a bar timestamp for the price table fed to the model.
 *  Daily bars: YYYY-MM-DD. Intraday: "YYYY-MM-DD HH:MM ET". */
export function fmtTime(sec: number, tf: TF): string {
  const d = new Date(sec * 1000);
  if (tf === "1d") {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} ET`;
}

// ── technicals ───────────────────────────────────────────────────────────────

/** ATR(14) over a window of bars. Falls back to 1% of price if too few bars. */
export function computeAtr14(bars: OHLCVBar[], fallbackPrice: number): number {
  const closes = bars.map(b => b.close);
  if (closes.length < 15) return fallbackPrice * 0.01;
  const highs = bars.map(b => b.high ?? b.close);
  const lows  = bars.map(b => b.low  ?? b.close);
  const atrVals = ti.ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  return atrVals.length > 0 ? atrVals[atrVals.length - 1] : fallbackPrice * 0.01;
}

/** Last-candle technical indicator summary, fed to the model when technicals are on. */
export function buildTechnicalsNote(bars: OHLCVBar[], lastClose: number, atr14: number): string {
  const closes = bars.map(b => b.close);
  if (closes.length < 15) return "";
  const highs   = bars.map(b => b.high   ?? b.close);
  const lows    = bars.map(b => b.low    ?? b.close);
  const volumes = bars.map(b => b.volume ?? 0);
  const lines: string[] = [];

  const rsiVals = ti.RSI.calculate({ values: closes, period: 14 });
  if (rsiVals.length > 0) lines.push(`RSI(14): ${rsiVals[rsiVals.length - 1].toFixed(2)}`);

  if (closes.length >= 50) {
    const ema50 = ti.EMA.calculate({ values: closes, period: 50 });
    if (ema50.length > 0) lines.push(`EMA(50): ${ema50[ema50.length - 1].toFixed(2)}`);
  }
  if (closes.length >= 200) {
    const ema200 = ti.EMA.calculate({ values: closes, period: 200 });
    if (ema200.length > 0) lines.push(`EMA(200): ${ema200[ema200.length - 1].toFixed(2)}`);
  }
  if (closes.length >= 28) {
    const adxVals = ti.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
    if (adxVals.length > 0) {
      const last = adxVals[adxVals.length - 1];
      lines.push(`ADX(14): ${last.adx.toFixed(2)} (DI+: ${last.pdi.toFixed(2)}, DI-: ${last.mdi.toFixed(2)})`);
    }
  }
  lines.push(`ATR(14): ${atr14.toFixed(2)} (${(atr14 / lastClose * 100).toFixed(2)}% of price)`);

  if (volumes.some(v => v > 0)) {
    const vwapVals = ti.VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes });
    if (vwapVals.length > 0) lines.push(`VWAP: ${vwapVals[vwapVals.length - 1].toFixed(2)}`);
  }

  return lines.join("\n");
}

/** Price table fed to the model — one line per candle. */
export function buildPriceTable(bars: OHLCVBar[], tf: TF): string {
  return bars.map(b => `${fmtTime(b.time, tf)} | ${b.close.toFixed(2)}`).join("\n");
}

// ── AI call ──────────────────────────────────────────────────────────────────
export interface RunResult { predictions: number[][]; confidence: number; analysis: string }

/** One independent model call → 5 candidate price paths. */
export async function runOnce(
  ticker: string,
  lastTimestamp: string,
  lastClose: number,
  nForecast: number,
  priceTable: string,
  nHistory: number,
  tf: TF,
  technicalsNote: string,
): Promise<RunResult> {
  const tfLabel = TF_LABEL[tf];

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

// ── aggregation ──────────────────────────────────────────────────────────────
export interface Aggregated {
  predictions: number[][];                                  // every raw path, nRuns × 5
  scenarios:   { bear: number[]; base: number[]; bull: number[] };
  confidence:  number;                                      // 0–100, ATR-normalised ensemble agreement
  analysis:    string;
  meanFinal:   number;                                      // mean of all path final prices
}

/**
 * Collapse the nRuns × 5 raw paths into bear / base / bull scenarios + a confidence score.
 *   base = geometric mean of every path
 *   bull = geometric mean of the 2 highest-ending paths
 *   bear = geometric mean of the 2 lowest-ending paths
 *   confidence = how tightly the ensemble agrees, normalised by ATR × √horizon
 */
export function aggregate(
  results: RunResult[],
  lastClose: number,
  atr14: number,
  nForecast: number,
): Aggregated {
  const allPredictions: number[][] = results.flatMap(r => r.predictions);

  const geoMean = (group: number[][], len: number) =>
    Array.from({ length: len }, (_, i) => {
      const avgLogReturn = group.reduce(
        (sum, p) => sum + Math.log(p[i] / lastClose), 0,
      ) / group.length;
      return lastClose * Math.exp(avgLogReturn);
    });

  const sorted = [...allPredictions].sort((a, b) => a[a.length - 1] - b[b.length - 1]);
  const bear   = geoMean(sorted.slice(0, 2),  nForecast);
  const bull   = geoMean(sorted.slice(-2),    nForecast);
  const base   = geoMean(allPredictions,      nForecast);

  // confidence: for a pure random walk, std(final prices) ≈ ATR × √nForecast.
  const finalPrices = allPredictions.map(p => p[p.length - 1]);
  const meanFinal   = finalPrices.reduce((s, v) => s + v, 0) / finalPrices.length;
  const stdFinal    = Math.sqrt(finalPrices.reduce((s, v) => s + (v - meanFinal) ** 2, 0) / finalPrices.length);
  const ratio       = stdFinal / (atr14 * Math.sqrt(nForecast));
  const confidence  = Math.round(Math.max(0, Math.min(100, 100 - ratio * 50)));

  // pick the analysis sentence from the run sitting closest to the ensemble mean
  const bestRun = results.reduce((best, r) => {
    const dist  = (p: number[]) => Math.abs(p[p.length - 1] - meanFinal);
    const bDist = Math.min(...best.predictions.map(dist));
    const rDist = Math.min(...r.predictions.map(dist));
    return rDist < bDist ? r : best;
  });

  return { predictions: allPredictions, scenarios: { bear, base, bull }, confidence, analysis: bestRun.analysis, meanFinal };
}
