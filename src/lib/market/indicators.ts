import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import * as ti from "technicalindicators";

export function computeIndicators(bars: OHLCVBar[]): TechnicalIndicators {
  if (bars.length < 30) return {};
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  const rsiResult = ti.RSI.calculate({ period: 14, values: closes });
  const rsi = padLeft(rsiResult, bars.length);

  const macdInput = ti.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdLine = padLeft(macdInput.map((m) => m.MACD ?? 0), bars.length);
  const signal = padLeft(macdInput.map((m) => m.signal ?? 0), bars.length);
  const histogram = padLeft(macdInput.map((m) => m.histogram ?? 0), bars.length);

  const bbInput = ti.BollingerBands.calculate({
    period: 20,
    values: closes,
    stdDev: 2,
  });
  const upper = padLeft(bbInput.map((b) => b.upper), bars.length);
  const middle = padLeft(bbInput.map((b) => b.middle), bars.length);
  const lower = padLeft(bbInput.map((b) => b.lower), bars.length);

  const ema9 = padLeft(ti.EMA.calculate({ period: 9, values: closes }), bars.length);
  const ema21 = padLeft(ti.EMA.calculate({ period: 21, values: closes }), bars.length);
  const ema50 = padLeft(
    closes.length >= 50 ? ti.EMA.calculate({ period: 50, values: closes }) : [],
    bars.length
  );
  const ema200 = padLeft(
    closes.length >= 200 ? ti.EMA.calculate({ period: 200, values: closes }) : [],
    bars.length
  );

  void highs;
  void lows;

  return {
    rsi,
    macd: { macd: macdLine, signal, histogram },
    bollinger: { upper, middle, lower },
    ema9,
    ema21,
    ema50,
    ema200,
  };
}

function padLeft(arr: number[], targetLen: number): number[] {
  const pad = targetLen - arr.length;
  if (pad <= 0) return arr;
  return [...Array(pad).fill(NaN), ...arr];
}

export function computeSignalSummary(indicators: TechnicalIndicators, currentPrice: number) {
  const signals: { name: string; signal: "buy" | "sell" | "neutral"; value: string }[] = [];

  const lastRSI = lastVal(indicators.rsi);
  if (lastRSI != null) {
    signals.push({
      name: "RSI(14)",
      signal: lastRSI > 70 ? "sell" : lastRSI < 30 ? "buy" : "neutral",
      value: lastRSI.toFixed(1),
    });
  }

  const macd = indicators.macd;
  if (macd) {
    const lastMACD = lastVal(macd.macd);
    const lastSignal = lastVal(macd.signal);
    if (lastMACD != null && lastSignal != null) {
      signals.push({
        name: "MACD",
        signal: lastMACD > lastSignal ? "buy" : lastMACD < lastSignal ? "sell" : "neutral",
        value: lastMACD.toFixed(3),
      });
    }
  }

  const bb = indicators.bollinger;
  if (bb) {
    const upper = lastVal(bb.upper);
    const lower = lastVal(bb.lower);
    if (upper != null && lower != null) {
      signals.push({
        name: "Bollinger",
        signal: currentPrice > upper ? "sell" : currentPrice < lower ? "buy" : "neutral",
        value: `${lower.toFixed(2)} – ${upper.toFixed(2)}`,
      });
    }
  }

  const ema50 = lastVal(indicators.ema50);
  const ema200 = lastVal(indicators.ema200);
  if (ema50 != null && ema200 != null) {
    signals.push({
      name: "EMA Cross",
      signal: ema50 > ema200 ? "buy" : "sell",
      value: `50: ${ema50.toFixed(2)} / 200: ${ema200.toFixed(2)}`,
    });
  }

  const buys = signals.filter((s) => s.signal === "buy").length;
  const sells = signals.filter((s) => s.signal === "sell").length;
  const overall: "buy" | "sell" | "neutral" =
    buys > sells ? "buy" : sells > buys ? "sell" : "neutral";

  return { signals, overall, buys, sells, neutrals: signals.length - buys - sells };
}

function lastVal(arr?: number[]): number | null {
  if (!arr || arr.length === 0) return null;
  const v = arr[arr.length - 1];
  return isNaN(v) ? null : v;
}
