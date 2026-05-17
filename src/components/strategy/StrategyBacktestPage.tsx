"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ArrowLeft, FlaskConical, RefreshCw, ChevronDown,
  TrendingUp, TrendingDown, Plus, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTickerStore } from "@/store/tickerStore";
import CommandPalette from "@/components/search/CommandPalette";
import StrategyChart, { CurvePoint, ChartTrade, BuyEvent, SellEvent } from "./StrategyChart";

// ── types ──────────────────────────────────────────────────────────────────────
type Mode = "trading" | "investing";
type Timeframe = "1m" | "5m" | "1h" | "1d";
type PrebuiltStrategy =
  | "none" | "fridayyy"
  | "buythedip" | "buytheddip"
  | "firstofmonth" | "lastofmonth";

interface ActivePrebuilt { strategy: PrebuiltStrategy; weight: number; }

type ConditionType =
  | "rsi_lt" | "rsi_gt"
  | "ema_cross_up" | "ema_cross_down"
  | "sma_cross_up" | "sma_cross_down"
  | "bb_lower" | "bb_upper"
  | "stoch_lt" | "stoch_gt";

interface Condition { id: string; type: ConditionType; enabled: boolean; threshold: number; }

interface EnrichedCandle {
  time: number; open: number; high: number; low: number; close: number;
  rsi: number | null;
  emaFast: number | null; emaSlow: number | null;
  smaFast: number | null; smaSlow: number | null;
  bbUpper: number | null; bbLower: number | null;
  stochK: number | null; stochD: number | null;
  prevEmaFast: number | null; prevEmaSlow: number | null;
  prevSmaFast: number | null; prevSmaSlow: number | null;
}

interface BacktestData { ticker: string; timeframe: Timeframe; window: number; candles: EnrichedCandle[]; }

interface IndicatorParams {
  rsiPeriod: number; emaFast: number; emaSlow: number;
  smaFast: number; smaSlow: number;
  bbPeriod: number; stochK: number; stochD: number;
}

// ── constants ─────────────────────────────────────────────────────────────────
const TRADING_ACCENT = "#a78bfa";
const INVEST_ACCENT  = "#34d399";

const PREBUILT_META: Record<PrebuiltStrategy, { label: string; description: string }> = {
  none:         { label: "Custom",        description: "Build with technical signals only"                   },
  fridayyy:     { label: "Fridayyy",      description: "Buy every Thursday close"                            },
  buythedip:    { label: "BuyTheDip",     description: "Buy every negative-day close"                        },
  buytheddip:   { label: "BuyTheDDip",    description: "Buy after 2 consecutive down-day closes"             },
  firstofmonth: { label: "FirstOfMonth",  description: "Buy on the first trading day of each month"          },
  lastofmonth:  { label: "LastOfMonth",   description: "Buy on the last trading day of each month"           },
};

