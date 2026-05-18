export const runtime = "nodejs";
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

// Map Yahoo Finance sector names → SPDR sector ETF tickers
const SECTOR_ETF: Record<string, { etf: string; label: string }> = {
  "Technology":              { etf: "XLK",  label: "Technology" },
  "Healthcare":              { etf: "XLV",  label: "Healthcare" },
  "Consumer Cyclical":       { etf: "XLY",  label: "Consumer Disc." },
  "Consumer Defensive":      { etf: "XLP",  label: "Consumer Staples" },
  "Energy":                  { etf: "XLE",  label: "Energy" },
  "Financial Services":      { etf: "XLF",  label: "Financials" },
  "Industrials":             { etf: "XLI",  label: "Industrials" },
  "Basic Materials":         { etf: "XLB",  label: "Materials" },
  "Real Estate":             { etf: "XLRE", label: "Real Estate" },
  "Communication Services":  { etf: "XLC",  label: "Comm. Services" },
  "Utilities":               { etf: "XLU",  label: "Utilities" },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  try {
    // First pass: get stock fundamentals + sector
    const [summary, quote] = await Promise.all([
      yf.quoteSummary(ticker.toUpperCase(), {
        modules: ["defaultKeyStatistics", "summaryDetail", "assetProfile", "financialData"],
      }).catch(() => null) as Promise<any>,
      yf.quote(ticker.toUpperCase()).catch(() => null) as Promise<any>,
    ]);

    const ks      = summary?.defaultKeyStatistics;
    const detail  = summary?.summaryDetail;
    const profile = summary?.assetProfile;
    const fd      = summary?.financialData;

    const currentPrice  = safeNum(quote?.regularMarketPrice);
    const trailingEps   = safeNum(ks?.trailingEps);
    const forwardEps    = safeNum(ks?.forwardEps);
    const trailingPE    = safeNum(detail?.trailingPE);
    const forwardPE     = safeNum(detail?.forwardPE);
    const sector        = profile?.sector as string | undefined;

    // Analyst data lives in financialData
    const analystTarget = safeNum(fd?.targetMeanPrice);
    const analystHigh   = safeNum(fd?.targetHighPrice);
    const analystLow    = safeNum(fd?.targetLowPrice);
    const analystCount  = safeNum(fd?.numberOfAnalystOpinions);
    const recKey        = fd?.recommendationKey as string | undefined;

    // Second pass: fetch sector ETF P/E as the comparable multiple
    const etfInfo = sector ? SECTOR_ETF[sector] : undefined;
    let sectorPE: number | undefined;

    if (etfInfo) {
      try {
        const etfSummary: any = await yf.quoteSummary(etfInfo.etf, {
          modules: ["summaryDetail"],
        });
        sectorPE = safeNum(etfSummary?.summaryDetail?.trailingPE);
      } catch { /* leave undefined */ }
    }

    // Fall back to SPY if no sector match or ETF P/E unavailable
    if (sectorPE == null) {
      try {
        const spy: any = await yf.quoteSummary("SPY", { modules: ["summaryDetail"] });
        sectorPE = safeNum(spy?.summaryDetail?.trailingPE);
      } catch { /* leave undefined */ }
    }

    if (trailingEps == null || trailingEps <= 0) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 200 });
    }

    // Fair Value = EPS × Sector P/E (core relative valuation formula)
    const fairValueTrailing = sectorPE != null ? trailingEps * sectorPE : null;
    const fairValueForward  = sectorPE != null && forwardEps != null && forwardEps > 0
      ? forwardEps * sectorPE : null;

    // Premium / discount vs sector: how much more expensive (or cheaper) is this stock
    const premiumDiscount = sectorPE != null && trailingPE != null
      ? ((trailingPE / sectorPE) - 1) * 100 : null;

    // Upside to fair value (trailing basis)
    const upsideTrailing = fairValueTrailing != null && currentPrice != null
      ? ((fairValueTrailing - currentPrice) / currentPrice) * 100 : null;

    // Upside to analyst target
    const upsideAnalyst = analystTarget != null && currentPrice != null
      ? ((analystTarget - currentPrice) / currentPrice) * 100 : null;

    return NextResponse.json({
      trailingEps,
      forwardEps:       forwardEps ?? null,
      trailingPE:       trailingPE ?? null,
      forwardPE:        forwardPE ?? null,
      sectorPE:         sectorPE ?? null,
      sectorLabel:      etfInfo?.label ?? "Market",
      etfTicker:        etfInfo?.etf ?? "SPY",
      fairValueTrailing: fairValueTrailing ?? null,
      fairValueForward:  fairValueForward ?? null,
      premiumDiscount:   premiumDiscount ?? null,
      upsideTrailing:    upsideTrailing ?? null,
      currentPrice:      currentPrice ?? null,
      analystTarget:     analystTarget ?? null,
      analystHigh:       analystHigh ?? null,
      analystLow:        analystLow ?? null,
      analystCount:      analystCount ?? null,
      recommendation:    recKey ?? null,
      sector:            sector ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
