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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  try {
    const [summary, quote] = await Promise.all([
      yf.quoteSummary(ticker.toUpperCase(), {
        modules: ["defaultKeyStatistics", "financialData", "earningsTrend"],
      }).catch(() => null) as Promise<any>,
      yf.quote(ticker.toUpperCase()).catch(() => null) as Promise<any>,
    ]);

    const ks = summary?.defaultKeyStatistics;
    const fd = summary?.financialData;
    const trend = summary?.earningsTrend?.trend as any[] | undefined;

    const currentPrice: number | undefined = safeNum(quote?.regularMarketPrice);
    const trailingEps: number | undefined = safeNum(ks?.trailingEps);

    // Peter Lynch uses expected 5-year EPS CAGR (%).
    // Try Yahoo's 5-year analyst growth estimate first, then fall back to TTM earnings growth.
    let growthRate: number | undefined;
    let growthSource = "5Y estimate";

    if (trend) {
      const fiveY = trend.find((t: any) => t.period === "5y");
      const raw5y = safeNum(fiveY?.growth);
      if (raw5y != null && raw5y > 0) {
        growthRate = raw5y * 100; // convert 0.15 → 15
        growthSource = "5Y est.";
      }
    }

    if (growthRate == null) {
      const eg = safeNum(fd?.earningsGrowth);
      if (eg != null && eg > 0) {
        growthRate = eg * 100;
        growthSource = "TTM growth";
      }
    }

    if (growthRate == null || trailingEps == null || trailingEps <= 0) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 200 });
    }

    const cappedGrowth = Math.min(Math.max(growthRate, 0), 50);

    // Peter Lynch Fair Value: Price = EPS × Growth Rate (%)
    // Fair P/E = growth rate → Fair Price = EPS × growth rate
    const fairValue = trailingEps * cappedGrowth;

    const upside =
      currentPrice != null ? ((fairValue - currentPrice) / currentPrice) * 100 : null;

    const peg =
      currentPrice != null && trailingEps > 0
        ? currentPrice / trailingEps / cappedGrowth
        : null;

    return NextResponse.json({
      fairValue,
      currentPrice: currentPrice ?? null,
      trailingEps,
      growthRate: cappedGrowth,
      growthSource,
      upside,
      peg,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