const COND_META: Record<ConditionType, {
  label: string; badge: string; badgeColor: string;
  hasThreshold: boolean; thresholdDefault: number; thresholdMin: number; thresholdMax: number;
  description: (c: Condition, ip: IndicatorParams) => string;
}> = {
  rsi_lt:         { label: "RSI Below",      badge: "RSI",  badgeColor: "#f97316", hasThreshold: true,  thresholdDefault: 30, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `RSI(${ip.rsiPeriod}) < ${c.threshold}` },
  rsi_gt:         { label: "RSI Above",      badge: "RSI",  badgeColor: "#f97316", hasThreshold: true,  thresholdDefault: 70, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `RSI(${ip.rsiPeriod}) > ${c.threshold}` },
  ema_cross_up:   { label: "EMA Cross Up",   badge: "EMA",  badgeColor: "#3b82f6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `EMA(${ip.emaFast}) crosses above EMA(${ip.emaSlow})` },
  ema_cross_down: { label: "EMA Cross Down", badge: "EMA",  badgeColor: "#3b82f6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `EMA(${ip.emaFast}) crosses below EMA(${ip.emaSlow})` },
  sma_cross_up:   { label: "SMA Cross Up",   badge: "SMA",  badgeColor: "#8b5cf6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `SMA(${ip.smaFast}) crosses above SMA(${ip.smaSlow})` },
  sma_cross_down: { label: "SMA Cross Down", badge: "SMA",  badgeColor: "#8b5cf6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `SMA(${ip.smaFast}) crosses below SMA(${ip.smaSlow})` },
  bb_lower:       { label: "BB Lower Band",  badge: "BB",   badgeColor: "#06b6d4", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `Price < BB(${ip.bbPeriod}) lower band` },
  bb_upper:       { label: "BB Upper Band",  badge: "BB",   badgeColor: "#06b6d4", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `Price > BB(${ip.bbPeriod}) upper band` },
  stoch_lt:       { label: "Stoch Below",    badge: "Stch", badgeColor: "#ec4899", hasThreshold: true,  thresholdDefault: 20, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `Stoch(${ip.stochK}) %K < ${c.threshold}` },
  stoch_gt:       { label: "Stoch Above",    badge: "Stch", badgeColor: "#ec4899", hasThreshold: true,  thresholdDefault: 80, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `Stoch(${ip.stochK}) %K > ${c.threshold}` },
};

const BUY_SUGGESTIONS:    ConditionType[] = ["rsi_lt", "ema_cross_up", "sma_cross_up", "bb_lower", "stoch_lt"];
const SHORT_SUGGESTIONS:  ConditionType[] = ["rsi_gt", "ema_cross_down", "sma_cross_down", "bb_upper", "stoch_gt"];
const INVEST_SUGGESTIONS: ConditionType[] = ["rsi_lt", "ema_cross_up", "sma_cross_up", "bb_lower", "stoch_lt"];
const TIMEFRAME_OPTS: Timeframe[] = ["1m", "5m", "1h", "1d"];
const WINDOW_OPTS    = [20, 60, 150, 300, 500, 750, 1000];

// ── signal evaluation ─────────────────────────────────────────────────────────
function evalCondition(cond: Condition, c: EnrichedCandle): boolean {
  switch (cond.type) {
    case "rsi_lt":        return c.rsi != null && c.rsi < cond.threshold;
    case "rsi_gt":        return c.rsi != null && c.rsi > cond.threshold;
    case "ema_cross_up":  return c.emaFast != null && c.emaSlow != null && c.prevEmaFast != null && c.prevEmaSlow != null && c.prevEmaFast <= c.prevEmaSlow && c.emaFast > c.emaSlow;
    case "ema_cross_down":return c.emaFast != null && c.emaSlow != null && c.prevEmaFast != null && c.prevEmaSlow != null && c.prevEmaFast >= c.prevEmaSlow && c.emaFast < c.emaSlow;
    case "sma_cross_up":  return c.smaFast != null && c.smaSlow != null && c.prevSmaFast != null && c.prevSmaSlow != null && c.prevSmaFast <= c.prevSmaSlow && c.smaFast > c.smaSlow;
    case "sma_cross_down":return c.smaFast != null && c.smaSlow != null && c.prevSmaFast != null && c.prevSmaSlow != null && c.prevSmaFast >= c.prevSmaSlow && c.smaFast < c.smaSlow;
    case "bb_lower":      return c.bbLower != null && c.close < c.bbLower;
    case "bb_upper":      return c.bbUpper != null && c.close > c.bbUpper;
    case "stoch_lt":      return c.stochK != null && c.stochK < cond.threshold;
    case "stoch_gt":      return c.stochK != null && c.stochK > cond.threshold;
  }
}

function evalGroup(conditions: Condition[], logic: "AND" | "OR", c: EnrichedCandle): boolean {
  const active = conditions.filter(x => x.enabled);
  if (active.length === 0) return false;
  return logic === "AND" ? active.every(x => evalCondition(x, c)) : active.some(x => evalCondition(x, c));
}

function evalPrebuiltBuy(s: PrebuiltStrategy, c: EnrichedCandle, prev: EnrichedCandle | null, next: EnrichedCandle | null, prevprev: EnrichedCandle | null): boolean {
  if (s === "none") return false;
  const day = new Date(c.time * 1000).getUTCDay();
  switch (s) {
    case "fridayyy":     return day === 4;
    case "buythedip":    return prev != null && c.close < prev.close;
    case "buytheddip":   return prev != null && c.close < prev.close && prevprev != null && prev.close < prevprev.close;
    case "firstofmonth": return !prev || new Date(prev.time * 1000).getUTCMonth() !== new Date(c.time * 1000).getUTCMonth();
    case "lastofmonth":  return !next || new Date(next.time * 1000).getUTCMonth() !== new Date(c.time * 1000).getUTCMonth();
  }
}

// ── analytics helpers ─────────────────────────────────────────────────────────
const ANN_FACTOR: Record<string, number> = { "1m": 98280, "5m": 19656, "1h": 1638, "1d": 252 };

function calcRatios(curve: CurvePoint[], tf: string): { sharpe: number; sortino: number; cagrPct: number } {
  if (curve.length < 3) return { sharpe: 0, sortino: 0, cagrPct: 0 };
  const ann = ANN_FACTOR[tf] ?? 252;
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) rets.push(curve[i].equity / curve[i - 1].equity - 1);
  const n = rets.length;
  const mean = rets.reduce((s, r) => s + r, 0) / n;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const downsideVar = rets.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / n;
  const downsideStd = Math.sqrt(downsideVar);
  const sharpe   = std > 1e-10 ? (mean / std) * Math.sqrt(ann) : 0;
  const sortino  = downsideStd > 1e-10 ? (mean / downsideStd) * Math.sqrt(ann) : 0;
  const finalEq  = Math.max(curve[curve.length - 1].equity, 1e-10);
  const cagrPct  = (Math.pow(finalEq, ann / n) - 1) * 100;
  return { sharpe, sortino, cagrPct };
}

// ── trading engine ────────────────────────────────────────────────────────────
interface TradingDerived {
  trades: ChartTrade[]; equityCurve: CurvePoint[]; buyHoldCurve: CurvePoint[];
  summary: {
    totalReturnPct: number; buyHoldReturnPct: number; winRate: number;
    tradeCount: number; profitFactor: number; avgPnlPct: number;
    bestPct: number; worstPct: number; stopOuts: number;
    cagrPct: number; sharpe: number; sortino: number;
    bhCagrPct: number; bhSharpe: number; bhSortino: number;
  };
}

function deriveTrading(
  data: BacktestData,
  buyConds: Condition[], buyLogic: "AND" | "OR",
  shortConds: Condition[], shortLogic: "AND" | "OR",
  stopLossPct: number, stopAndReverse: boolean,
): TradingDerived | null {
  const cs = data.candles;
  if (cs.length < 2) return null;
  const stopEnabled = stopLossPct > 0;
  interface Open { direction: "long"|"short"; entryPrice: number; entryTime: number; entryIdx: number; stopPrice: number; }
  let live: Open | null = null, realized = 1;
  const trades: ChartTrade[] = [], equityCurve: CurvePoint[] = [], buyHoldCurve: CurvePoint[] = [];
  const firstClose = cs[0].close;

  const getSignal = (c: EnrichedCandle) => {
    const hasBuy = buyConds.some(x => x.enabled), hasShort = shortConds.some(x => x.enabled);
    if (!hasBuy && !hasShort) return null;
    const buyFires = hasBuy && evalGroup(buyConds, buyLogic, c);
    const shortFires = hasShort && evalGroup(shortConds, shortLogic, c);
    if (buyFires && !shortFires) return "long" as const;
    if (shortFires && !buyFires) return "short" as const;
    return null;
  };

  const closeTrade = (exitPrice: number, exitTime: number, exitIdx: number, reason: ChartTrade["reason"]) => {
    if (!live) return;
    const rawRet = (exitPrice - live.entryPrice) / live.entryPrice;
    const pnlPct = (live.direction === "long" ? rawRet : -rawRet) * 100;
    realized *= 1 + pnlPct / 100;
    trades.push({ entryIdx: live.entryIdx, exitIdx, direction: live.direction, entryPrice: live.entryPrice, exitPrice, entryTime: live.entryTime, exitTime, pnlPct, won: pnlPct > 0, reason, entryConfidence: 0, entryAnalysis: "" });
    live = null;
  };

  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const sig = getSignal(c);
    let justClosed = false;
    if (live && live.entryIdx < i) {
      const stopHit = stopEnabled && (live.direction === "long" ? c.low <= live.stopPrice : c.high >= live.stopPrice);
      if (stopHit) { closeTrade(live.stopPrice, c.time, i, "stop"); justClosed = true; }
      else if (sig && sig !== live.direction) { closeTrade(c.close, c.time, i, "reversal"); justClosed = true; }
    }
    // Re-enter on same candle only when Stop & Reverse is on; otherwise wait for next bar's signal
    if (!live && i < cs.length - 1 && sig && (!justClosed || stopAndReverse)) {
      live = { direction: sig, entryPrice: c.close, entryTime: c.time, entryIdx: i, stopPrice: sig === "long" ? c.close * (1 - stopLossPct / 100) : c.close * (1 + stopLossPct / 100) };
    }
    let eq = realized;
    if (live && live.entryIdx <= i) { const r = (c.close - live.entryPrice) / live.entryPrice; eq = realized * (1 + (live.direction === "long" ? r : -r)); }
    equityCurve.push({ time: c.time, equity: eq });
    buyHoldCurve.push({ time: c.time, equity: c.close / firstClose });
  }
  if (live) { const last = cs[cs.length - 1]; closeTrade(last.close, last.time, cs.length - 1, "end"); equityCurve[equityCurve.length - 1] = { time: last.time, equity: realized }; }

  const wins = trades.filter(t => t.won);
  const grossWin  = wins.reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnlPct < 0).reduce((s, t) => s + t.pnlPct, 0));
  const lastClose = cs[cs.length - 1].close;
  const stRatios = calcRatios(equityCurve, data.timeframe);
  const bhRatios = calcRatios(buyHoldCurve, data.timeframe);
  return {
    trades, equityCurve, buyHoldCurve,
    summary: {
      totalReturnPct: (realized - 1) * 100, buyHoldReturnPct: (lastClose / firstClose - 1) * 100,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0, tradeCount: trades.length,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      avgPnlPct: trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0,
      bestPct: trades.length ? Math.max(...trades.map(t => t.pnlPct)) : 0,
      worstPct: trades.length ? Math.min(...trades.map(t => t.pnlPct)) : 0,
      stopOuts: trades.filter(t => t.reason === "stop").length,
      cagrPct: stRatios.cagrPct, sharpe: stRatios.sharpe, sortino: stRatios.sortino,
      bhCagrPct: bhRatios.cagrPct, bhSharpe: bhRatios.sharpe, bhSortino: bhRatios.sortino,
    },
  };
}

