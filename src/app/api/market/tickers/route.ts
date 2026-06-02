export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import YahooFinanceClass from "yahoo-finance2";

/* eslint-disable @typescript-eslint/no-explicit-any */
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

// Screeners to pull from — each returns up to 50 tickers
const SCREENS = [
  { id: "most_actives",           label: "Most Active" },
  { id: "day_gainers",            label: "Day Gainers" },
  { id: "day_losers",             label: "Day Losers" },
  { id: "undervalued_large_caps", label: "Undervalued Large Cap" },
  { id: "growth_technology_stocks", label: "Growth Tech" },
  { id: "undervalued_growth_stocks", label: "Undervalued Growth" },
  { id: "aggressive_small_caps",  label: "Aggressive Small Cap" },
  { id: "small_cap_gainers",      label: "Small Cap Gainers" },
];

// Anchor tickers always included (major indices / mega-caps)
const ANCHORS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "UNH",
  "MA", "HD", "PG", "JNJ", "COST", "AVGO", "LLY", "KO", "WMT", "NFLX",
  "AMD", "QCOM", "INTC", "CSCO", "ORCL", "IBM", "TXN", "ADBE", "CRM", "NOW",
  "GS", "MS", "BAC", "C", "WFC", "JPM", "AXP", "BLK", "SPGI", "MCO",
  "XOM", "CVX", "COP", "EOG", "SLB", "OXY", "PSX", "VLO", "MPC",
  "LMT", "RTX", "NOC", "GD", "BA", "HON", "GE", "CAT", "DE", "MMM",
  "UNH", "LLY", "JNJ", "MRK", "ABBV", "TMO", "ABT", "BMY", "AMGN", "GILD",
  "SHOP", "UBER", "ABNB", "DASH", "COIN", "PYPL", "SQ", "MELI", "NU",
  "SPY", "QQQ", "IWM", "DIA", "GLD", "TLT",
];

export async function GET() {
  // Fetch all screeners in parallel
  const screenResults = await Promise.all(
    SCREENS.map(async (screen) => {
      try {
        const result: any = await yf.screener(
          { scrIds: screen.id, count: 50 },
          {},
          { validateResult: false }
        );
        const tickers: string[] = (result.quotes ?? [])
          .map((q: any) => q.symbol as string)
          .filter((s: string) => s && !s.includes(".") && !s.includes("^") && s.length <= 5);
        return { label: screen.label, tickers };
      } catch {
        return { label: screen.label, tickers: [] };
      }
    })
  );

  // Merge: anchors first, then screener results
  const seen = new Set<string>(ANCHORS);
  const all: string[] = [...ANCHORS];

  for (const { tickers } of screenResults) {
    for (const t of tickers) {
      if (!seen.has(t)) { seen.add(t); all.push(t); }
    }
  }

  // Build a breakdown for debugging / UI use
  const breakdown = screenResults.map(r => ({ label: r.label, count: r.tickers.length }));

  return NextResponse.json({ tickers: all, total: all.length, breakdown });
}
