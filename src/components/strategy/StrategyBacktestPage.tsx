"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ArrowLeft, FlaskConical, RefreshCw, ChevronDown, Zap,
  TrendingUp, TrendingDown, Plus, X, Bot, ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTickerStore } from "@/store/tickerStore";
import CommandPalette from "@/components/search/CommandPalette";
import StrategyChart, { CurvePoint, ChartTrade } from "./StrategyChart";

// ─── types ────────────────────────────────────────────────────────────────────
type Timeframe = "1m" | "5m" | "1h" | "1d";

/** Each condition evaluates to boolean — direction comes from which group it lives in. */
type ConditionType =
  | "rsi_lt" | "rsi_gt"
  | "ema_cross_up" | "ema_cross_down"
  | "macd_cross_up" | "macd_cross_down"
  | "bb_lower" | "bb_upper"
  | "stoch_lt" | "stoch_gt"
  | "ai_long" | "ai_short";

interface Condition {
  id: string;
  type: ConditionType;
  enabled: boolean;
  threshold: number;
}

interface EnrichedCandle {
  time: number; open: number; high: number; low: number; close: number;
  upCount: number; totalPaths: number; confidence: number; analysis: string;
  rsi: number | null;
  emaFast: number | null; emaSlow: number | null;
  macdLine: number | null; macdSig: number | null;
  bbUpper: number | null; bbLower: number | null;
  stochK: number | null; stochD: number | null;
  prevEmaFast: number | null; prevEmaSlow: number | null;
  prevMacdLine: number | null; prevMacdSig: number | null;
}

interface BacktestData {
  ticker: string; timeframe: Timeframe; window: number; lookback: number;
  nForecast: number; nRuns: number; withTech: boolean; aiEnabled: boolean;
  failedCandles?: number; candles: EnrichedCandle[];
}

interface IndicatorParams {
  rsiPeriod: number; emaFast: number; emaSlow: number;
  bbPeriod: number; stochK: number; stochD: number;
}