// ── investing engine ──────────────────────────────────────────────────────────
interface InvestingDerived {
  portfolioCurve: CurvePoint[]; bhCurve: CurvePoint[];
  buyEvents: BuyEvent[]; sellEvents: SellEvent[];
  summary: {
    totalInvested: number; finalValue: number; returnPct: number; bhReturnPct: number; nBuys: number;
    cagrPct: number; sharpe: number; sortino: number;
    bhCagrPct: number; bhSharpe: number; bhSortino: number;
  };
}

function deriveInvesting(
  data: BacktestData,
  prebuilts: ActivePrebuilt[],
  buyConds: Condition[], buyLogic: "AND" | "OR",
  positionSize: number,
): InvestingDerived | null {
  const cs = data.candles;
  if (cs.length < 2) return null;
  const firstClose = cs[0].close;
  let totalInvested = 0;
  const portfolioCurve: CurvePoint[] = [], bhCurve: CurvePoint[] = [];
  const buyEvents: BuyEvent[] = [], sellEvents: SellEvent[] = [];
  let accShares = 0;

  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const prev = i > 0 ? cs[i - 1] : null;
    const next = i < cs.length - 1 ? cs[i + 1] : null;
    const prevprev = i > 1 ? cs[i - 2] : null;

    // fire each active prebuilt independently with its own weight
    for (const { strategy, weight } of prebuilts) {
      if (strategy === "none") continue;
      if (evalPrebuiltBuy(strategy, c, prev, next, prevprev)) {
        const cost = positionSize * weight;
        accShares += cost / c.close;
        totalInvested += cost;
        buyEvents.push({ idx: i, price: c.close, weight, strategy });
      }
    }
    // technical signals always buy at 1× position size
    const techSig = buyConds.some(x => x.enabled) ? evalGroup(buyConds, buyLogic, c) : false;
    if (techSig) {
      accShares += positionSize / c.close;
      totalInvested += positionSize;
      buyEvents.push({ idx: i, price: c.close, weight: 1, strategy: "custom" });
    }

    portfolioCurve.push({ time: c.time, equity: totalInvested > 0 ? (accShares * c.close) / totalInvested : 1 });
  }

  // Build uniform-DCA baseline: same total capital spread evenly across every candle.
  // Both curves now have identical denominators, so the comparison answers purely
  // "did signal timing beat buying the same amount every candle?"
  const perCandle = totalInvested > 0 ? totalInvested / cs.length : 0;
  let uShares = 0;
  for (let i = 0; i < cs.length; i++) {
    uShares += perCandle / cs[i].close;
    const uInvestedSoFar = (i + 1) * perCandle;
    bhCurve.push({ time: cs[i].time, equity: uInvestedSoFar > 0 ? (uShares * cs[i].close) / uInvestedSoFar : 1 });
  }

  const last = cs[cs.length - 1];
  const finalValue   = accShares * last.close;
  const bhFinalValue = uShares   * last.close;
  const stRatios = calcRatios(portfolioCurve, data.timeframe);
  const bhRatios = calcRatios(bhCurve,        data.timeframe);
  return {
    portfolioCurve, bhCurve, buyEvents, sellEvents,
    summary: {
      totalInvested, finalValue,
      returnPct:   totalInvested > 0 ? (finalValue   / totalInvested - 1) * 100 : 0,
      bhReturnPct: totalInvested > 0 ? (bhFinalValue / totalInvested - 1) * 100 : 0,
      nBuys: buyEvents.length,
      cagrPct: stRatios.cagrPct, sharpe: stRatios.sharpe, sortino: stRatios.sortino,
      bhCagrPct: bhRatios.cagrPct, bhSharpe: bhRatios.sharpe, bhSortino: bhRatios.sortino,
    },
  };
}

// ── ui helpers ────────────────────────────────────────────────────────────────
const fmtDollar = (v: number) => v >= 10000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
const fmtPct    = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
const fmtPF     = (pf: number) => pf === Infinity ? "∞" : pf.toFixed(2);

function SegPill({ options, active, onChange }: { options: number[]; active: number; onChange: (v: number) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {options.map(v => (
        <button key={v} onClick={() => onChange(v)} className="px-2.5 py-1.5 text-[10px] font-medium tracking-wide transition-all border-r last:border-r-0"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: active === v ? "rgba(167,139,250,0.16)" : "transparent", color: active === v ? "#c4b5fd" : "rgba(255,255,255,0.28)" }}>
          {v}
        </button>
      ))}
    </div>
  );
}

function GateSlider({ label, value, display, min, max, step, onChange }:
  { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="text-[10px] uppercase tracking-widest shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 min-w-[80px] h-1 cursor-pointer" style={{ accentColor: TRADING_ACCENT }} />
      <span className="text-[11px] font-mono font-semibold shrink-0 tabular-nums" style={{ color: "#c4b5fd", minWidth: 36, textAlign: "right" }}>{display}</span>
    </div>
  );
}

