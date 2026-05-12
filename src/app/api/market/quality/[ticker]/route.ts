export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getQualityData } from "@/lib/market/yahoo";

function clamp(v: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function scoreMargin(v: number | undefined) {
  if (v == null) return 0.5;
  if (v < 0) return 0;
  if (v < 0.05) return 0.25;
  if (v < 0.15) return 0.55;
  if (v < 0.25) return 0.78;
  return 1;
}

function scoreROE(v: number | undefined) {
  if (v == null) return 0.5;
  if (v < 0) return 0;
  if (v < 0.05) return 0.2;
  if (v < 0.10) return 0.45;
  if (v < 0.20) return 0.72;
  return 1;
}

function scoreROA(v: number | undefined) {
  if (v == null) return 0.5;
  if (v < 0) return 0;
  if (v < 0.03) return 0.3;
  if (v < 0.07) return 0.62;
  return 1;
}

function scoreGrowth(v: number | undefined) {
  if (v == null) return 0.5;
  if (v < -0.1) return 0;
  if (v < 0) return 0.2;
  if (v < 0.05) return 0.4;
  if (v < 0.15) return 0.68;
  if (v < 0.30) return 0.85;
  return 1;
}

function scoreDebtToEquity(v: number | undefined) {
  if (v == null) return 0.5;
  if (v > 300) return 0;
  if (v > 200) return 0.2;
  if (v > 100) return 0.5;
  if (v > 50) return 0.75;
  return 1;
}

function scoreCurrentRatio(v: number | undefined) {
  if (v == null) return 0.5;
  if (v < 1) return 0.1;
  if (v < 1.5) return 0.5;
  if (v < 2.5) return 0.85;
  return 1;
}

function scoreFCFConversion(fcf: number | undefined, ocf: number | undefined) {
  if (!fcf || !ocf || ocf === 0) return 0.5;
  const ratio = fcf / ocf;
  if (ratio < 0) return 0;
  if (ratio < 0.3) return 0.3;
  if (ratio < 0.6) return 0.6;
  if (ratio < 0.85) return 0.82;
  return 1;
}

function avg(...vals: number[]) {
  const valid = vals.filter((v) => !isNaN(v));
  if (!valid.length) return 0.5;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const d = await getQualityData(ticker.toUpperCase());

    const profitability = clamp(avg(
      scoreMargin(d.profitMargins),
      scoreMargin(d.operatingMargins),
      scoreROE(d.returnOnEquity),
      scoreROA(d.returnOnAssets),
    ));

    const growth = clamp(avg(
      scoreGrowth(d.revenueGrowth),
      scoreGrowth(d.earningsGrowth),
    ));

    const health = clamp(avg(
      scoreDebtToEquity(d.debtToEquity),
      scoreCurrentRatio(d.currentRatio),
    ));

    const efficiency = clamp(avg(
      scoreFCFConversion(d.freeCashflow, d.operatingCashflow),
      scoreROA(d.returnOnAssets),
    ));

    const overall = clamp(avg(profitability, growth, health, efficiency));

    return NextResponse.json({
      overall: Math.round(overall * 100),
      profitability: Math.round(profitability * 100),
      growth: Math.round(growth * 100),
      health: Math.round(health * 100),
      efficiency: Math.round(efficiency * 100),
      raw: d,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
