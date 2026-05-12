export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/market/yahoo";
import { computeIndicators } from "@/lib/market/indicators";

// Same warmup constant as the history route — ensures EMA50/200 and MACD have enough bars
const WARMUP_DAYS = 220;

const TIMEFRAMES = [
  { label: "1M", days: 30,  interval: "1d"  as const },
  { label: "3M", days: 90,  interval: "1d"  as const },
  { label: "6M", days: 180, interval: "1d"  as const },
  { label: "1Y", days: 365, interval: "1d"  as const },
  { label: "2Y", days: 730, interval: "1wk" as const },
];

type Cell = "bullish" | "bearish" | "neutral" | "insufficient";

function lastVal(arr?: number[]): number | null {
  if (!arr || !arr.length) return null;
  const v = arr[arr.length - 1];
  return isNaN(v) ? null : v;
}

async function analyzeTimeframe(ticker: string, days: number, interval: "1d" | "1wk") {
  // Fetch warmup bars so all indicators (incl. EMA200, MACD) compute fully
  const warmupFrom = new Date(Date.now() - (days + WARMUP_DAYS) * 24 * 60 * 60 * 1000);
  const allBars = await getHistory(ticker, interval, warmupFrom);

  if (allBars.length < 30) {
    return { trend: "insufficient", momentum: "insufficient", macd: "insufficient", volume: "insufficient", position: "insufficient" } as Record<string, Cell>;
  }

  // Compute indicators on full warmup set — only need last values
  const ind = computeIndicators(allBars);

  // Price range from the requested window only (not the warmup)
  const displayFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).getTime() / 1000;
  const displayBars = allBars.filter((b) => b.time >= displayFrom);
  const barsForRange = displayBars.length >= 5 ? displayBars : allBars;
  const price  = allBars[allBars.length - 1].close;
  const highs  = barsForRange.map((b) => b.high);
  const lows   = barsForRange.map((b) => b.low);

  // Trend: price vs EMA50
  const ema50 = lastVal(ind.ema50);
  const trend: Cell = ema50 == null ? "neutral" : price > ema50 ? "bullish" : "bearish";

  // Momentum: RSI
  const rsi = lastVal(ind.rsi);
  const momentum: Cell = rsi == null ? "neutral" : rsi > 60 ? "bullish" : rsi < 40 ? "bearish" : "neutral";

  // MACD: macd line vs signal
  const macdVal = lastVal(ind.macd?.macd);
  const sigVal  = lastVal(ind.macd?.signal);
  const macdCell: Cell = macdVal == null || sigVal == null ? "neutral" : macdVal > sigVal ? "bullish" : "bearish";

  // Volume: OBV direction over last 6 bars
  const obv = (ind.obv ?? []).filter((v) => !isNaN(v));
  const obvCell: Cell = obv.length < 6 ? "neutral"
    : obv[obv.length - 1] > obv[obv.length - 6] ? "bullish" : "bearish";

  // Price position within the display window range
  const hi  = Math.max(...highs);
  const lo  = Math.min(...lows);
  const range = hi - lo;
  const pos = range > 0 ? (price - lo) / range : 0.5;
  const position: Cell = pos > 0.65 ? "bullish" : pos < 0.35 ? "bearish" : "neutral";

  return { trend, momentum, macd: macdCell, volume: obvCell, position } as Record<string, Cell>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const results = await Promise.all(
      TIMEFRAMES.map((tf) => analyzeTimeframe(ticker.toUpperCase(), tf.days, tf.interval))
    );

    const rows = ["trend", "momentum", "macd", "volume", "position"];
    const rowLabels: Record<string, string> = {
      trend: "Trend (EMA50)",
      momentum: "Momentum (RSI)",
      macd: "MACD",
      volume: "Volume (OBV)",
      position: "Price Position",
    };

    const grid = rows.map((row) => ({
      key: row,
      label: rowLabels[row],
      cells: TIMEFRAMES.map((tf, i) => ({
        timeframe: tf.label,
        value: results[i][row] as Cell,
      })),
    }));

    const allCells = grid.flatMap((r) => r.cells.map((c) => c.value)).filter((v) => v !== "insufficient");
    const bullCount = allCells.filter((v) => v === "bullish").length;
    const bearCount = allCells.filter((v) => v === "bearish").length;
    const agreement = allCells.length ? Math.round((Math.max(bullCount, bearCount) / allCells.length) * 100) : 0;
    const bias: "bullish" | "bearish" | "mixed" = bullCount > bearCount ? "bullish" : bearCount > bullCount ? "bearish" : "mixed";

    return NextResponse.json({ grid, timeframes: TIMEFRAMES.map((t) => t.label), agreement, bias });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
