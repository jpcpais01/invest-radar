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

// Equity Risk Premium (Damodaran US estimate)
const ERP = 0.055;
// Corporate tax rate
const TAX_RATE = 0.21;
// Terminal growth rate (long-run nominal GDP)
const TERMINAL_GROWTH = 0.03;
// Projection years: 5 at analyst growth, 5 more at half that rate
const HIGH_GROWTH_YEARS = 5;
const FADE_YEARS = 5;

function runDCF(
  fcfPerShare: number,
  growthRate: number,  // decimal, e.g. 0.15
  wacc: number         // decimal
): { intrinsicValue: number; pvHighGrowth: number; pvFade: number; pvTerminal: number; years: { year: number; fcf: number; pv: number }[] } {
  const fadeRate = growthRate / 2;
  const years: { year: number; fcf: number; pv: number }[] = [];
  let fcf = fcfPerShare;
  let pvHighGrowth = 0;
  let pvFade = 0;

  for (let t = 1; t <= HIGH_GROWTH_YEARS; t++) {
    fcf = fcf * (1 + growthRate);
    const pv = fcf / Math.pow(1 + wacc, t);
    pvHighGrowth += pv;
    years.push({ year: t, fcf, pv });
  }

  for (let t = HIGH_GROWTH_YEARS + 1; t <= HIGH_GROWTH_YEARS + FADE_YEARS; t++) {
    fcf = fcf * (1 + fadeRate);
    const pv = fcf / Math.pow(1 + wacc, t);
    pvFade += pv;
    years.push({ year: t, fcf, pv });
  }

  // Terminal value using Gordon Growth Model on year-10 FCF
  const terminalFCF = fcf * (1 + TERMINAL_GROWTH);
  const terminalValue = terminalFCF / (wacc - TERMINAL_GROWTH);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, HIGH_GROWTH_YEARS + FADE_YEARS);

  return {
    intrinsicValue: pvHighGrowth + pvFade + pvTerminal,
    pvHighGrowth,
    pvFade,
    pvTerminal,
    years,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  try {
    const [summary, quote, tnx] = await Promise.all([
      yf.quoteSummary(ticker.toUpperCase(), {
        modules: ["defaultKeyStatistics", "summaryDetail", "financialData", "earningsTrend"],
      }).catch(() => null) as Promise<any>,
      yf.quote(ticker.toUpperCase()).catch(() => null) as Promise<any>,
      yf.quote("^TNX").catch(() => null) as Promise<any>,
    ]);

    const ks    = summary?.defaultKeyStatistics;
    const sd    = summary?.summaryDetail;
    const fd    = summary?.financialData;
    const trend = summary?.earningsTrend?.trend as any[] | undefined;

    const currentPrice     = safeNum(quote?.regularMarketPrice);
    const freeCashflow     = safeNum(fd?.freeCashflow);
    const sharesOutstanding = safeNum(ks?.sharesOutstanding);
    const beta             = safeNum(sd?.beta) ?? 1.0;
    // Yahoo returns debtToEquity as a percentage (e.g. 150 = 150% D/E = ratio of 1.5)
    const debtToEquityPct  = safeNum(fd?.debtToEquity);

    // Need positive FCF to run DCF
    if (!freeCashflow || freeCashflow <= 0 || !sharesOutstanding || sharesOutstanding === 0) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 200 });
    }

    const fcfPerShare = freeCashflow / sharesOutstanding;

    // Live risk-free rate from ^TNX (US 10Y Treasury yield %)
    const rfRate = tnx?.regularMarketPrice ? tnx.regularMarketPrice / 100 : 0.045;

    // WACC ────────────────────────────────────────────────────────────────────
    const costOfEquity = rfRate + beta * ERP;
    // Cost of debt approximated as risk-free + 200 bps credit spread
    const costOfDebt = rfRate + 0.02;
    const deRatio = debtToEquityPct != null ? debtToEquityPct / 100 : 0;
    const weightEquity = deRatio > 0 ? 1 / (1 + deRatio) : 1;
    const weightDebt   = deRatio > 0 ? deRatio / (1 + deRatio) : 0;
    const wacc = weightEquity * costOfEquity + weightDebt * costOfDebt * (1 - TAX_RATE);

    // Guard: WACC must exceed terminal growth or Gordon model breaks
    if (wacc <= TERMINAL_GROWTH) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 200 });
    }

    // Growth rate ─────────────────────────────────────────────────────────────
    let growthRate: number | undefined;
    let growthSource = "5Y est.";

    if (trend) {
      const fiveY = trend.find((t: any) => t.period === "5y");
      const raw5y = safeNum(fiveY?.growth);
      if (raw5y != null && raw5y > 0) growthRate = raw5y;
    }
    if (growthRate == null) {
      const eg = safeNum(fd?.earningsGrowth);
      if (eg != null && eg > 0) { growthRate = eg; growthSource = "TTM growth"; }
    }
    if (growthRate == null) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 200 });
    }

    const cappedGrowth = Math.min(growthRate, 0.50);

    // Run three scenarios ──────────────────────────────────────────────────────
    const base = runDCF(fcfPerShare, cappedGrowth, wacc);
    const bear = runDCF(fcfPerShare, cappedGrowth * 0.6, wacc + 0.01);
    const bull = runDCF(fcfPerShare, Math.min(cappedGrowth * 1.4, 0.50), wacc - 0.01);

    const upside = currentPrice != null
      ? ((base.intrinsicValue - currentPrice) / currentPrice) * 100
      : null;

    return NextResponse.json({
      intrinsicValue: base.intrinsicValue,
      bearValue:      bear.intrinsicValue,
      bullValue:      bull.intrinsicValue,
      currentPrice:   currentPrice ?? null,
      fcfPerShare,
      growthRate:     cappedGrowth * 100,    // percentage for display
      growthSource,
      wacc:           wacc * 100,           // percentage for display
      rfRate:         rfRate * 100,
      beta,
      costOfEquity:   costOfEquity * 100,
      costOfDebt:     costOfDebt * 100,
      terminalGrowth: TERMINAL_GROWTH * 100,
      pvHighGrowth:   base.pvHighGrowth,
      pvFade:         base.pvFade,
      pvTerminal:     base.pvTerminal,
      years:          base.years,
      upside,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
