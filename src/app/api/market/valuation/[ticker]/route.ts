export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getValuationHistory } from "@/lib/market/yahoo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const data = await getValuationHistory(ticker.toUpperCase());
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
