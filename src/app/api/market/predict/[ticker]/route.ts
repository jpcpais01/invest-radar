export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import Together from "together-ai";
import { getHistory } from "@/lib/market/yahoo";

const together = new Together();
const PREDICT_MODEL = "deepseek-ai/DeepSeek-V4-Pro";

function nextTradingDays(fromSec: number, n: number): number[] {
  const days: number[] = [];
  let d = new Date(fromSec * 1000);
  while (days.length < n) {
    d = new Date(d.getTime() + 86400000);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(Math.floor(d.getTime() / 1000));
  }
  return days;
}

async function runPrediction(prices: number[], n: number): Promise<number[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = await (together.chat.completions.create as any)({
    model: PREDICT_MODEL,
    messages: [
      {
        role: "system",
        content: `You are a price forecasting model. Respond with ONLY a JSON array of exactly ${n} numbers. No explanation, no markdown, no other text.`,
      },
      {
        role: "user",
        content: `These are the latest daily closing prices of a stock (oldest to newest): [${prices.map((p) => p.toFixed(2)).join(", ")}]. Predict the next ${n} daily closing prices. Respond with ONLY a JSON array of exactly ${n} numbers.`,
      },
    ],
    max_tokens: Math.max(200, n * 20),
    temperature: 0.85,
    stream: false,
    reasoning: { enabled: false },
  });

  const text: string = resp.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty response from model");

  // Extract JSON array — handle markdown code fences and surrounding text
  const match = text.match(/\[[\d.,\s\-eE+]+\]/);
  if (!match) throw new Error(`No array found in: ${text.slice(0, 120)}`);

  const arr: number[] = JSON.parse(match[0]);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("Parsed empty array");

  const last = prices[prices.length - 1];
  while (arr.length < n) arr.push(arr[arr.length - 1] ?? last);
  return arr.slice(0, n).map(Number);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const n       = Math.min(30,  Math.max(1,  parseInt(req.nextUrl.searchParams.get("n")       ?? "7")));
  const runs    = Math.min(20,  Math.max(1,  parseInt(req.nextUrl.searchParams.get("runs")    ?? "5")));
  const history = Math.min(252, Math.max(20, parseInt(req.nextUrl.searchParams.get("history") ?? "90")));

  try {
    const calendarDays = Math.ceil(history * 1.5) + 30;
    const from = new Date(Date.now() - calendarDays * 86400000);
    const bars = await getHistory(ticker.toUpperCase(), "1d", from);
    const closes = bars.map((b) => b.close).slice(-history);

    if (closes.length < 10) {
      return NextResponse.json({ error: "Insufficient historical data" }, { status: 400 });
    }

    const settled = await Promise.allSettled(
      Array.from({ length: runs }, () => runPrediction(closes, n))
    );

    const successful = settled
      .filter((r): r is PromiseFulfilledResult<number[]> => r.status === "fulfilled")
      .map((r) => r.value);

    // Surface the actual errors so they're visible during debugging
    const errors = settled
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason));

    if (successful.length === 0) {
      return NextResponse.json(
        { error: "All prediction runs failed", details: errors },
        { status: 500 }
      );
    }

    const mean = Array.from({ length: n }, (_, i) =>
      successful.reduce((s, run) => s + run[i], 0) / successful.length
    );

    const futureDates = nextTradingDays(bars[bars.length - 1].time, n);

    return NextResponse.json({
      historical:     bars.slice(-Math.min(history, 120)).map((b) => ({ time: b.time, close: b.close })),
      futureDates,
      runs:           successful,
      mean,
      n,
      successfulRuns: successful.length,
      totalRuns:      runs,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