// ─── condition metadata ───────────────────────────────────────────────────────
const COND_META: Record<ConditionType, {
  label: string; badge: string; badgeColor: string;
  hasThreshold: boolean; thresholdDefault: number;
  thresholdMin: number; thresholdMax: number;
  description: (c: Condition, ip: IndicatorParams) => string;
}> = {
  rsi_lt:         { label: "RSI Below",       badge: "RSI",  badgeColor: "#f97316", hasThreshold: true,  thresholdDefault: 30, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `RSI(${ip.rsiPeriod}) < ${c.threshold}` },
  rsi_gt:         { label: "RSI Above",       badge: "RSI",  badgeColor: "#f97316", hasThreshold: true,  thresholdDefault: 70, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `RSI(${ip.rsiPeriod}) > ${c.threshold}` },
  ema_cross_up:   { label: "EMA Cross Up",    badge: "EMA",  badgeColor: "#3b82f6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `EMA(${ip.emaFast}) crosses above EMA(${ip.emaSlow})` },
  ema_cross_down: { label: "EMA Cross Down",  badge: "EMA",  badgeColor: "#3b82f6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `EMA(${ip.emaFast}) crosses below EMA(${ip.emaSlow})` },
  macd_cross_up:  { label: "MACD Cross Up",   badge: "MACD", badgeColor: "#8b5cf6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: () => `MACD crosses above signal line` },
  macd_cross_down:{ label: "MACD Cross Down", badge: "MACD", badgeColor: "#8b5cf6", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: () => `MACD crosses below signal line` },
  bb_lower:       { label: "BB Lower Band",   badge: "BB",   badgeColor: "#06b6d4", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `Price < BB(${ip.bbPeriod}) lower band` },
  bb_upper:       { label: "BB Upper Band",   badge: "BB",   badgeColor: "#06b6d4", hasThreshold: false, thresholdDefault: 0,  thresholdMin: 0,  thresholdMax: 0,  description: (_c, ip) => `Price > BB(${ip.bbPeriod}) upper band` },
  stoch_lt:       { label: "Stoch Below",     badge: "Stch", badgeColor: "#ec4899", hasThreshold: true,  thresholdDefault: 20, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `Stoch(${ip.stochK}) %K < ${c.threshold}` },
  stoch_gt:       { label: "Stoch Above",     badge: "Stch", badgeColor: "#ec4899", hasThreshold: true,  thresholdDefault: 80, thresholdMin: 5,  thresholdMax: 95, description: (c, ip) => `Stoch(${ip.stochK}) %K > ${c.threshold}` },
  ai_long:        { label: "AI Says Long",    badge: "AI",   badgeColor: "#a78bfa", hasThreshold: true,  thresholdDefault: 60, thresholdMin: 51, thresholdMax: 95, description: (c) => `AI bullish agreement ≥ ${c.threshold}%` },
  ai_short:       { label: "AI Says Short",   badge: "AI",   badgeColor: "#a78bfa", hasThreshold: true,  thresholdDefault: 60, thresholdMin: 51, thresholdMax: 95, description: (c) => `AI bearish agreement ≥ ${c.threshold}%` },
};

const BUY_SUGGESTIONS:   ConditionType[] = ["rsi_lt", "ema_cross_up",   "macd_cross_up",   "bb_lower", "stoch_lt", "ai_long"];
const SHORT_SUGGESTIONS: ConditionType[] = ["rsi_gt", "ema_cross_down", "macd_cross_down", "bb_upper", "stoch_gt", "ai_short"];
const ALL_CONDITIONS:    ConditionType[] = ["rsi_lt", "rsi_gt", "ema_cross_up", "ema_cross_down", "macd_cross_up", "macd_cross_down", "bb_lower", "bb_upper", "stoch_lt", "stoch_gt", "ai_long", "ai_short"];

// ─── signal evaluation ────────────────────────────────────────────────────────
function evalCondition(cond: Condition, c: EnrichedCandle, aiEnabled: boolean): boolean {
  switch (cond.type) {
    case "rsi_lt":
      return c.rsi != null && c.rsi < cond.threshold;
    case "rsi_gt":
      return c.rsi != null && c.rsi > cond.threshold;
    case "ema_cross_up":
      return c.emaFast != null && c.emaSlow != null
          && c.prevEmaFast != null && c.prevEmaSlow != null
          && c.prevEmaFast <= c.prevEmaSlow && c.emaFast > c.emaSlow;
    case "ema_cross_down":
      return c.emaFast != null && c.emaSlow != null
          && c.prevEmaFast != null && c.prevEmaSlow != null
          && c.prevEmaFast >= c.prevEmaSlow && c.emaFast < c.emaSlow;
    case "macd_cross_up":
      return c.macdLine != null && c.macdSig != null
          && c.prevMacdLine != null && c.prevMacdSig != null
          && c.prevMacdLine <= c.prevMacdSig && c.macdLine > c.macdSig;
    case "macd_cross_down":
      return c.macdLine != null && c.macdSig != null
          && c.prevMacdLine != null && c.prevMacdSig != null
          && c.prevMacdLine >= c.prevMacdSig && c.macdLine < c.macdSig;
    case "bb_lower":
      return c.bbLower != null && c.close < c.bbLower;
    case "bb_upper":
      return c.bbUpper != null && c.close > c.bbUpper;
    case "stoch_lt":
      return c.stochK != null && c.stochK < cond.threshold;
    case "stoch_gt":
      return c.stochK != null && c.stochK > cond.threshold;
    case "ai_long":
      if (!aiEnabled || c.totalPaths === 0) return false;
      return (c.upCount / c.totalPaths) * 100 >= cond.threshold;
    case "ai_short":
      if (!aiEnabled || c.totalPaths === 0) return false;
      return ((c.totalPaths - c.upCount) / c.totalPaths) * 100 >= cond.threshold;
  }
}

function evalGroup(conditions: Condition[], logic: "AND" | "OR", c: EnrichedCandle, aiEnabled: boolean): boolean {
  const active = conditions.filter(cond => cond.enabled);
  if (active.length === 0) return false;
  if (logic === "AND") return active.every(cond => evalCondition(cond, c, aiEnabled));
  return active.some(cond => evalCondition(cond, c, aiEnabled));
}

function getSignal(
  c: EnrichedCandle,
  buyConditions: Condition[], buyLogic: "AND" | "OR",
  shortConditions: Condition[], shortLogic: "AND" | "OR",
  aiEnabled: boolean,
): "long" | "short" | null {
  const hasBuy   = buyConditions.some(c => c.enabled);
  const hasShort = shortConditions.some(c => c.enabled);
  if (!hasBuy && !hasShort) return null;

  const buyFires   = hasBuy   && evalGroup(buyConditions,   buyLogic,   c, aiEnabled);
  const shortFires = hasShort && evalGroup(shortConditions, shortLogic, c, aiEnabled);

  if (buyFires && !shortFires)  return "long";
  if (shortFires && !buyFires)  return "short";
  return null; // conflict or nothing
}

// ─── derived results ──────────────────────────────────────────────────────────
interface Derived {
  trades: ChartTrade[];
  equityCurve: CurvePoint[];
  buyHoldCurve: CurvePoint[];
  summary: {
    totalReturnPct: number; buyHoldReturnPct: number; winRate: number;
    tradeCount: number; profitFactor: number; avgPnlPct: number;
    bestPct: number; worstPct: number; stopOuts: number;
  };
}

function deriveResults(
  data: BacktestData,
  buyConditions: Condition[], buyLogic: "AND" | "OR",
  shortConditions: Condition[], shortLogic: "AND" | "OR",
  aiEnabled: boolean,
  stopLossPct: number,
  stopAndReverse: boolean,
): Derived | null {
  const cs = data.candles;
  if (cs.length < 2) return null;
  const stopEnabled = stopLossPct > 0;

  interface Open {
    direction: "long" | "short"; entryPrice: number; entryTime: number;
    entryIdx: number; stopPrice: number; entryConfidence: number; entryAnalysis: string;
  }
  let live: Open | null = null;
  let realized = 1;
  const trades: ChartTrade[] = [];
  const equityCurve: CurvePoint[] = [];
  const buyHoldCurve: CurvePoint[] = [];
  const firstClose = cs[0].close;

  const closeTrade = (exitPrice: number, exitTime: number, exitIdx: number, reason: ChartTrade["reason"]) => {
    if (!live) return;
    const rawRet = (exitPrice - live.entryPrice) / live.entryPrice;
    const pnlPct = (live.direction === "long" ? rawRet : -rawRet) * 100;
    realized *= 1 + pnlPct / 100;
    trades.push({
      entryIdx: live.entryIdx, exitIdx, direction: live.direction,
      entryPrice: live.entryPrice, exitPrice, entryTime: live.entryTime, exitTime,
      pnlPct, won: pnlPct > 0, reason,
      entryConfidence: live.entryConfidence, entryAnalysis: live.entryAnalysis,
    });
    live = null;
  };

  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const sig = getSignal(c, buyConditions, buyLogic, shortConditions, shortLogic, aiEnabled);

    let reversedThisCandle = false;

    // 1. Manage live trade
    if (live && live.entryIdx < i) {
      const stopHit = stopEnabled &&
        (live.direction === "long" ? c.low <= live.stopPrice : c.high >= live.stopPrice);
      if (stopHit) {
        // Stop-loss always just closes, never reverses
        closeTrade(live.stopPrice, c.time, i, "stop");
      } else if (sig && sig !== live.direction) {
        // Opposite signal — close the trade
        closeTrade(c.close, c.time, i, "reversal");
        reversedThisCandle = true;
      }
    }

    // 2. Open a new trade if flat and a signal exists (not on the last candle)
    if (!live && i < cs.length - 1 && sig) {
      // Only open immediately on reversal if Stop & Reverse is enabled
      if (!reversedThisCandle || stopAndReverse) {
        live = {
          direction: sig, entryPrice: c.close, entryTime: c.time, entryIdx: i,
          stopPrice: sig === "long"
            ? c.close * (1 - stopLossPct / 100)
            : c.close * (1 + stopLossPct / 100),
          entryConfidence: c.confidence, entryAnalysis: c.analysis,
        };
      }
    }

    // 3. Mark-to-market equity
    let eq = realized;
    if (live && live.entryIdx <= i) {
      const rawRet = (c.close - live.entryPrice) / live.entryPrice;
      eq = realized * (1 + (live.direction === "long" ? rawRet : -rawRet));
    }
    equityCurve.push({ time: c.time, equity: eq });
    buyHoldCurve.push({ time: c.time, equity: c.close / firstClose });
  }

  if (live) {
    const last = cs[cs.length - 1];
    closeTrade(last.close, last.time, cs.length - 1, "end");
    equityCurve[equityCurve.length - 1] = { time: last.time, equity: realized };
  }

  const wins      = trades.filter(t => t.won);
  const grossWin  = wins.reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnlPct < 0).reduce((s, t) => s + t.pnlPct, 0));
  const lastClose = cs[cs.length - 1].close;

  return {
    trades, equityCurve, buyHoldCurve,
    summary: {
      totalReturnPct:   (realized - 1) * 100,
      buyHoldReturnPct: (lastClose / firstClose - 1) * 100,
      winRate:          trades.length ? (wins.length / trades.length) * 100 : 0,
      tradeCount:       trades.length,
      profitFactor:     grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      avgPnlPct:        trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0,
      bestPct:          trades.length ? Math.max(...trades.map(t => t.pnlPct)) : 0,
      worstPct:         trades.length ? Math.min(...trades.map(t => t.pnlPct)) : 0,
      stopOuts:         trades.filter(t => t.reason === "stop").length,
    },
  };
}

