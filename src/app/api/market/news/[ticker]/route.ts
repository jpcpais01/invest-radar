export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getNews } from "@/lib/market/news";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const articles = await getNews(ticker.toUpperCase());
    return NextResponse.json({ articles });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
