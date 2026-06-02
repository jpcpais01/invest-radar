export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import YahooFinanceClass from "yahoo-finance2";

/* eslint-disable @typescript-eslint/no-explicit-any */
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

// All available screeners — market cap is included in their results
const ALL_SCREENS = [
  "most_actives",
  "day_gainers",
  "day_losers",
  "undervalued_large_caps",
  "growth_technology_stocks",
  "undervalued_growth_stocks",
  "aggressive_small_caps",
  "small_cap_gainers",
];

// When a market cap filter is active, bias toward relevant screeners
function screensForMcap(mcapMin?: number, mcapMax?: number): string[] {
  if (mcapMax != null && mcapMax <= 20e9)
    return ["aggressive_small_caps", "small_cap_gainers", "day_gainers", "day_losers", "most_actives"];
  if (mcapMin != null && mcapMin >= 50e9)
    return ["undervalued_large_caps", "undervalued_growth_stocks", "growth_technology_stocks", "most_actives", "day_gainers"];
  return ALL_SCREENS;
}

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const mcapMin = sp.has("mcapMin") ? Number(sp.get("mcapMin")) : undefined;
  const mcapMax = sp.has("mcapMax") ? Number(sp.get("mcapMax")) : undefined;

  const screens = screensForMcap(mcapMin, mcapMax);

  // Fetch screeners in parallel — each result includes marketCap
  const screenResults = await Promise.all(
    screens.map(async (id) => {
      try {
        const result: any = await yf.screener(
          { scrIds: id, count: 250 },
          {},
          { validateResult: false }
        );
        return (result.quotes ?? []) as any[];
      } catch { return []; }
    })
  );

  // Flatten + deduplicate, keeping quote objects for mcap filtering
  const seen = new Set<string>();
  const quotes: any[] = [];
  for (const batch of screenResults) {
    for (const q of batch) {
      const sym: string = q.symbol ?? "";
      if (!sym || sym.includes(".") || sym.includes("^") || sym.length > 5) continue;
      if (seen.has(sym)) continue;
      seen.add(sym);
      quotes.push(q);
    }
  }

  // Apply market cap filter (marketCap is present in screener quotes)
  const filtered = quotes.filter((q) => {
    const mc: number | undefined = q.marketCap;
    if (mc == null) return true; // keep if unknown — scan will decide
    if (mcapMin != null && mc < mcapMin) return false;
    if (mcapMax != null && mc >= mcapMax) return false;
    return true;
  });

  const tickers = filtered.map((q) => q.symbol as string);

  return NextResponse.json({ tickers, total: tickers.length });
}
