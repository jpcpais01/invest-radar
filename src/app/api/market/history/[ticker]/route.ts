export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/market/yahoo";
import { computeIndicators } from "@/lib/market/indicators";
import { TechnicalIndicators } from "@/types/market";
import { TIMEFRAMES } from "@/types/market";

// Indicators need warmup bars to produce valid values (EMA200 = 200 bars minimum)
const WARMUP_DAYS = 220;

// Clip wicks that are bad ticks: if the next candle opens less than halfway
// toward the wick extreme, the wick never had real follow-through and is fake data.
function fixWicks(bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[]) {
  return bars.map((bar, i) => {
    if (i === bars.length - 1) return bar;
    const nextOpen = bars[i + 1].open;
    const bodyLow  = Math.min(bar.open, bar.close);
    const bodyHigh = Math.max(bar.open, bar.close);
    let { low, high } = bar;

    // Downward spike: next open is more than halfway back up from the wick low
    if (low < bodyLow && nextOpen > low + (bodyLow - low) / 2) {
      low = bodyLow;
    }
    // Upward spike: next open is more than halfway back down from the wick high
    if (high > bodyHigh && nextOpen < high - (high - bodyHigh) / 2) {
      high = bodyHigh;
    }

    return { ...bar, low, high };
  });
}

function trimIndicators(ind: TechnicalIndicators, len: number): TechnicalIndicators {
  const s = (arr?: number[]) => arr?.slice(-len);
  return {
    rsi:        s(ind.rsi),
    stochastic: ind.stochastic ? { k: s(ind.stochastic.k)!, d: s(ind.stochastic.d)! } : undefined,
    macd:       ind.macd ? { macd: s(ind.macd.macd)!, signal: s(ind.macd.signal)!, histogram: s(ind.macd.histogram)! } : undefined,
    bollinger:  ind.bollinger ? { upper: s(ind.bollinger.upper)!, middle: s(ind.bollinger.middle)!, lower: s(ind.bollinger.lower)! } : undefined,
    ema9:       s(ind.ema9),
    ema21:      s(ind.ema21),
    ema50:      s(ind.ema50),
    ema200:     s(ind.ema200),
    adx:        ind.adx ? { adx: s(ind.adx.adx)!, pdi: s(ind.adx.pdi)!, mdi: s(ind.adx.mdi)! } : undefined,
    psar:       s(ind.psar),
    cci:        s(ind.cci),
    obv:        s(ind.obv),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const tf = req.nextUrl.searchParams.get("tf") ?? "3M";
  const withIndicators = req.nextUrl.searchParams.get("indicators") === "true";

  const frame = TIMEFRAMES.find((t) => t.value === tf) ?? TIMEFRAMES[3];
  const now = new Date();

  // Intraday intervals are limited to ~60 days by Yahoo Finance — skip warmup to avoid fetch failures
  const isIntraday = ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"].includes(frame.interval);
  const warmupDays = isIntraday ? 0 : WARMUP_DAYS;
  const warmupFrom = new Date(now.getTime() - (frame.days + warmupDays) * 24 * 60 * 60 * 1000);
  const displayFrom = new Date(now.getTime() - frame.days * 24 * 60 * 60 * 1000);

  try {
    const allBars = await getHistory(
      ticker.toUpperCase(),
      frame.interval as Parameters<typeof getHistory>[1],
      warmupFrom
    );

    // Trim to just the display window
    const displayBars = allBars.filter((b) => b.time >= displayFrom.getTime() / 1000);
    const rawBars = displayBars.length > 0 ? displayBars : allBars;
    const bars = isIntraday ? fixWicks(rawBars) : rawBars;

    let indicators: TechnicalIndicators | undefined;
    if (withIndicators) {
      const fullIndicators = computeIndicators(allBars);
      indicators = trimIndicators(fullIndicators, bars.length);
    }

    return NextResponse.json({ bars, indicators });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
