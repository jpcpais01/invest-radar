export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/market/yahoo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const quote = await getQuote(ticker.toUpperCase());
    return NextResponse.json(quote);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
