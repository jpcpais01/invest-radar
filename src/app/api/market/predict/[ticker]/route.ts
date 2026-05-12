export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import Together from "together-ai";
import { getHistory } from "@/lib/market/yahoo";

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY ?? "" });

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
  const resp = await together.chat.completions.create({
    model: "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo",
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const text = resp.choices[0]?.message?.content ?? "";
  const match = text.match(/\[[\d.,\s\-eE+]+\]/);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr: number[] = JSON.parse(match ? match[0] : text) as any;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("Invalid response");
  const last = prices[prices.length - 1];
  while (arr.length < n) arr.push(arr[arr.length - 1] ?? last);
  return arr.slice(0, n).map(Number);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const n    = Math.min(30, Math.max(1, parseInt(req.nextUrl.searchParams.get("n")    ?? "7")));
  const runs = Math.min(20, Math.max(1, parseInt(req.nextUrl.searchParams.get("runs") ?? "5")));

  try {
    const from = new Date(Date.now() - 160 * 86400000);
    const bars = await getHistory(ticker.toUpperCase(), "1d", from);
    const closes = bars.map((b) => b.close).slice(-100);

    if (closes.length < 10) {
      return NextResponse.json({ error: "Insufficient historical data" }, { status: 400 });
    }

    const settled = await Promise.allSettled(
      Array.from({ length: runs }, () => runPrediction(closes, n))
    );

    const successful = settled
      .filter((r): r is PromiseFulfilledResult<number[]> => r.status === "fulfilled")
      .map((r) => r.value);

    if (successful.length === 0) {
      return NextResponse.json({ error: "All prediction runs failed" }, { status: 500 });
    }

    const mean = Array.from({ length: n }, (_, i) =>
      successful.reduce((s, run) => s + run[i], 0) / successful.length
    );

    const futureDates = nextTradingDays(bars[bars.length - 1].time, n);

    return NextResponse.json({
      historical:    bars.slice(-60).map((b) => ({ time: b.time, close: b.close })),
      futureDates,
      runs:          successful,
      mean,
      n,
      successfulRuns: successful.length,
      totalRuns:      runs,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
