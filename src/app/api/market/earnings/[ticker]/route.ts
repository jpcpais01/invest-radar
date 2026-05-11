export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getEarnings } from "@/lib/market/yahoo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const data = await getEarnings(ticker.toUpperCase());
    return NextResponse.json({ earnings: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
