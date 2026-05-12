export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getInsiderTransactions } from "@/lib/market/yahoo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const transactions = await getInsiderTransactions(ticker.toUpperCase());

    const netShares = transactions.reduce(
      (acc, t) => acc + (t.isBuy ? Math.abs(t.shares) : -Math.abs(t.shares)),
      0
    );

    const byQuarter: Record<string, { buys: number; sells: number; netShares: number }> = {};
    for (const t of transactions) {
      if (!t.date) continue;
      const d = new Date(t.date);
      const q = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      if (!byQuarter[q]) byQuarter[q] = { buys: 0, sells: 0, netShares: 0 };
      if (t.isBuy) {
        byQuarter[q].buys++;
        byQuarter[q].netShares += Math.abs(t.shares);
      } else {
        byQuarter[q].sells++;
        byQuarter[q].netShares -= Math.abs(t.shares);
      }
    }

    return NextResponse.json({ transactions, netShares, byQuarter });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