function Toggle({ on, onChange, accent = TRADING_ACCENT }: { on: boolean; onChange: (v: boolean) => void; accent?: string }) {
  return (
    <div role="switch" aria-checked={on} onClick={e => { e.stopPropagation(); onChange(!on); }}
      style={{ width: 32, height: 18, borderRadius: 9, position: "relative", display: "inline-flex", alignItems: "center", cursor: "pointer", flexShrink: 0,
        background: on ? `${accent}99` : "rgba(255,255,255,0.12)", border: `1px solid ${on ? `${accent}cc` : "rgba(255,255,255,0.15)"}`, transition: "all 0.15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 15 : 3, width: 12, height: 12, borderRadius: "50%", transition: "left 0.2s", background: on ? "#fff" : "rgba(255,255,255,0.45)" }} />
    </div>
  );
}

function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input type="number" min={min} max={max} value={value} onChange={e => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
      className="w-12 text-center text-[10px] font-mono rounded px-1 py-0.5"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", outline: "none" }} />
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>{label}</span>
      <span className="text-sm font-semibold font-mono" style={{ color: color ?? "rgba(255,255,255,0.85)" }}>{value}</span>
      {sub && <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</span>}
    </div>
  );
}

function LogicToggle({ value, onChange }: { value: "AND" | "OR"; onChange: (v: "AND" | "OR") => void }) {
  return (
    <div className="flex rounded overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {(["AND", "OR"] as const).map(l => (
        <button key={l} onClick={() => onChange(l)} className="px-1.5 py-0.5 text-[8px] font-bold tracking-widest border-r last:border-r-0 transition-all"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: value === l ? "rgba(167,139,250,0.18)" : "transparent", color: value === l ? "#c4b5fd" : "rgba(255,255,255,0.25)" }}>
          {l}
        </button>
      ))}
    </div>
  );
}