// ─── small UI helpers ─────────────────────────────────────────────────────────
const ACCENT = "#a78bfa";
const TIMEFRAME_OPTS: Timeframe[] = ["1m", "5m", "1h", "1d"];
const WINDOW_OPTS    = [20, 60, 150, 300, 500, 750, 1000];
const LOOKBACK_OPTS  = [30, 60, 90, 120, 252];
const FORECAST_OPTS  = [5, 10, 15, 20, 30];

function SegPill({ options, active, onChange }: { options: number[]; active: number; onChange: (v: number) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {options.map(v => (
        <button key={v} onClick={() => onChange(v)}
          className="px-2.5 py-1.5 text-[10px] font-medium tracking-wide transition-all duration-150 border-r last:border-r-0"
          style={{
            borderColor: "rgba(255,255,255,0.06)",
            background: active === v ? "rgba(167,139,250,0.16)" : "transparent",
            color: active === v ? "#c4b5fd" : "rgba(255,255,255,0.28)",
          }}>
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
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 min-w-[80px] h-1 cursor-pointer"
        style={{ accentColor: ACCENT }} />
      <span className="text-[11px] font-mono font-semibold shrink-0 tabular-nums"
        style={{ color: "#c4b5fd", minWidth: 36, textAlign: "right" }}>{display}</span>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch" aria-checked={on}
      onClick={e => { e.stopPropagation(); onChange(!on); }}
      style={{
        width: 32, height: 18, borderRadius: 9, position: "relative", display: "inline-flex",
        alignItems: "center", cursor: "pointer", flexShrink: 0,
        background: on ? "rgba(167,139,250,0.55)" : "rgba(255,255,255,0.12)",
        border: `1px solid ${on ? "rgba(167,139,250,0.7)" : "rgba(255,255,255,0.15)"}`,
        transition: "background 0.15s, border-color 0.15s",
      }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 15 : 3, width: 12, height: 12,
        borderRadius: "50%", transition: "left 0.2s",
        background: on ? "#c4b5fd" : "rgba(255,255,255,0.45)",
      }} />
    </div>
  );
}

function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" min={min} max={max} value={value}
      onChange={e => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
      className="w-12 text-center text-[10px] font-mono rounded px-1 py-0.5"
      style={{
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.7)", outline: "none",
      }}
    />
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

// ─── logic toggle ─────────────────────────────────────────────────────────────
function LogicToggle({ value, onChange }: { value: "AND" | "OR"; onChange: (v: "AND" | "OR") => void }) {
  return (
    <div className="flex rounded overflow-hidden shrink-0"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {(["AND", "OR"] as const).map(l => (
        <button key={l} onClick={() => onChange(l)}
          className="px-1.5 py-0.5 text-[8px] font-bold tracking-widest border-r last:border-r-0 transition-all"
          style={{
            borderColor: "rgba(255,255,255,0.06)",
            background: value === l ? "rgba(167,139,250,0.18)" : "transparent",
            color: value === l ? "#c4b5fd" : "rgba(255,255,255,0.25)",
          }}>{l}</button>
      ))}
    </div>
  );
}

// ─── condition card ────────────────────────────────────────────────────────────
function ConditionCard({
  cond, ip, onChange, onRemove,
}: {
  cond: Condition; ip: IndicatorParams;
  onChange: (id: string, patch: Partial<Condition>) => void;
  onRemove: (id: string) => void;
}) {
  const meta = COND_META[cond.type];
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all"
      style={{
        background: cond.enabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
        border: `1px solid ${cond.enabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`,
        opacity: cond.enabled ? 1 : 0.5,
      }}>
      {/* enable toggle */}
      <Toggle on={cond.enabled} onChange={v => onChange(cond.id, { enabled: v })} />

      {/* badge */}
      <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded shrink-0"
        style={{ background: `${meta.badgeColor}22`, color: meta.badgeColor, border: `1px solid ${meta.badgeColor}33` }}>
        {meta.badge}
      </span>

      {/* description */}
      <span className="text-[10px] flex-1 min-w-0 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
        {meta.description(cond, ip)}
      </span>

      {/* threshold slider */}
      {meta.hasThreshold && (
        <div className="flex items-center gap-1 shrink-0">
          <input type="range"
            min={meta.thresholdMin} max={meta.thresholdMax} step={1} value={cond.threshold}
            onChange={e => onChange(cond.id, { threshold: parseInt(e.target.value) })}
            className="w-14 h-0.5 cursor-pointer" style={{ accentColor: meta.badgeColor }} />
          <span className="text-[9px] font-mono tabular-nums w-5 text-right"
            style={{ color: meta.badgeColor }}>{cond.threshold}</span>
        </div>
      )}

      {/* remove */}
      <button onClick={() => onRemove(cond.id)}
        className="shrink-0 p-0.5 rounded transition-colors ml-0.5"
        style={{ color: "rgba(255,255,255,0.18)" }}
        onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.65)")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.18)")}>
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

