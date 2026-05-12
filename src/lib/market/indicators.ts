import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import * as ti from "technicalindicators";

export function computeIndicators(bars: OHLCVBar[]): TechnicalIndicators {
  if (bars.length < 30) return {};
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);

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

  const stochInput = ti.Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3,
  });
  const stochK = padLeft(stochInput.map((s) => s.k), bars.length);
  const stochD = padLeft(stochInput.map((s) => s.d), bars.length);

  // ADX / DMI
  const adxResult = ti.ADX.calculate({ close: closes, high: highs, low: lows, period: 14 }) as { adx: number; pdi: number; mdi: number }[];
  const adx   = padLeft(adxResult.map((r) => r.adx), bars.length);
  const pdi   = padLeft(adxResult.map((r) => r.pdi), bars.length);
  const mdi   = padLeft(adxResult.map((r) => r.mdi), bars.length);

  // Parabolic SAR
  const psarResult = ti.PSAR.calculate({ high: highs, low: lows, step: 0.02, max: 0.2 }) as number[];
  const psar = padLeft(psarResult, bars.length);

  // CCI (20)
  const cciResult = ti.CCI.calculate({ high: highs, low: lows, close: closes, period: 20 }) as number[];
  const cci = padLeft(cciResult, bars.length);

  // OBV — same length as input, no padding needed
  const obv = ti.OBV.calculate({ close: closes, volume: volumes }) as number[];

  return {
    rsi,
    stochastic: { k: stochK, d: stochD },
    macd: { macd: macdLine, signal, histogram },
    bollinger: { upper, middle, lower },
    ema9,
    ema21,
    ema50,
    ema200,
    adx: { adx, pdi, mdi },
    psar,
    cci,
    obv,
  };
}

function padLeft(arr: number[], targetLen: number): number[] {
  const pad = targetLen - arr.length;
  if (pad <= 0) return arr;
  return [...Array(pad).fill(NaN), ...arr];
}

export type SignalValue = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";

export function computeSignalSummary(indicators: TechnicalIndicators, currentPrice: number) {
  const signals: { name: string; signal: SignalValue; value: string }[] = [];

  const lastRSI = lastVal(indicators.rsi);
  if (lastRSI != null) {
    signals.push({
      name: "RSI(14)",
      signal: lastRSI < 20 ? "strong-buy" : lastRSI < 30 ? "buy" : lastRSI > 80 ? "strong-sell" : lastRSI > 70 ? "sell" : "neutral",
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

  const stoch = indicators.stochastic;
  if (stoch) {
    const k = lastVal(stoch.k);
    const d = lastVal(stoch.d);
    if (k != null) {
      signals.push({
        name: "Stochastic",
        signal: k < 10 ? "strong-buy" : k < 20 ? "buy" : k > 90 ? "strong-sell" : k > 80 ? "sell" : "neutral",
        value: `%K ${k.toFixed(1)}${d != null ? ` / %D ${d.toFixed(1)}` : ""}`,
      });
    }
  }

  const ema9 = lastVal(indicators.ema9);
  const ema21 = lastVal(indicators.ema21);
  if (ema9 != null && ema21 != null) {
    signals.push({
      name: "EMA 9/21",
      signal: ema9 > ema21 ? "buy" : "sell",
      value: `9: ${ema9.toFixed(2)} / 21: ${ema21.toFixed(2)}`,
    });
  }

  // ADX / DMI
  const adxVal = lastVal(indicators.adx?.adx);
  const pdiVal = lastVal(indicators.adx?.pdi);
  const mdiVal = lastVal(indicators.adx?.mdi);
  if (adxVal != null && pdiVal != null && mdiVal != null) {
    signals.push({
      name: "ADX/DMI",
      signal: adxVal < 20 ? "neutral" : pdiVal > mdiVal ? "buy" : "sell",
      value: `ADX ${adxVal.toFixed(1)} +DI ${pdiVal.toFixed(1)} -DI ${mdiVal.toFixed(1)}`,
    });
  }

  // Parabolic SAR
  const psarVal = lastVal(indicators.psar);
  if (psarVal != null) {
    signals.push({
      name: "PSAR",
      signal: currentPrice > psarVal ? "buy" : "sell",
      value: psarVal.toFixed(2),
    });
  }

  // CCI (20)
  const cciVal = lastVal(indicators.cci);
  if (cciVal != null) {
    signals.push({
      name: "CCI(20)",
      signal: cciVal < -200 ? "strong-buy" : cciVal < -100 ? "buy" : cciVal > 200 ? "strong-sell" : cciVal > 100 ? "sell" : "neutral",
      value: cciVal.toFixed(1),
    });
  }

  // OBV — rising if last value > value 5 bars ago
  const obvVals = (indicators.obv ?? []).filter((v) => !isNaN(v));
  if (obvVals.length >= 6) {
    const last = obvVals[obvVals.length - 1];
    const prev = obvVals[obvVals.length - 6];
    signals.push({
      name: "OBV",
      signal: last > prev ? "buy" : last < prev ? "sell" : "neutral",
      value: last >= 1e6 ? `${(last / 1e6).toFixed(1)}M` : last >= 1e3 ? `${(last / 1e3).toFixed(0)}K` : last.toFixed(0),
    });
  }

  const strongBuys  = signals.filter((s) => s.signal === "strong-buy").length;
  const buys        = signals.filter((s) => s.signal === "buy").length;
  const sells       = signals.filter((s) => s.signal === "sell").length;
  const strongSells = signals.filter((s) => s.signal === "strong-sell").length;
  const neutrals    = signals.filter((s) => s.signal === "neutral").length;

  // Weighted score: strong signals count double
  const bullScore = strongBuys * 2 + buys;
  const bearScore = strongSells * 2 + sells;
  const overall: "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell" = (() => {
    if (bullScore === 0 && bearScore === 0) return "neutral";
    const total = bullScore + bearScore + neutrals;
    const ratio = (bullScore - bearScore) / total;
    if (ratio >= 0.5)  return "strong-buy";
    if (ratio > 0)     return "buy";
    if (ratio <= -0.5) return "strong-sell";
    if (ratio < 0)     return "sell";
    return "neutral";
  })();

  return { signals, overall, strongBuys, buys, sells, strongSells, neutrals };
}

function lastVal(arr?: number[]): number | null {
  if (!arr || arr.length === 0) return null;
  const v = arr[arr.length - 1];
  return isNaN(v) ? null : v;
}
