export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/market/yahoo";

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = param
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);

  if (!tickers.length) return NextResponse.json({});

  const entries = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const q = await getQuote(ticker);
        return [ticker, q.name ?? ticker] as const;
      } catch {
        return [ticker, ticker] as const;
      }
    })
  );

  return NextResponse.json(Object.fromEntries(entries));
}