function ConditionCard({ cond, ip, onChange, onRemove }: { cond: Condition; ip: IndicatorParams; onChange: (id: string, patch: Partial<Condition>) => void; onRemove: (id: string) => void }) {
  const meta = COND_META[cond.type];
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all"
      style={{ background: cond.enabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)", border: `1px solid ${cond.enabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`, opacity: cond.enabled ? 1 : 0.5 }}>
      <Toggle on={cond.enabled} onChange={v => onChange(cond.id, { enabled: v })} />
      <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded shrink-0"
        style={{ background: `${meta.badgeColor}22`, color: meta.badgeColor, border: `1px solid ${meta.badgeColor}33` }}>{meta.badge}</span>
      <span className="text-[10px] flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>{meta.description(cond, ip)}</span>
      {meta.hasThreshold && (
        <div className="flex items-center gap-1 shrink-0">
          <input type="range" min={meta.thresholdMin} max={meta.thresholdMax} step={1} value={cond.threshold} onChange={e => onChange(cond.id, { threshold: parseInt(e.target.value) })}
            className="w-14 h-0.5 cursor-pointer" style={{ accentColor: meta.badgeColor }} />
          <span className="text-[9px] font-mono tabular-nums w-5 text-right" style={{ color: meta.badgeColor }}>{cond.threshold}</span>
        </div>
      )}
      <button onClick={() => onRemove(cond.id)} className="shrink-0 p-0.5 rounded transition-colors ml-0.5" style={{ color: "rgba(255,255,255,0.18)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.65)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.18)")}>
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

function AddSignalMenu({ suggestions, accent, alignRight, onAdd }: { suggestions: ConditionType[]; accent: string; alignRight?: boolean; onAdd: (t: ConditionType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all"
        style={{ background: open ? `${accent}1a` : "rgba(255,255,255,0.04)", border: `1px solid ${open ? `${accent}44` : "rgba(255,255,255,0.07)"}`, color: open ? accent : "rgba(255,255,255,0.4)" }}>
        <Plus className="w-2.5 h-2.5" />Add
      </button>
      {open && (
        <div className="absolute top-full mt-1 z-50 rounded-xl overflow-hidden"
          style={{ ...(alignRight ? { right: 0 } : { left: 0 }), background: "rgba(14,14,16,0.98)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 60px rgba(0,0,0,0.8)", minWidth: 220 }}>
          <div className="px-3 pt-2.5 pb-1 text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.22)" }}>Signals</div>
          {suggestions.map(t => {
            const m = COND_META[t];
            return (
              <button key={t} onClick={() => { onAdd(t); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors" style={{ color: "rgba(255,255,255,0.6)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${m.badgeColor}22`, color: m.badgeColor }}>{m.badge}</span>
                <span className="text-[11px]">{m.label}</span>
              </button>
            );
          })}
          <div className="h-2" />
        </div>
      )}
    </div>
  );
}

function SignalColumn({ side, conditions, logic, ip, accent, onLogicChange, onAdd, onConditionChange, onConditionRemove }: {
  side: "buy"|"short"; conditions: Condition[]; logic: "AND"|"OR"; ip: IndicatorParams; accent: string;
  onLogicChange: (v: "AND"|"OR") => void; onAdd: (t: ConditionType) => void;
  onConditionChange: (id: string, p: Partial<Condition>) => void; onConditionRemove: (id: string) => void;
}) {
  const isLong = side === "buy"; const color = isLong ? "#22c55e" : "#ef4444"; const Icon = isLong ? TrendingUp : TrendingDown;
  const suggestions = isLong ? BUY_SUGGESTIONS : SHORT_SUGGESTIONS;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2">
        <Icon className="w-3 h-3 shrink-0" style={{ color }} />
        <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0" style={{ color }}>{isLong ? "Buy Signal" : "Short Signal"}</span>
        {conditions.length > 1 && <LogicToggle value={logic} onChange={onLogicChange} />}
        <div className="ml-auto"><AddSignalMenu suggestions={suggestions} accent={accent} alignRight={!isLong} onAdd={onAdd} /></div>
      </div>
      {conditions.length === 0 ? (
        <div className="px-2 py-3 text-center rounded-lg" style={{ border: `1px dashed ${color}22`, color: "rgba(255,255,255,0.2)" }}>
          <p className="text-[10px] leading-relaxed">{isLong ? "Conditions that trigger a long entry" : "Conditions that trigger a short entry"}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {conditions.map(c => <ConditionCard key={c.id} cond={c} ip={ip} onChange={onConditionChange} onRemove={onConditionRemove} />)}
        </div>
      )}
    </div>
  );
}

function InvestConditionColumn({ conditions, logic, ip, onLogicChange, onAdd, onConditionChange, onConditionRemove }: {
  conditions: Condition[]; logic: "AND"|"OR"; ip: IndicatorParams;
  onLogicChange: (v: "AND"|"OR") => void; onAdd: (t: ConditionType) => void;
  onConditionChange: (id: string, p: Partial<Condition>) => void; onConditionRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3 h-3 shrink-0" style={{ color: INVEST_ACCENT }} />
        <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0" style={{ color: INVEST_ACCENT }}>Additional Buy Signal</span>
        {conditions.length > 1 && <LogicToggle value={logic} onChange={onLogicChange} />}
        <div className="ml-auto"><AddSignalMenu suggestions={INVEST_SUGGESTIONS} accent={INVEST_ACCENT} onAdd={onAdd} /></div>
      </div>
      {conditions.length === 0 ? (
        <div className="px-2 py-3 text-center rounded-lg" style={{ border: `1px dashed ${INVEST_ACCENT}22`, color: "rgba(255,255,255,0.2)" }}>
          <p className="text-[10px] leading-relaxed">Optional: stack technical signals on top of the strategy above</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {conditions.map(c => <ConditionCard key={c.id} cond={c} ip={ip} onChange={onConditionChange} onRemove={onConditionRemove} />)}
        </div>
      )}
    </div>
  );
}

function IndParamsPanel({ ip, onChange }: { ip: IndicatorParams; onChange: (patch: Partial<IndicatorParams>) => void }) {
  return (
    <div className="grid grid-cols-4 md:grid-cols-8 gap-x-4 gap-y-2 px-4 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      {([["RSI Period","rsiPeriod",2,50],["EMA Fast","emaFast",2,100],["EMA Slow","emaSlow",2,200],["SMA Fast","smaFast",2,100],["SMA Slow","smaSlow",2,500],["BB Period","bbPeriod",2,100],["Stoch K","stochK",2,50],["Stoch D","stochD",1,20]] as [string, keyof IndicatorParams, number, number][])
        .map(([label, key, min, max]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide shrink-0" style={{ color: "rgba(255,255,255,0.22)" }}>{label}</span>
            <NumberInput value={ip[key]} min={min} max={max} onChange={v => onChange({ [key]: v })} />
          </div>
        ))}
    </div>
  );
}

function PrebuiltPicker({ value, onChange }: { value: ActivePrebuilt[]; onChange: (v: ActivePrebuilt[]) => void }) {
  const toggle = (key: PrebuiltStrategy) => {
    if (key === "none") return;
    const exists = value.find(p => p.strategy === key);
    if (exists) onChange(value.filter(p => p.strategy !== key));
    else onChange([...value, { strategy: key, weight: 1 }]);
  };
  const setWeight = (key: PrebuiltStrategy, w: number) => {
    onChange(value.map(p => p.strategy === key ? { ...p, weight: Math.max(0.1, Math.round(w * 10) / 10) } : p));
  };
  const strategies = (Object.entries(PREBUILT_META) as [PrebuiltStrategy, typeof PREBUILT_META[PrebuiltStrategy]][]).filter(([k]) => k !== "none");
  return (
    <div className="overflow-x-auto -mx-4 px-4 md:-mx-5 md:px-5">
      <div className="flex gap-2 pb-1" style={{ minWidth: "max-content" }}>
        {strategies.map(([key, meta]) => {
          const active = value.some(p => p.strategy === key);
          const ap = value.find(p => p.strategy === key);
          return (
            <div key={key} className="flex flex-col gap-1.5 px-3 py-2 rounded-xl transition-all shrink-0"
              style={{ background: active ? `${INVEST_ACCENT}18` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? `${INVEST_ACCENT}50` : "rgba(255,255,255,0.07)"}`, cursor: "pointer" }}
              onClick={() => toggle(key)}>
              <span className="text-[11px] font-semibold leading-tight" style={{ color: active ? INVEST_ACCENT : "rgba(255,255,255,0.55)" }}>{meta.label}</span>
              <span className="text-[9px] leading-snug" style={{ color: active ? `${INVEST_ACCENT}99` : "rgba(255,255,255,0.28)", maxWidth: 120 }}>{meta.description}</span>
              {active && ap && (
                <div className="flex items-center gap-1.5 mt-0.5" onClick={e => e.stopPropagation()}>
                  <span className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>Weight</span>
                  <input type="number" min={0.1} max={10} step={0.1} value={ap.weight}
                    onChange={e => setWeight(key, parseFloat(e.target.value) || 1)}
                    className="w-12 text-center text-[9px] font-mono rounded px-1 py-0.5"
                    style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${INVEST_ACCENT}44`, color: INVEST_ACCENT, outline: "none" }} />
                  <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.3)" }}>×</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function StrategyBacktestPage() {
  const router = useRouter();
  const { activeTicker, setActiveTicker } = useTickerStore();

  const [mode,      setMode]      = useState<Mode>("investing");
  const [ticker,    setTicker]    = useState(activeTicker || "AAPL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [nWindow,   setNWindow]   = useState(300);
  const [positionSize, setPosSize] = useState(100);
  const [ip, setIp] = useState<IndicatorParams>({ rsiPeriod: 14, emaFast: 9, emaSlow: 21, smaFast: 20, smaSlow: 50, bbPeriod: 20, stochK: 14, stochD: 3 });
  const [indParamsOpen, setIndParamsOpen] = useState(false);

  // trading
  const [buyConds,    setBuyConds]    = useState<Condition[]>([]);
  const [buyLogic,    setBuyLogic]    = useState<"AND"|"OR">("AND");
  const [shortConds,  setShortConds]  = useState<Condition[]>([]);
  const [shortLogic,  setShortLogic]  = useState<"AND"|"OR">("AND");
  const [stopLossPct, setStopLossPct] = useState(3);
  const [stopAndRev,  setStopAndRev]  = useState(false);

  // investing
  const [prebuilts,      setPrebuilts]      = useState<ActivePrebuilt[]>([]);
  const [investBuyConds, setInvestBuyConds] = useState<Condition[]>([]);
  const [investBuyLogic, setInvestBuyLogic] = useState<"AND"|"OR">("AND");

  const [loading,     setLoading]     = useState(false);
  const [data,        setData]        = useState<BacktestData | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const accent      = mode === "trading" ? TRADING_ACCENT : INVEST_ACCENT;
  const accentLight = mode === "trading" ? "#c4b5fd" : "#6ee7b7";

  const loadCache = useCallback((t: string): BacktestData | null => {
    try { const raw = localStorage.getItem(`strategy-bt3-${t}`); if (!raw) return null; const d = JSON.parse(raw) as BacktestData; return d.candles?.length >= 2 ? d : null; } catch { return null; }
  }, []);

  const runBacktest = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ ticker, window: String(nWindow), timeframe,
        rsiPeriod: String(ip.rsiPeriod), emaFast: String(ip.emaFast), emaSlow: String(ip.emaSlow),
        smaFast: String(ip.smaFast), smaSlow: String(ip.smaSlow),
        bbPeriod: String(ip.bbPeriod), stochK: String(ip.stochK), stochD: String(ip.stochD) });
      const res  = await fetch(`/api/ai/strategy-backtest?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const d = json as BacktestData;
      setData(d);
      try { localStorage.setItem(`strategy-bt3-${ticker}`, JSON.stringify(d)); } catch { /**/ }
    } catch (e) { setError(String(e)); }
    finally     { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, nWindow, timeframe, ip]);

  useEffect(() => {
    const cached = loadCache(ticker);
    setData(cached ?? null); setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const handleTickerSelect = (t: string) => { const u = t.toUpperCase(); setTicker(u); setActiveTicker(u); setPaletteOpen(false); };

  const mkCond = (type: ConditionType): Condition => ({ id: `${type}-${Date.now()}`, type, enabled: true, threshold: COND_META[type].thresholdDefault });
  const patchArr = (set: React.Dispatch<React.SetStateAction<Condition[]>>) => (id: string, p: Partial<Condition>) => set(prev => prev.map(c => c.id === id ? { ...c, ...p } : c));
  const removeArr = (set: React.Dispatch<React.SetStateAction<Condition[]>>) => (id: string) => set(prev => prev.filter(c => c.id !== id));

  const tradingResult = useMemo(() => mode === "trading" && data ? deriveTrading(data, buyConds, buyLogic, shortConds, shortLogic, stopLossPct, stopAndRev) : null,
    [mode, data, buyConds, buyLogic, shortConds, shortLogic, stopLossPct, stopAndRev]);
  const investResult  = useMemo(() => mode === "investing" && data ? deriveInvesting(data, prebuilts, investBuyConds, investBuyLogic, positionSize) : null,
    [mode, data, prebuilts, investBuyConds, investBuyLogic, positionSize]);

  const sep  = <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />;
  const vsep = <div className="shrink-0" style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} />;

  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined,
    timeframe === "1d" ? { month: "short", day: "numeric", year: "2-digit" } : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes chartIn { from { opacity: 0 } to { opacity: 1 } }` }} />
      <div className="flex flex-col" style={{ position: "fixed", inset: 0, background: "#080808" }}>

        {/* header */}
        <header className="shrink-0 z-20" style={{ background: "rgba(8,8,8,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="px-4 md:px-5 flex items-center gap-3" style={{ height: 52 }}>
            <button onClick={() => router.push("/")} className="flex items-center gap-1.5 transition-colors shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}>
              <ArrowLeft className="w-3.5 h-3.5" /><span className="text-xs hidden sm:inline">Home</span>
            </button>
            {sep}
            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ border: `1px solid ${accent}4d`, background: `${accent}14`, transition: "all 0.3s" }}>
                <FlaskConical className="w-3 h-3" style={{ color: accent }} />
              </div>
              <span className="text-[10px] font-semibold" style={{ color: `${accentLight}a6`, letterSpacing: "0.06em", transition: "color 0.3s" }}>STRATEGY LAB</span>
            </div>
            {sep}
            <button onClick={() => setPaletteOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all max-w-[140px] flex-1 min-w-0"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")} onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}>
              <span className="text-sm font-semibold font-mono text-white truncate">{ticker}</span>
              <ChevronDown className="w-3 h-3 shrink-0 ml-auto" style={{ color: "rgba(255,255,255,0.3)" }} />
            </button>
            {sep}
            <div className="flex rounded-lg overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {TIMEFRAME_OPTS.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} className="px-2.5 py-1.5 text-[10px] font-mono font-medium border-r last:border-r-0 transition-all"
                  style={{ borderColor: "rgba(255,255,255,0.06)", background: timeframe === tf ? `${accent}28` : "transparent", color: timeframe === tf ? accentLight : "rgba(255,255,255,0.28)", transition: "all 0.2s" }}>
                  {tf}
                </button>
              ))}
            </div>
            {sep}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Hist</span>
              <SegPill options={WINDOW_OPTS} active={nWindow} onChange={setNWindow} />
            </div>
            <div className="flex-1" />
            <button onClick={runBacktest} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
              style={{ background: loading ? "rgba(255,255,255,0.04)" : `${accent}22`, border: `1px solid ${loading ? "rgba(255,255,255,0.06)" : `${accent}66`}`, color: loading ? "rgba(255,255,255,0.25)" : accentLight, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
              <span>{loading ? "Running…" : "Run"}</span>
            </button>
          </div>
        </header>

        {/* strategy section */}
        <div className="shrink-0" style={{ background: mode === "trading" ? "rgba(167,139,250,0.02)" : "rgba(52,211,153,0.02)", borderBottom: `1px solid ${accent}18`, transition: "all 0.3s" }}>

          {/* options row */}
          <div className="px-4 md:px-5 pt-2.5 pb-2 flex flex-wrap items-center gap-3">
            {/* mode toggle */}
            <div className="flex rounded-xl overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", padding: 2 }}>
              {(["trading", "investing"] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)} className="px-3.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all"
                  style={{ background: mode === m ? (m === "trading" ? "rgba(167,139,250,0.2)" : "rgba(52,211,153,0.2)") : "transparent", color: mode === m ? (m === "trading" ? "#c4b5fd" : "#6ee7b7") : "rgba(255,255,255,0.3)" }}>
                  {m === "trading" ? "Trading" : "Investing"}
                </button>
              ))}
            </div>
            {sep}
            {/* position size */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Position</span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>$</span>
              <input type="number" min={1} max={100000} value={positionSize} onChange={e => setPosSize(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-center text-[10px] font-mono rounded px-1 py-0.5"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", outline: "none" }} />
            </div>
            {sep}
            {/* trading-only stop controls */}
            {mode === "trading" && (<>
              <div className="flex items-center gap-2 shrink-0">
                <Toggle on={stopAndRev} onChange={setStopAndRev} />
                <span className="text-[10px]" style={{ color: stopAndRev ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.28)" }}>Stop & Reverse</span>
              </div>
              {sep}
              <div className="shrink-0" style={{ minWidth: 200 }}>
                <GateSlider label="Stop" value={stopLossPct} display={stopLossPct === 0 ? "off" : `${stopLossPct.toFixed(1)}%`} min={0} max={15} step={0.5} onChange={setStopLossPct} />
              </div>
              {sep}
            </>)}
            <button onClick={() => setIndParamsOpen(o => !o)} className="text-[10px] px-2 py-0.5 rounded transition-colors shrink-0" style={{ color: "rgba(255,255,255,0.22)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.22)")}>
              Periods {indParamsOpen ? "▲" : "▼"}
            </button>
            <div className="flex-1" />
            {mode === "trading" && tradingResult && (
              <span className="text-[10px] font-mono shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>{tradingResult.summary.tradeCount} trade{tradingResult.summary.tradeCount !== 1 ? "s" : ""}</span>
            )}
            {mode === "investing" && investResult && (
              <span className="text-[10px] font-mono shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>{investResult.summary.nBuys} buy{investResult.summary.nBuys !== 1 ? "s" : ""}</span>
            )}
          </div>

          {indParamsOpen && <IndParamsPanel ip={ip} onChange={patch => setIp(prev => ({ ...prev, ...patch }))} />}

          {/* builder */}
          <div className="px-4 md:px-5 pb-3">
            {mode === "trading" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SignalColumn side="buy" conditions={buyConds} logic={buyLogic} ip={ip} accent={accent} onLogicChange={setBuyLogic}
                  onAdd={t => setBuyConds(p => [...p, mkCond(t)])} onConditionChange={patchArr(setBuyConds)} onConditionRemove={removeArr(setBuyConds)} />
                <SignalColumn side="short" conditions={shortConds} logic={shortLogic} ip={ip} accent={accent} onLogicChange={setShortLogic}
                  onAdd={t => setShortConds(p => [...p, mkCond(t)])} onConditionChange={patchArr(setShortConds)} onConditionRemove={removeArr(setShortConds)} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <PrebuiltPicker value={prebuilts} onChange={setPrebuilts} />
                <InvestConditionColumn conditions={investBuyConds} logic={investBuyLogic} ip={ip} onLogicChange={setInvestBuyLogic}
                  onAdd={t => setInvestBuyConds(p => [...p, mkCond(t)])} onConditionChange={patchArr(setInvestBuyConds)} onConditionRemove={removeArr(setInvestBuyConds)} />
              </div>
            )}
          </div>
        </div>

        {/* chart */}
        <div className="relative overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>
          {!data && !loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${accent}0f`, border: `1px solid ${accent}2e`, transition: "all 0.3s" }}>
                <FlaskConical className="w-7 h-7" style={{ color: `${accent}8c` }} />
              </div>
              <div>
                <p className="text-base font-semibold text-white/60 mb-1.5">{mode === "trading" ? "Strategy Backtest" : "Investment Backtest"}</p>
                <p className="text-sm text-white/25 max-w-[420px] leading-relaxed">
                  {mode === "trading"
                    ? "Build buy and short conditions above, run the backtest, then tune live — the equity curve recomputes instantly."
                    : "Choose a pre-built strategy or stack technical signals, then run to see how your plan has performed historically."}
                </p>
              </div>
              <button onClick={runBacktest} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: `${accent}1a`, border: `1px solid ${accent}40`, color: accentLight }}>
                <FlaskConical className="w-4 h-4" />Backtest {ticker}
              </button>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full animate-ping" style={{ border: `1px solid ${accent}26` }} />
                <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${accent}38` }} />
                <RefreshCw className="absolute inset-0 m-auto w-6 h-6 animate-spin" style={{ color: `${accent}99` }} />
              </div>
              <p className="text-sm font-medium text-white/50">Loading {ticker}…</p>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
              <p className="text-sm text-red-400/80 text-center max-w-sm">{error}</p>
              <button onClick={runBacktest} className="text-xs px-4 py-1.5 rounded-lg" style={{ color: accentLight, border: `1px solid ${accent}33` }}>Retry</button>
            </div>
          )}
          {data && mode === "trading" && tradingResult && !loading && (
            <div className="absolute inset-0">
              <StrategyChart equityCurve={tradingResult.equityCurve} buyHoldCurve={tradingResult.buyHoldCurve} trades={tradingResult.trades} timeframe={data.timeframe} />
            </div>
          )}
          {data && mode === "investing" && investResult && !loading && (
            <div className="absolute inset-0">
              <StrategyChart equityCurve={investResult.portfolioCurve} buyHoldCurve={investResult.bhCurve} trades={[]} timeframe={data.timeframe}
                buyEvents={investResult.buyEvents} sellEvents={investResult.sellEvents} accentColor={INVEST_ACCENT} />
            </div>
          )}
        </div>

        {/* stats + log */}
        {data && !loading && (<>
          {mode === "trading" && tradingResult && (
            <div className="shrink-0" style={{ background: "rgba(8,8,8,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="px-4 md:px-6 py-3 flex items-center gap-5 md:gap-7 overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <Stat label="Strategy" value={fmtPct(tradingResult.summary.totalReturnPct)} color={tradingResult.summary.totalReturnPct >= 0 ? "#22c55e" : "#ef4444"}
                  sub={`${fmtDollar(positionSize * (1 + tradingResult.summary.totalReturnPct / 100))} from ${fmtDollar(positionSize)}`} />
                {vsep}
                <Stat label="Buy & Hold" value={fmtPct(tradingResult.summary.buyHoldReturnPct)} color={tradingResult.summary.buyHoldReturnPct >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)"}
                  sub={tradingResult.summary.totalReturnPct >= tradingResult.summary.buyHoldReturnPct ? "you beat it" : "you trail it"} />
                {vsep}
                <Stat label="Win Rate" value={`${tradingResult.summary.winRate.toFixed(0)}%`} sub={`${tradingResult.summary.tradeCount} trades`} />
                {vsep}
                <Stat label="Profit Factor" value={fmtPF(tradingResult.summary.profitFactor)} />
                {vsep}
                <Stat label="Avg P&L" value={fmtPct(tradingResult.summary.avgPnlPct)} color={tradingResult.summary.avgPnlPct >= 0 ? "#22c55e" : "#ef4444"} />
                <div className="hidden sm:flex items-center gap-5 md:gap-7">
                  {vsep}
                  <Stat label="Best / Worst" value={`${fmtPct(tradingResult.summary.bestPct)} / ${fmtPct(tradingResult.summary.worstPct)}`} />
                  {vsep}
                  <Stat label="Strat CAGR" value={fmtPct(tradingResult.summary.cagrPct)} color={tradingResult.summary.cagrPct >= 0 ? "#22c55e" : "#ef4444"} sub="annualised" />
                  {vsep}
                  <Stat label="Strat Sharpe" value={tradingResult.summary.sharpe.toFixed(2)} sub={`B&H ${tradingResult.summary.bhSharpe.toFixed(2)}`} />
                  {vsep}
                  <Stat label="Strat Sortino" value={tradingResult.summary.sortino.toFixed(2)} sub={`B&H ${tradingResult.summary.bhSortino.toFixed(2)}`} />
                </div>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 168 }}>
                {tradingResult.trades.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>No trades — add conditions in the Buy or Short signal columns above.</div>
                ) : (
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0" style={{ background: "rgba(10,10,12,0.97)" }}>
                      <tr style={{ color: "rgba(255,255,255,0.3)" }}>
                        <th className="text-left font-medium px-4 py-1.5">#</th><th className="text-left font-medium px-2 py-1.5">Entry</th>
                        <th className="text-left font-medium px-2 py-1.5">Dir</th><th className="text-right font-medium px-2 py-1.5">Entry $</th>
                        <th className="text-right font-medium px-2 py-1.5">Exit $</th><th className="text-right font-medium px-2 py-1.5">Bars</th>
                        <th className="text-left font-medium px-2 py-1.5">Why</th><th className="text-right font-medium px-4 py-1.5">P&L</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {tradingResult.trades.map((t, i) => (
                        <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-4 py-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>{i + 1}</td>
                          <td className="px-2 py-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>{fmtDate(t.entryTime)}</td>
                          <td className="px-2 py-1.5"><span className="flex items-center gap-1" style={{ color: t.direction === "long" ? "#22c55e" : "#ef4444" }}>
                            {t.direction === "long" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}{t.direction}
                          </span></td>
                          <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>${t.entryPrice.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>${t.exitPrice.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{t.exitIdx - t.entryIdx}</td>
                          <td className="px-2 py-1.5" style={{ color: t.reason === "stop" ? "#f59e0b" : "rgba(255,255,255,0.4)" }}>{t.reason}</td>
                          <td className="px-4 py-1.5 text-right font-semibold" style={{ color: t.won ? "#22c55e" : "#ef4444" }}>{t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {mode === "investing" && investResult && (
            <div className="shrink-0" style={{ background: "rgba(8,8,8,0.92)", backdropFilter: "blur(20px)", borderTop: `1px solid ${INVEST_ACCENT}22` }}>
              <div className="px-4 md:px-6 py-3 flex items-center gap-5 md:gap-7 overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <Stat label="Strat Value" value={fmtDollar(investResult.summary.finalValue)} color={investResult.summary.returnPct >= 0 ? "#34d399" : "#ef4444"} sub={`${investResult.summary.nBuys} buys`} />
                {vsep}
                <Stat label="B&H Value" value={fmtDollar(investResult.summary.totalInvested * (1 + investResult.summary.bhReturnPct / 100))} sub={`same ${fmtDollar(investResult.summary.totalInvested)} invested`} />
                {vsep}
                <Stat label="Portfolio % PnL" value={fmtPct(investResult.summary.returnPct)} color={investResult.summary.returnPct >= 0 ? "#34d399" : "#ef4444"}
                  sub={investResult.summary.returnPct >= investResult.summary.bhReturnPct ? "beats B&H" : "trails B&H"} />
                {vsep}
                <Stat label="B&H % PnL" value={fmtPct(investResult.summary.bhReturnPct)} color={investResult.summary.bhReturnPct >= 0 ? "rgba(52,211,153,0.6)" : "rgba(239,68,68,0.6)"} />
                {vsep}
                <Stat label="Strat Sharpe" value={investResult.summary.sharpe.toFixed(2)} color={investResult.summary.sharpe >= investResult.summary.bhSharpe ? "#34d399" : undefined} />
                {vsep}
                <Stat label="B&H Sharpe" value={investResult.summary.bhSharpe.toFixed(2)} />
                {vsep}
                <Stat label="Strat Sortino" value={investResult.summary.sortino.toFixed(2)} color={investResult.summary.sortino >= investResult.summary.bhSortino ? "#34d399" : undefined} />
                {vsep}
                <Stat label="B&H Sortino" value={investResult.summary.bhSortino.toFixed(2)} />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 168 }}>
                {investResult.summary.nBuys === 0 ? (
                  <div className="px-4 py-6 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {"No signals — select a pre-built strategy or add technical conditions above."}
                  </div>
                ) : (
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0" style={{ background: "rgba(10,10,12,0.97)" }}>
                      <tr style={{ color: "rgba(255,255,255,0.3)" }}>
                        <th className="text-left font-medium px-4 py-1.5">#</th><th className="text-left font-medium px-2 py-1.5">Date</th>
                        <th className="text-left font-medium px-2 py-1.5">Strategy</th>
                        <th className="text-right font-medium px-2 py-1.5">Buy $</th><th className="text-right font-medium px-2 py-1.5">Shares</th>
                        <th className="text-right font-medium px-2 py-1.5">Cum. Invested</th><th className="text-right font-medium px-2 py-1.5">Now</th>
                        <th className="text-right font-medium px-4 py-1.5">Position Return</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {(() => {
                        const lastClose = data.candles[data.candles.length - 1].close;
                        let cumInvested = 0;
                        return investResult.buyEvents.map((b, i) => {
                          const cost   = positionSize * (b.weight ?? 1);
                          const shares = cost / b.price;
                          cumInvested += cost;
                          const ret    = (lastClose - b.price) / b.price * 100;
                          const stLabel = b.strategy === "custom" ? "Custom" : b.strategy ? (PREBUILT_META[b.strategy as PrebuiltStrategy]?.label ?? b.strategy) : "—";
                          return (
                            <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                              <td className="px-4 py-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>{i + 1}</td>
                              <td className="px-2 py-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>{fmtDate(data.candles[b.idx]?.time ?? 0)}</td>
                              <td className="px-2 py-1.5" style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{stLabel}{(b.weight ?? 1) !== 1 ? ` ${b.weight}×` : ""}</td>
                              <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>${b.price.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{shares.toFixed(4)}</td>
                              <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{fmtDollar(cumInvested)}</td>
                              <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>{fmtDollar(shares * lastClose)}</td>
                              <td className="px-4 py-1.5 text-right font-semibold" style={{ color: ret >= 0 ? "#34d399" : "#ef4444" }}>{ret >= 0 ? "+" : ""}{ret.toFixed(2)}%</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>)}

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelect={handleTickerSelect} variant="home" />
      </div>
    </>
  );
}
