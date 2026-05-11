export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getHistory, getQuote } from "@/lib/market/yahoo";
import { computeIndicators, computeSignalSummary } from "@/lib/market/indicators";
import { TIMEFRAMES } from "@/types/market";

async function withConcurrency<T>(
  items: string[],
  limit: number,
  fn: (item: string) => Promise<T>
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(items.length).fill(null);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i]);
      } catch {
        results[i] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const tickers: string[] = body.tickers ?? [];
  const tf: string = body.tf ?? "3M";

  if (!tickers.length) {
    return NextResponse.json({ error: "No tickers" }, { status: 400 });
  }

  const frame = TIMEFRAMES.find((t) => t.value === tf) ?? TIMEFRAMES[3];
  const now = new Date();
  const from = new Date(now.getTime() - frame.days * 24 * 60 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await withConcurrency(tickers, 8, async (ticker) => {
    const [bars, quote] = await Promise.all([
      getHistory(ticker.toUpperCase(), frame.interval as Parameters<typeof getHistory>[1], from),
      getQuote(ticker.toUpperCase()),
    ]);

    if (bars.length < 30) return { ticker, error: true };

    const indicators = computeIndicators(bars);
    const summary = computeSignalSummary(indicators, quote.price);

    return {
      ticker,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      summary,
    };
  });

  const out = raw.map((r, i) => r ?? { ticker: tickers[i], error: true });
  return NextResponse.json(out);
}