// ─── add-signal dropdown ──────────────────────────────────────────────────────
function AddSignalMenu({
  suggestions, aiEnabled, onAdd,
}: {
  suggestions: ConditionType[];
  aiEnabled: boolean;
  onAdd: (type: ConditionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  // Show suggested first, then the rest
  const others = ALL_CONDITIONS.filter(t => !suggestions.includes(t));
  const sections: { title: string; types: ConditionType[] }[] = [
    { title: "Suggested", types: suggestions },
    { title: "Other",     types: others },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all"
        style={{
          background: open ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.07)"}`,
          color: open ? "#c4b5fd" : "rgba(255,255,255,0.4)",
        }}>
        <Plus className="w-2.5 h-2.5" />
        Add
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
          style={{
            background: "rgba(14,14,16,0.98)", border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.8)", minWidth: 240,
          }}>
          {sections.map(g => (
            <div key={g.title}>
              <div className="px-3 pt-2.5 pb-1 text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.22)" }}>{g.title}</div>
              {g.types.map(t => {
                const m = COND_META[t];
                const isAI = t === "ai_long" || t === "ai_short";
                const disabled = isAI && !aiEnabled;
                return (
                  <button key={t}
                    onClick={() => { if (!disabled) { onAdd(t); setOpen(false); } }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
                    style={{ color: disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)", cursor: disabled ? "not-allowed" : "pointer" }}
                    onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: `${m.badgeColor}22`, color: disabled ? "rgba(255,255,255,0.2)" : m.badgeColor }}>
                      {m.badge}
                    </span>
                    <span className="text-[11px]">{m.label}</span>
                    {disabled && <span className="ml-auto text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>AI off</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="h-2" />
        </div>
      )}
    </div>
  );
}

// ─── signal column ────────────────────────────────────────────────────────────
function SignalColumn({
  side, conditions, logic, ip, aiEnabled,
  onLogicChange, onAdd, onConditionChange, onConditionRemove,
}: {
  side: "buy" | "short";
  conditions: Condition[];
  logic: "AND" | "OR";
  ip: IndicatorParams;
  aiEnabled: boolean;
  onLogicChange: (v: "AND" | "OR") => void;
  onAdd: (type: ConditionType) => void;
  onConditionChange: (id: string, patch: Partial<Condition>) => void;
  onConditionRemove: (id: string) => void;
}) {
  const isLong = side === "buy";
  const color  = isLong ? "#22c55e" : "#ef4444";
  const Icon   = isLong ? TrendingUp : TrendingDown;
  const suggestions = isLong ? BUY_SUGGESTIONS : SHORT_SUGGESTIONS;

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {/* column header */}
      <div className="flex items-center gap-2">
        <Icon className="w-3 h-3 shrink-0" style={{ color }} />
        <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0"
          style={{ color }}>{isLong ? "Buy Signal" : "Short Signal"}</span>
        {conditions.length > 1 && <LogicToggle value={logic} onChange={onLogicChange} />}
        <div className="ml-auto">
          <AddSignalMenu suggestions={suggestions} aiEnabled={aiEnabled} onAdd={onAdd} />
        </div>
      </div>

      {/* condition cards */}
      {conditions.length === 0 ? (
        <div className="px-2 py-3 text-center rounded-lg"
          style={{ border: `1px dashed ${color}22`, color: "rgba(255,255,255,0.2)" }}>
          <p className="text-[10px] leading-relaxed">
            {isLong ? "Conditions that trigger a long entry" : "Conditions that trigger a short entry"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {conditions.map(cond => (
            <ConditionCard
              key={cond.id} cond={cond} ip={ip}
              onChange={onConditionChange} onRemove={onConditionRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── indicator params panel ────────────────────────────────────────────────────
function IndParamsPanel({ ip, onChange }: { ip: IndicatorParams; onChange: (patch: Partial<IndicatorParams>) => void }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-x-5 gap-y-2 px-4 py-2"
      style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      {([
        ["RSI Period", "rsiPeriod", 2, 50],
        ["EMA Fast",   "emaFast",   2, 100],
        ["EMA Slow",   "emaSlow",   2, 200],
        ["BB Period",  "bbPeriod",  2, 100],
        ["Stoch K",    "stochK",    2, 50],
        ["Stoch D",    "stochD",    1, 20],
      ] as [string, keyof IndicatorParams, number, number][]).map(([label, key, min, max]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wide shrink-0" style={{ color: "rgba(255,255,255,0.22)" }}>{label}</span>
          <NumberInput value={ip[key]} min={min} max={max} onChange={v => onChange({ [key]: v })} />
        </div>
      ))}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function StrategyBacktestPage() {
  const router = useRouter();
  const { activeTicker, setActiveTicker } = useTickerStore();

  const [ticker,    setTicker]    = useState(activeTicker || "AAPL");
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [nWindow,   setNWindow]   = useState(60);

  // AI params
  const [aiEnabled,   setAiEnabled]   = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [nLookback,   setNLookback]   = useState(120);
  const [nForecast,   setNForecast]   = useState(10);
  const [nRuns,       setNRuns]       = useState(1);
  const [technicals,  setTechnicals]  = useState(true);

  // Indicator periods
  const [ip, setIp] = useState<IndicatorParams>({
    rsiPeriod: 14, emaFast: 9, emaSlow: 21, bbPeriod: 20, stochK: 14, stochD: 3,
  });
  const [indParamsOpen, setIndParamsOpen] = useState(false);

  // Strategy builder
  const [buyConditions,  setBuyConditions]  = useState<Condition[]>([]);
  const [buyLogic,       setBuyLogic]       = useState<"AND" | "OR">("AND");
  const [shortConditions, setShortConditions] = useState<Condition[]>([]);
  const [shortLogic,     setShortLogic]     = useState<"AND" | "OR">("AND");
  const [stopLossPct,    setStopLossPct]    = useState(3);
  const [stopAndReverse, setStopAndReverse] = useState(false);

  const [loading,     setLoading]     = useState(false);
  const [data,        setData]        = useState<BacktestData | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── cache ──────────────────────────────────────────────────────────────────
  const loadCache = useCallback((t: string): BacktestData | null => {
    try {
      const raw = localStorage.getItem(`strategy-bt2-${t}`);
      if (!raw) return null;
      const d = JSON.parse(raw) as BacktestData;
      return d.candles && d.candles.length >= 2 ? d : null;
    } catch { return null; }
  }, []);
  const saveCache = (t: string, d: BacktestData) => {
    try { localStorage.setItem(`strategy-bt2-${t}`, JSON.stringify(d)); } catch { /**/ }
  };

  const runBacktest = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        ticker, window: String(nWindow), lookback: String(nLookback),
        nForecast: String(nForecast), nRuns: String(nRuns),
        technicals: String(technicals), timeframe,
        aiEnabled: String(aiEnabled),
        rsiPeriod: String(ip.rsiPeriod), emaFast: String(ip.emaFast),
        emaSlow: String(ip.emaSlow), bbPeriod: String(ip.bbPeriod),
        stochK: String(ip.stochK), stochD: String(ip.stochD),
      });
      const res  = await fetch(`/api/ai/strategy-backtest?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const d = json as BacktestData;
      setData(d); saveCache(ticker, d);
    } catch (e) { setError(String(e)); }
    finally     { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, nWindow, nLookback, nForecast, nRuns, technicals, timeframe, aiEnabled, ip]);

  useEffect(() => {
    const cached = loadCache(ticker);
    if (cached) { setData(cached); setError(null); }
    else        { setData(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const handleTickerSelect = (t: string) => {
    const u = t.toUpperCase();
    setTicker(u); setActiveTicker(u); setPaletteOpen(false);
  };

  // Condition helpers
  const addToGroup = (group: "buy" | "short", type: ConditionType) => {
    const meta = COND_META[type];
    const cond: Condition = { id: `${type}-${Date.now()}`, type, enabled: true, threshold: meta.thresholdDefault };
    if (group === "buy") setBuyConditions(prev => [...prev, cond]);
    else setShortConditions(prev => [...prev, cond]);
  };
  const patchBuy   = (id: string, patch: Partial<Condition>) => setBuyConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const patchShort = (id: string, patch: Partial<Condition>) => setShortConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const removeBuy   = (id: string) => setBuyConditions(prev => prev.filter(c => c.id !== id));
  const removeShort = (id: string) => setShortConditions(prev => prev.filter(c => c.id !== id));

  // Client-side simulation
  const result = useMemo(
    () => data ? deriveResults(data, buyConditions, buyLogic, shortConditions, shortLogic, aiEnabled, stopLossPct, stopAndReverse) : null,
    [data, buyConditions, buyLogic, shortConditions, shortLogic, aiEnabled, stopLossPct, stopAndReverse],
  );

  const fmtPF  = (pf: number) => (pf === Infinity ? "∞" : pf.toFixed(2));
  const fmtPct = (p: number)  => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;

  const sep = <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />;

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: `@keyframes chartIn { from { opacity: 0 } to { opacity: 1 } }` }} />
    <div className="flex flex-col" style={{ position: "fixed", inset: 0, background: "#080808" }}>

      {/* ── header ───────────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-20"
        style={{ background: "rgba(8,8,8,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>

        <div className="px-4 md:px-5 flex items-center gap-3" style={{ height: 52 }}>
          {/* back */}
          <button onClick={() => router.push("/")}
            className="flex items-center gap-1.5 transition-colors shrink-0"
            style={{ color: "rgba(255,255,255,0.28)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}>
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="text-xs hidden sm:inline">Home</span>
          </button>
          {sep}

          {/* logo */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <div className="w-5 h-5 rounded flex items-center justify-center"
              style={{ border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)" }}>
              <FlaskConical className="w-3 h-3" style={{ color: ACCENT }} />
            </div>
            <span className="text-[10px] font-semibold" style={{ color: "rgba(196,181,253,0.65)", letterSpacing: "0.06em" }}>STRATEGY LAB</span>
          </div>
          {sep}

          {/* ticker */}
          <button onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all max-w-[140px] flex-1 min-w-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}>
            <span className="text-sm font-semibold font-mono text-white truncate">{ticker}</span>
            <ChevronDown className="w-3 h-3 shrink-0 ml-auto" style={{ color: "rgba(255,255,255,0.3)" }} />
          </button>
          {sep}

          {/* TF */}
          <div className="flex rounded-lg overflow-hidden shrink-0"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {TIMEFRAME_OPTS.map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                className="px-2.5 py-1.5 text-[10px] font-mono font-medium border-r last:border-r-0 transition-all"
                style={{
                  borderColor: "rgba(255,255,255,0.06)",
                  background: timeframe === tf ? "rgba(167,139,250,0.16)" : "transparent",
                  color: timeframe === tf ? "#c4b5fd" : "rgba(255,255,255,0.28)",
                }}>{tf}</button>
            ))}
          </div>
          {sep}

          {/* HIST */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Hist</span>
            <SegPill options={WINDOW_OPTS} active={nWindow} onChange={setNWindow} />
          </div>

          <div className="flex-1" />

          {/* AI toggle */}
          <button
            onClick={() => setAiPanelOpen(o => !o)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all shrink-0"
            style={{
              background: aiPanelOpen ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${aiPanelOpen ? "rgba(167,139,250,0.25)" : "rgba(255,255,255,0.07)"}`,
              color: aiPanelOpen ? "#c4b5fd" : "rgba(255,255,255,0.35)",
            }}>
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI</span>
            <ChevronRight className="w-3 h-3 transition-transform"
              style={{ transform: aiPanelOpen ? "rotate(90deg)" : "none" }} />
            <Toggle on={aiEnabled} onChange={setAiEnabled} />
          </button>
          {sep}

          {/* run */}
          <button onClick={runBacktest} disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
            style={{
              background: loading ? "rgba(255,255,255,0.04)" : "rgba(167,139,250,0.14)",
              border: `1px solid ${loading ? "rgba(255,255,255,0.06)" : "rgba(167,139,250,0.4)"}`,
              color: loading ? "rgba(255,255,255,0.25)" : "#c4b5fd",
              cursor: loading ? "not-allowed" : "pointer",
            }}>
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
            <span>{loading ? "Running…" : "Run"}</span>
          </button>
        </div>

        {/* AI panel */}
        {aiPanelOpen && (
          <div className="px-4 md:px-5 py-2.5 flex flex-wrap items-center gap-4"
            style={{ borderTop: "1px solid rgba(167,139,250,0.1)", background: "rgba(167,139,250,0.03)" }}>
            <div className="flex items-center gap-1.5">
              <Bot className="w-3 h-3" style={{ color: ACCENT }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#c4b5fd" }}>AI Settings</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded ml-1"
                style={{ background: aiEnabled ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.06)", color: aiEnabled ? "#c4b5fd" : "rgba(255,255,255,0.3)" }}>
                {aiEnabled ? "on" : "off"}
              </span>
            </div>
            {sep}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Look</span>
              <SegPill options={LOOKBACK_OPTS} active={nLookback} onChange={setNLookback} />
            </div>
            {sep}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Fcst</span>
              <SegPill options={FORECAST_OPTS} active={nForecast} onChange={setNForecast} />
            </div>
            {sep}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Runs</span>
              <div className="flex items-center rounded-lg overflow-hidden"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <button onClick={() => setNRuns(v => Math.max(1, v - 1))}
                  className="px-2 py-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>−</button>
                <span className="text-[10px] font-mono font-medium px-1.5"
                  style={{ color: "rgba(255,255,255,0.65)", minWidth: 14, textAlign: "center" }}>{nRuns}</span>
                <button onClick={() => setNRuns(v => Math.min(3, v + 1))}
                  className="px-2 py-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>+</button>
              </div>
            </div>
            {sep}
            <button onClick={() => setTechnicals(v => !v)}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium tracking-wide transition-all shrink-0"
              style={{
                background: technicals ? "rgba(192,192,204,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${technicals ? "rgba(192,192,204,0.28)" : "rgba(255,255,255,0.07)"}`,
                color: technicals ? "rgba(210,210,220,0.9)" : "rgba(255,255,255,0.28)",
              }}>Technicals</button>
            {!aiEnabled && (
              <span className="text-[9px] ml-2" style={{ color: "rgba(255,255,255,0.25)" }}>
                Enable AI to use "AI Says Long / Short" conditions
              </span>
            )}
          </div>
        )}
      </header>

      {/* ── strategy builder ─────────────────────────────────────────────────── */}
      <div className="shrink-0"
        style={{ background: "rgba(167,139,250,0.025)", borderBottom: "1px solid rgba(167,139,250,0.08)" }}>

        {/* options row */}
        <div className="px-4 md:px-5 pt-2.5 pb-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <Zap className="w-3 h-3" style={{ color: ACCENT }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#c4b5fd" }}>Strategy</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(167,139,250,0.14)", color: "rgba(196,181,253,0.7)" }}>live</span>
          </div>

          {sep}

          {/* stop & reverse */}
          <div className="flex items-center gap-2 shrink-0">
            <Toggle on={stopAndReverse} onChange={setStopAndReverse} />
            <span className="text-[10px]" style={{ color: stopAndReverse ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.28)" }}>
              Stop & Reverse
            </span>
          </div>

          {sep}

          {/* stop-loss */}
          <div className="shrink-0" style={{ minWidth: 200 }}>
            <GateSlider label="Stop" value={stopLossPct}
              display={stopLossPct === 0 ? "off" : `${stopLossPct.toFixed(1)}%`}
              min={0} max={15} step={0.5} onChange={setStopLossPct} />
          </div>

          {/* indicator params */}
          <button
            onClick={() => setIndParamsOpen(o => !o)}
            className="text-[10px] px-2 py-0.5 rounded transition-colors shrink-0 ml-auto"
            style={{ color: "rgba(255,255,255,0.22)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.22)")}>
            Periods {indParamsOpen ? "▲" : "▼"}
          </button>

          {/* status */}
          {data?.failedCandles ? (
            <span className="text-[10px] font-mono shrink-0" style={{ color: "#f59e0b" }}>
              ⚠ {data.failedCandles} failed
            </span>
          ) : null}
          {result && (
            <span className="text-[10px] font-mono shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
              {result.summary.tradeCount} trade{result.summary.tradeCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {indParamsOpen && <IndParamsPanel ip={ip} onChange={patch => setIp(prev => ({ ...prev, ...patch }))} />}

        {/* two-column signal builder */}
        <div className="px-4 md:px-5 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <SignalColumn
            side="buy" conditions={buyConditions} logic={buyLogic} ip={ip} aiEnabled={aiEnabled}
            onLogicChange={setBuyLogic} onAdd={t => addToGroup("buy", t)}
            onConditionChange={patchBuy} onConditionRemove={removeBuy}
          />
          <SignalColumn
            side="short" conditions={shortConditions} logic={shortLogic} ip={ip} aiEnabled={aiEnabled}
            onLogicChange={setShortLogic} onAdd={t => addToGroup("short", t)}
            onConditionChange={patchShort} onConditionRemove={removeShort}
          />
        </div>
      </div>

      {/* ── chart ────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>

        {!data && !loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)" }}>
              <FlaskConical className="w-7 h-7" style={{ color: "rgba(167,139,250,0.55)" }} />
            </div>
            <div>
              <p className="text-base font-semibold text-white/60 mb-1.5">Strategy Backtest</p>
              <p className="text-sm text-white/25 max-w-[400px] leading-relaxed">
                Build entry rules in the Buy and Short columns above, run the backtest, then tune rules live — the equity curve recomputes instantly.
              </p>
            </div>
            <button onClick={runBacktest}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)", color: "#c4b5fd" }}>
              <FlaskConical className="w-4 h-4" />
              Backtest {ticker}
            </button>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full animate-ping"
                style={{ border: "1px solid rgba(167,139,250,0.15)" }} />
              <div className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(167,139,250,0.22)" }} />
              <RefreshCw className="absolute inset-0 m-auto w-6 h-6 animate-spin"
                style={{ color: "rgba(167,139,250,0.6)" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/50 mb-1">
                {aiEnabled ? `Backtesting ${ticker} with AI…` : `Loading ${ticker}…`}
              </p>
              <p className="text-xs text-white/25">
                {aiEnabled
                  ? `${nWindow} candles × ${nRuns} run${nRuns > 1 ? "s" : ""} · this takes a while`
                  : `${nWindow} candles · computing indicators`}
              </p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
            <p className="text-sm text-red-400/80 text-center max-w-sm">{error}</p>
            <button onClick={runBacktest}
              className="text-xs px-4 py-1.5 rounded-lg"
              style={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.2)" }}>Retry</button>
          </div>
        )}

        {data && result && !loading && (
          <div className="absolute inset-0">
            <StrategyChart
              equityCurve={result.equityCurve}
              buyHoldCurve={result.buyHoldCurve}
              trades={result.trades}
              timeframe={data.timeframe}
            />
          </div>
        )}
      </div>

      {/* ── stats + trade log ────────────────────────────────────────────────── */}
      {data && result && !loading && (
        <div className="shrink-0"
          style={{ background: "rgba(8,8,8,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>

          <div className="px-4 md:px-6 py-3 flex items-center gap-5 md:gap-7 overflow-x-auto"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <Stat label="Strategy"
              value={fmtPct(result.summary.totalReturnPct)}
              color={result.summary.totalReturnPct >= 0 ? "#22c55e" : "#ef4444"}
              sub={result.summary.totalReturnPct >= result.summary.buyHoldReturnPct ? "beats buy & hold" : "trails buy & hold"} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0" />
            <Stat label="Buy & Hold"
              value={fmtPct(result.summary.buyHoldReturnPct)}
              color={result.summary.buyHoldReturnPct >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)"} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0" />
            <Stat label="Win Rate"
              value={`${result.summary.winRate.toFixed(0)}%`}
              sub={`${result.summary.tradeCount} trades`} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0" />
            <Stat label="Profit Factor" value={fmtPF(result.summary.profitFactor)} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0" />
            <Stat label="Avg P&L"
              value={fmtPct(result.summary.avgPnlPct)}
              color={result.summary.avgPnlPct >= 0 ? "#22c55e" : "#ef4444"} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0 hidden sm:block" />
            <div className="hidden sm:block">
              <Stat label="Best / Worst"
                value={`${fmtPct(result.summary.bestPct)} / ${fmtPct(result.summary.worstPct)}`} />
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 168 }}>
            {result.trades.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                No trades — add conditions in the Buy or Short signal columns above.
              </div>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0" style={{ background: "rgba(10,10,12,0.97)" }}>
                  <tr style={{ color: "rgba(255,255,255,0.3)" }}>
                    <th className="text-left  font-medium px-4 py-1.5">#</th>
                    <th className="text-left  font-medium px-2 py-1.5">Entry</th>
                    <th className="text-left  font-medium px-2 py-1.5">Dir</th>
                    <th className="text-right font-medium px-2 py-1.5">Entry $</th>
                    <th className="text-right font-medium px-2 py-1.5">Exit $</th>
                    <th className="text-right font-medium px-2 py-1.5">Bars</th>
                    <th className="text-left  font-medium px-2 py-1.5">Why</th>
                    <th className="text-right font-medium px-4 py-1.5">P&L</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.trades.map((t, i) => {
                    const dt = new Date(t.entryTime * 1000);
                    const dateStr = data.timeframe === "1d"
                      ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })
                      : dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                    return (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-4 py-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>{i + 1}</td>
                        <td className="px-2 py-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>{dateStr}</td>
                        <td className="px-2 py-1.5">
                          <span className="flex items-center gap-1"
                            style={{ color: t.direction === "long" ? "#22c55e" : "#ef4444" }}>
                            {t.direction === "long" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            {t.direction}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>${t.entryPrice.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>${t.exitPrice.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{t.exitIdx - t.entryIdx}</td>
                        <td className="px-2 py-1.5"
                          style={{ color: t.reason === "stop" ? "#f59e0b" : "rgba(255,255,255,0.4)" }}>{t.reason}</td>
                        <td className="px-4 py-1.5 text-right font-semibold"
                          style={{ color: t.won ? "#22c55e" : "#ef4444" }}>
                          {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={handleTickerSelect}
        variant="home"
      />
    </div>
    </>
  );
}
