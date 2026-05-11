export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/market/yahoo";
import { computeIndicators } from "@/lib/market/indicators";
import { TIMEFRAMES } from "@/types/market";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const tf = req.nextUrl.searchParams.get("tf") ?? "3M";
  const withIndicators = req.nextUrl.searchParams.get("indicators") === "true";

  const frame = TIMEFRAMES.find((t) => t.value === tf) ?? TIMEFRAMES[3];
  const now = new Date();
  const from = new Date(now.getTime() - frame.days * 24 * 60 * 60 * 1000);

  try {
    const bars = await getHistory(
      ticker.toUpperCase(),
      frame.interval as Parameters<typeof getHistory>[1],
      from
    );
    const indicators = withIndicators ? computeIndicators(bars) : undefined;
    return NextResponse.json({ bars, indicators });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
