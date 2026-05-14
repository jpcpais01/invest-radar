export const runtime    = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getHistory } from "@/lib/market/yahoo";
import * as ti from "technicalindicators";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function nextTradingDays(fromSec: number, n: number): number[] {
  const days: number[] = [];
  let d = new Date(fromSec * 1000);
  while (days.length < n) {
    d = new Date(d.getTime() + 86400000);
    if (d.getDay() !== 0 && d.getDay() !== 6)
      days.push(Math.floor(d.getTime() / 1000));
  }
  return days;
}

interface RunResult { predictions: number[][]; confidence: number; analysis: string }

async function runOnce(
  ticker: string,
  lastDate: string,
  lastClose: number,
  nForecast: number,
  priceTable: string,
  nHistory: number,
  technicalsNote: string,
): Promise<RunResult> {
  const systemPrompt = `You are a quantitative price forecasting model. Analyze the daily closing price history and produce 3 independent price predictions.

Output ONLY valid JSON — no other text, no markdown fences:
{"predictions":[[${nForecast} numbers],[${nForecast} numbers],[${nForecast} numbers]],"confidence":<integer 0-100>,"analysis":"one concise sentence"}

Rules:
- predictions: exactly 3 arrays, each with exactly ${nForecast} positive numbers (daily closing prices, oldest first)
- Each prediction must be a genuinely independent plausible path — vary them meaningfully, not just noise
- Prices must be realistic and anchored to the last close of $${lastClose.toFixed(2)}
- confidence: your 0-100 estimate of how predictable this stock is (100 = very high conviction)
- analysis: one sentence summarising the dominant signal driving your forecast`;

  const techSection = technicalsNote
    ? `\nLast-day technical indicators:\n${technicalsNote}\n`
    : "";

  const userMessage = `Stock: ${ticker}
Last close (${lastDate}): $${lastClose.toFixed(2)}
Predict the next ${nForecast} trading day closing prices.
${techSection}
Historical daily closing prices — ${nHistory} trading days, oldest to newest:
Date       | Close
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

export async function GET(req: NextRequest) {
  const sp          = req.nextUrl.searchParams;
  const ticker      = (sp.get("ticker")     ?? "AAPL").toUpperCase();
  const nHistory    = Math.min(252, Math.max(30, parseInt(sp.get("nHistory")    ?? "90")));
  const nForecast   = Math.min(30,  Math.max(3,  parseInt(sp.get("nForecast")   ?? "15")));
  const nRuns       = Math.min(10,  Math.max(1,  parseInt(sp.get("nRuns")       ?? "3")));
  const withTech    = sp.get("technicals") === "true";

  try {
    // Fetch enough calendar days to cover nHistory trading days
    const calDays = Math.ceil(nHistory * 1.5) + 30;
    const from    = new Date(Date.now() - calDays * 86400000);
    const bars    = await getHistory(ticker, "1d", from);

    if (bars.length < 20)
      return NextResponse.json({ error: "Insufficient historical data" }, { status: 400 });

    const slice     = bars.slice(-nHistory);
    const closes    = slice.map(b => b.close);
    const lastClose = closes[closes.length - 1];
    const lastDate  = new Date(slice[slice.length - 1].time * 1000).toISOString().split("T")[0];

    // Build compact price-only table
    const priceTable = slice
      .map(b => `${new Date(b.time * 1000).toISOString().split("T")[0]} | ${b.close.toFixed(2)}`)
      .join("\n");

    // ── optional last-bar technicals ─────────────────────────────────────────
    let technicalsNote = "";
    if (withTech && closes.length >= 26) {
      const lines: string[] = [];

      // RSI(14)
      if (closes.length >= 15) {
        const rsiVals = ti.RSI.calculate({ values: closes, period: 14 });
        if (rsiVals.length > 0)
          lines.push(`RSI(14): ${rsiVals[rsiVals.length - 1].toFixed(2)}`);
      }

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

      // ADX(14) — needs high/low/close
      const highs  = slice.map(b => b.high  ?? b.close);
      const lows   = slice.map(b => b.low   ?? b.close);
      if (closes.length >= 28) {
        const adxVals = ti.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
        if (adxVals.length > 0) {
          const last = adxVals[adxVals.length - 1];
          lines.push(`ADX(14): ${last.adx.toFixed(2)} (DI+: ${last.pdi.toFixed(2)}, DI-: ${last.mdi.toFixed(2)})`);
        }
      }

      technicalsNote = lines.join("\n");
    }

    // Run nRuns independent requests in parallel (each returns 3 paths → nRuns×3 total)
    const results = await Promise.all(
      Array.from({ length: nRuns }, () =>
        runOnce(ticker, lastDate, lastClose, nForecast, priceTable, slice.length, technicalsNote)
      )
    );

    // Flatten to nRuns×3 predictions
    const allPredictions: number[][] = results.flatMap(r => r.predictions);

    // Geometric mean in log-space: average log-returns from lastClose,
    // then exponentiate back. Eliminates arithmetic upside bias.
    const geoMean = (group: number[][]) =>
      Array.from({ length: nForecast }, (_, i) => {
        const avgLogReturn = group.reduce(
          (sum, p) => sum + Math.log(p[i] / lastClose), 0
        ) / group.length;
        return lastClose * Math.exp(avgLogReturn);
      });

    // Sort by final price to pick bull / bear
    const sorted = [...allPredictions].sort(
      (a, b) => a[a.length - 1] - b[b.length - 1]
    );
    const third = Math.max(1, Math.floor(sorted.length / 3));
    const bear  = geoMean(sorted.slice(0, third));        // worst third
    const bull  = geoMean(sorted.slice(-third));          // best third
    const base  = geoMean(allPredictions);                // all paths

    const confidence = Math.round(
      results.reduce((s, r) => s + r.confidence, 0) / results.length
    );

    // Pick the analysis from the most confident run
    const bestRun = results.reduce((best, r) =>
      r.confidence > best.confidence ? r : best
    );

    const futureDates = nextTradingDays(slice[slice.length - 1].time, nForecast);
    const historical  = bars.slice(-Math.min(nHistory, 120)).map(b => ({ time: b.time, close: b.close }));

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
      nForecast,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
