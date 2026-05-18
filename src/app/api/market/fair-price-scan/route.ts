export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinanceClass from "yahoo-finance2";

const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

const safeNum = (val: any): number | undefined => {
  if (val == null) return undefined;
  if (typeof val === "number") return isFinite(val) ? val : undefined;
  if (typeof val === "object" && "raw" in val) {
    const n = val.raw as number;
    return isFinite(n) ? n : undefined;
  }
  return undefined;
};

const SECTOR_ETF: Record<string, string> = {
  "Technology":             "XLK",
  "Healthcare":             "XLV",
  "Consumer Cyclical":      "XLY",
  "Consumer Defensive":     "XLP",
  "Energy":                 "XLE",
  "Financial Services":     "XLF",
  "Industrials":            "XLI",
  "Basic Materials":        "XLB",
  "Real Estate":            "XLRE",
  "Communication Services": "XLC",
  "Utilities":              "XLU",
};

const ERP          = 0.055;
const TAX_RATE     = 0.21;
const TERMINAL_G   = 0.03;
const GROWTH_CAP   = 0.50;

function computeDCF(fcfPerShare: number, growthRate: number, wacc: number): number | null {
  if (wacc <= TERMINAL_G) return null;
  const g = Math.min(growthRate, GROWTH_CAP);
  const fadeRate = g / 2;
  let fcf = fcfPerShare;
  let pv = 0;
  for (let t = 1; t <= 5; t++) { fcf *= (1 + g); pv += fcf / Math.pow(1 + wacc, t); }
  for (let t = 6; t <= 10; t++) { fcf *= (1 + fadeRate); pv += fcf / Math.pow(1 + wacc, t); }
  const tv = (fcf * (1 + TERMINAL_G)) / (wacc - TERMINAL_G);
  pv += tv / Math.pow(1 + wacc, 10);
  return pv;
}

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
      try { results[i] = await fn(items[i]); } catch { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const tickers: string[] = body.tickers ?? [];
  if (!tickers.length) return NextResponse.json({ error: "No tickers" }, { status: 400 });

  // ── Pre-fetch: sector ETF P/Es + risk-free rate ──────────────────────────
  const etfSymbols = [...new Set(Object.values(SECTOR_ETF)), "SPY", "^TNX"];
  const etfQuotes = await withConcurrency(etfSymbols, 8, async (sym) => {
    try {
      const s: any = await yf.quoteSummary(sym, { modules: ["summaryDetail"] });
      return { sym, pe: safeNum(s?.summaryDetail?.trailingPE) };
    } catch { return { sym, pe: undefined }; }
  });

  const etfPEMap: Record<string, number> = {};
  for (const r of etfQuotes) {
    if (r && r.pe != null) etfPEMap[r.sym] = r.pe;
  }
  const spyPE  = etfPEMap["SPY"];

  // ^TNX is a quote, not a summaryDetail — fetch separately
  let rfRate = 0.045;
  try {
    const tnx: any = await yf.quote("^TNX");
    if (tnx?.regularMarketPrice) rfRate = tnx.regularMarketPrice / 100;
  } catch { /* use default */ }

  // ── Per-ticker scan ───────────────────────────────────────────────────────
  const raw = await withConcurrency(tickers, 5, async (ticker) => {
    try {
      const [summary, quote] = await Promise.all([
        yf.quoteSummary(ticker.toUpperCase(), {
          modules: ["defaultKeyStatistics", "summaryDetail", "assetProfile", "financialData", "earningsTrend"],
        }).catch(() => null) as Promise<any>,
        yf.quote(ticker.toUpperCase()).catch(() => null) as Promise<any>,
      ]);

      const ks      = summary?.defaultKeyStatistics;
      const sd      = summary?.summaryDetail;
      const profile = summary?.assetProfile;
      const fd      = summary?.financialData;
      const trend   = summary?.earningsTrend?.trend as any[] | undefined;

      const currentPrice      = safeNum(quote?.regularMarketPrice);
      const trailingEps       = safeNum(ks?.trailingEps);
      const freeCashflow      = safeNum(fd?.freeCashflow);
      const sharesOutstanding = safeNum(ks?.sharesOutstanding);
      const beta              = safeNum(sd?.beta) ?? 1.0;
      const debtToEquityPct   = safeNum(fd?.debtToEquity);
      const sector            = profile?.sector as string | undefined;
      const marketCap         = safeNum(sd?.marketCap);

      // Growth rate (shared between Lynch + DCF)
      let growthDecimal: number | undefined;
      if (trend) {
        const raw5y = safeNum(trend.find((t: any) => t.period === "5y")?.growth);
        if (raw5y != null && raw5y > 0) growthDecimal = raw5y;
      }
      if (growthDecimal == null) {
        const eg = safeNum(fd?.earningsGrowth);
        if (eg != null && eg > 0) growthDecimal = eg;
      }

      // ── Lynch Fair Value ─────────────────────────────────────────────────
      let lynchVal: number | null = null;
      if (trailingEps != null && trailingEps > 0 && growthDecimal != null) {
        const growthPct = Math.min(Math.max(growthDecimal * 100, 0), 50);
        lynchVal = trailingEps * growthPct;
      }

      // ── P/E Relative Valuation ───────────────────────────────────────────
      let peVal: number | null = null;
      if (trailingEps != null && trailingEps > 0) {
        const etfTicker = sector ? SECTOR_ETF[sector] : undefined;
        const sectorPE  = etfTicker ? etfPEMap[etfTicker] : undefined;
        const benchPE   = sectorPE ?? spyPE;
        if (benchPE != null) peVal = trailingEps * benchPE;
      }

      // ── DCF ──────────────────────────────────────────────────────────────
      let dcfVal: number | null = null;
      if (freeCashflow != null && freeCashflow > 0 && sharesOutstanding && growthDecimal != null) {
        const fcfPerShare  = freeCashflow / sharesOutstanding;
        const costOfEquity = rfRate + beta * ERP;
        const costOfDebt   = rfRate + 0.02;
        const deRatio      = debtToEquityPct != null ? debtToEquityPct / 100 : 0;
        const wE = deRatio > 0 ? 1 / (1 + deRatio) : 1;
        const wD = deRatio > 0 ? deRatio / (1 + deRatio) : 0;
        const wacc = wE * costOfEquity + wD * costOfDebt * (1 - TAX_RATE);
        dcfVal = computeDCF(fcfPerShare, growthDecimal, wacc);
      }

      // Exclude any model value whose implied upside exceeds 500 % (data artifact)
      const clamp = (v: number | null) => {
        if (v == null || v <= 0 || currentPrice == null || currentPrice <= 0) return v;
        return ((v - currentPrice) / currentPrice) * 100 > 500 ? null : v;
      };
      const lynchC = clamp(lynchVal);
      const peC    = clamp(peVal);
      const dcfC   = clamp(dcfVal);

      const validVals = [lynchC, peC, dcfC].filter((v): v is number => v != null && v > 0);
      if (validVals.length === 0 || currentPrice == null) return { ticker, error: true };

      const fairPrice = validVals.reduce((s, v) => s + v, 0) / validVals.length;
      const upside    = ((fairPrice - currentPrice) / currentPrice) * 100;

      return {
        ticker,
        name:        quote?.longName ?? quote?.shortName ?? undefined,
        price:       currentPrice,
        changePercent: safeNum(quote?.regularMarketChangePercent),
        fairPrice,
        upside,
        lynchVal:   lynchC,
        peVal:      peC,
        dcfVal:     dcfC,
        modelsUsed: validVals.length,
        marketCap,
      };
    } catch {
      return { ticker, error: true };
    }
  });

  const out = raw
    .filter((r): r is NonNullable<typeof r> => r != null && !("error" in r && r.error))
    .sort((a, b) => (b as any).upside - (a as any).upside);

  return NextResponse.json(out);
}
