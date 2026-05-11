import { NextRequest, NextResponse } from "next/server";
import { searchTickers } from "@/lib/market/yahoo";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await searchTickers(q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
