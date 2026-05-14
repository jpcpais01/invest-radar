"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Sparkles, RefreshCw, TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTickerStore } from "@/store/tickerStore";
import CommandPalette from "@/components/search/CommandPalette";
import ForecastChart from "./ForecastChart";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────
interface ForecastData {
  ticker: string;
  historical: { time: number; close: number }[];
  lastClose: number;
  futureDates: number[];
  predictions: number[][];
  scenarios: { bear: number[]; base: number[]; bull: number[] };
  confidence: number;
  analysis: string;
  nHistory: number;
  nForecast: number;
  timeframe?: Timeframe;
  isBacktest?: boolean;
  backtestSepTime?: number;
  backtestActuals?: number[];
}

type Timeframe = "1m" | "5m" | "1h" | "1d";
const TIMEFRAME_OPTS: Timeframe[] = ["1m", "5m", "1h", "1d"];
const HISTORY_OPTS  = [30, 60, 90, 120, 252];
const FORECAST_OPTS = [5, 10, 15, 20, 30];
const RUNS_OPTS     = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const REWIND_OPTS   = [15, 30, 45, 60];

function tfCandleLabel(tf: Timeframe) {
  return tf === "1d" ? "day" : tf === "1h" ? "1h candle" : tf === "5m" ? "5m candle" : "1m candle";
}

function pct(from: number, to: number) {
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

// ─── glass segment pill ───────────────────────────────────────────────────────
function SegPill({
  options, active, onChange, suffix = "",
}: { options: number[]; active: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex rounded-lg overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {options.map(v => (
        <button key={v} onClick={() => onChange(v)}
          className={cn(
            "px-2.5 py-1.5 text-[10px] font-medium tracking-wide transition-all duration-150",
            "border-r last:border-r-0",
            active === v
              ? "text-[#e0e0e8]"
              : "text-[rgba(255,255,255,0.28)] hover:text-[rgba(255,255,255,0.55)]",
          )}
          style={{
            borderColor: "rgba(255,255,255,0.06)",
            background: active === v ? "rgba(255,255,255,0.09)" : "transparent",
          }}
        >
          {v}{suffix}
        </button>
      ))}
    </div>
  );
}

// ─── runs stepper ─────────────────────────────────────────────────────────────
function RunsStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Runs</span>
      <div className="flex items-center rounded-lg overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <button onClick={() => onChange(Math.max(1, value - 1))}
          className="px-2 py-1.5 text-[11px] transition-colors"
          style={{ color: "rgba(255,255,255,0.35)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
        >−</button>
        <span className="text-[10px] font-mono font-medium px-1.5"
          style={{ color: "rgba(255,255,255,0.65)", minWidth: 14, textAlign: "center" }}>{value}</span>
        <button onClick={() => onChange(Math.min(10, value + 1))}
          className="px-2 py-1.5 text-[11px] transition-colors"
          style={{ color: "rgba(255,255,255,0.35)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
        >+</button>
      </div>
    </div>
  );
}

// ─── technicals toggle ─────────────────────────────────────────────────────────
function TechnicalsToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium tracking-wide transition-all shrink-0"
      style={{
        background: active ? "rgba(192,192,204,0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "rgba(192,192,204,0.28)" : "rgba(255,255,255,0.07)"}`,
        color: active ? "rgba(210,210,220,0.90)" : "rgba(255,255,255,0.28)",
      }}
    >
      Technicals
    </button>
  );
}

// ─── backtest toggle ──────────────────────────────────────────────────────────
function BacktestToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium tracking-wide transition-all shrink-0"
      style={{
        background: active ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.07)"}`,
        color: active ? "rgba(251,191,36,0.95)" : "rgba(255,255,255,0.28)",
      }}
    >
      Backtest
    </button>
  );
}

// ─── rewind pill ──────────────────────────────────────────────────────────────
function RewindPill({ value, onChange, enabled }: { value: number; onChange: (v: number) => void; enabled: boolean }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 transition-opacity"
      style={{ opacity: enabled ? 1 : 0.28, pointerEvents: enabled ? "auto" : "none" }}>
      <span className="text-[10px] uppercase tracking-widest shrink-0"
        style={{ color: "rgba(255,255,255,0.2)" }}>Rwd</span>
      <div className="flex rounded-lg overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${enabled ? "rgba(245,158,11,0.20)" : "rgba(255,255,255,0.07)"}` }}>
        {REWIND_OPTS.map(v => (
          <button key={v} onClick={() => onChange(v)}
            className={cn(
              "px-2.5 py-1.5 text-[10px] font-medium tracking-wide transition-all duration-150",
              "border-r last:border-r-0",
              value === v ? "text-[#fbbf24]" : "text-[rgba(255,255,255,0.28)] hover:text-[rgba(255,255,255,0.55)]",
            )}
            style={{
              borderColor: "rgba(255,255,255,0.06)",
              background: value === v ? "rgba(245,158,11,0.10)" : "transparent",
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── timeframe pill ───────────────────────────────────────────────────────────
function TimeframePill({ active, onChange }: { active: Timeframe; onChange: (v: Timeframe) => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>TF</span>
      <div className="flex rounded-lg overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {TIMEFRAME_OPTS.map(tf => (
          <button key={tf} onClick={() => onChange(tf)}
            className={cn(
              "px-2.5 py-1.5 text-[10px] font-medium font-mono tracking-wide transition-all duration-150",
              "border-r last:border-r-0",
              active === tf
                ? "text-[#e0e0e8]"
                : "text-[rgba(255,255,255,0.28)] hover:text-[rgba(255,255,255,0.55)]",
            )}
            style={{
              borderColor: "rgba(255,255,255,0.06)",
              background: active === tf ? "rgba(255,255,255,0.09)" : "transparent",
            }}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── scenario stat ─────────────────────────────────────────────────────────────
function ScenStat({
  label, price, from, color, icon,
}: { label: string; price: number | null; from: number; color: string; icon: React.ReactNode }) {
  if (price === null) return null;
  const change = pct(from, price);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span style={{ color }} className="opacity-60">{icon}</span>
        <span className="text-[10px] text-[rgba(255,255,255,0.25)] uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold font-mono" style={{ color }}>
          ${price.toFixed(2)}
        </span>
        <span className="text-[10px] font-mono" style={{ color, opacity: 0.7 }}>{change}</span>
      </div>
    </div>
  );
}

// ─── confidence ring ──────────────────────────────────────────────────────────
function ConfidenceRing({ value }: { value: number }) {
  const r = 14, circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const color = value >= 66 ? "#22c55e" : value >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-9 h-9">
        <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="2.5"
            strokeDasharray={`${dash.toFixed(2)} ${circ.toFixed(2)}`}
            strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-semibold"
          style={{ color }}>
          {value}
        </span>
      </div>
      <div>
        <div className="text-[9px] text-[rgba(255,255,255,0.25)] uppercase tracking-widest leading-none mb-0.5">Confidence</div>
        <div className="text-[10px] font-medium" style={{ color }}>
          {value >= 66 ? "High" : value >= 40 ? "Medium" : "Low"}
        </div>
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function ForecastPage() {
  const router = useRouter();
  const { activeTicker, setActiveTicker } = useTickerStore();

  const [ticker,    setTicker]    = useState(activeTicker || "AAPL");
  const [nHistory,    setNHistory]    = useState(120);
  const [nForecast,   setNForecast]   = useState(20);
  const [nRuns,       setNRuns]       = useState(5);
  const [technicals,  setTechnicals]  = useState(true);
  const [timeframe,   setTimeframe]   = useState<Timeframe>("1d");
  const [backtest,    setBacktest]    = useState(false);
  const [rewind,      setRewind]      = useState(30);
  const [loading,     setLoading]     = useState(false);
  const [data,      setData]      = useState<ForecastData | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── cache ────────────────────────────────────────────────────────────────────
  const loadCache = (t: string): ForecastData | null => {
    try {
      const raw = localStorage.getItem(`forecast-${t}`);
      if (!raw) return null;
      const d = JSON.parse(raw) as ForecastData;
      return d.predictions && d.scenarios ? d : null;
    } catch { return null; }
  };
  const saveCache = (d: ForecastData) => {
    try { localStorage.setItem(`forecast-${d.ticker}`, JSON.stringify(d)); } catch { /**/ }
  };

  // ── API ──────────────────────────────────────────────────────────────────────
  const runForecast = useCallback(async (
    t: string, hist: number, fore: number, runs: number, tech: boolean, tf: Timeframe,
    bt: boolean, rw: number,
  ) => {
    setLoading(true); setError(null);
    try {
      const url = `/api/ai/forecast?ticker=${t}&nHistory=${hist}&nForecast=${fore}&nRuns=${runs}&technicals=${tech}&timeframe=${tf}&backtest=${bt}&rewind=${rw}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const d = json as ForecastData;
      setData(d); saveCache(d);
    } catch (e) { setError(String(e)); }
    finally     { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── restore cache on ticker change ───────────────────────────────────────────
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

  const bull = data?.scenarios.bull.at(-1) ?? null;
  const base = data?.scenarios.base.at(-1) ?? null;
  const bear = data?.scenarios.bear.at(-1) ?? null;

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes chartIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    ` }} />
    <div className="flex flex-col" style={{ position: "fixed", inset: 0, background: "#080808" }}>

      {/* ── top bar ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-20"
        style={{ background: "rgba(8,8,8,0.80)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* shared back + logo + ticker + run pieces */}
        {(() => {
          const backBtn = (
            <button onClick={() => router.push("/")}
              className="flex items-center gap-1.5 group transition-colors shrink-0"
              style={{ color: "rgba(255,255,255,0.28)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-xs">Home</span>
            </button>
          );
          const logo = (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-5 h-5 rounded flex items-center justify-center"
                style={{ border: "1px solid rgba(192,192,204,0.18)", background: "rgba(192,192,204,0.05)" }}>
                <span style={{ color: "rgba(192,192,204,0.8)", fontSize: 8, fontWeight: 700 }}>◆</span>
              </div>
              <span className="hidden md:inline text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>AI FORECAST</span>
            </div>
          );
          const tickerBtn = (
            <button onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all flex-1 min-w-0"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            >
              <span className="text-sm font-semibold font-mono text-white truncate">{ticker}</span>
              <ChevronDown className="w-3 h-3 shrink-0 ml-auto" style={{ color: "rgba(255,255,255,0.3)" }} />
            </button>
          );
          const runBtn = (
            <button onClick={() => runForecast(ticker, nHistory, nForecast, nRuns, technicals, timeframe, backtest, rewind)} disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
              style={{
                background: loading ? "rgba(255,255,255,0.04)" : "rgba(192,192,204,0.10)",
                border: `1px solid ${loading ? "rgba(255,255,255,0.06)" : "rgba(192,192,204,0.22)"}`,
                color: loading ? "rgba(255,255,255,0.25)" : "rgba(192,192,204,0.90)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{loading ? "Analyzing…" : "Run Forecast"}</span>
            </button>
          );
          const div = <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />;
          const histSuffix = timeframe === "1d" ? "d" : "";
          const controls = (
            <>
              <TimeframePill active={timeframe} onChange={setTimeframe} />
              {div}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>Hist</span>
                <SegPill options={HISTORY_OPTS} active={nHistory} onChange={setNHistory} suffix={histSuffix} />
              </div>
              {div}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>Fcst</span>
                <SegPill options={FORECAST_OPTS} active={nForecast} onChange={setNForecast} suffix={histSuffix} />
              </div>
              {div}
              <RunsStepper value={nRuns} onChange={setNRuns} />
              {div}
              <TechnicalsToggle active={technicals} onChange={setTechnicals} />
              {div}
              <BacktestToggle active={backtest} onChange={setBacktest} />
              {div}
              <RewindPill value={rewind} onChange={setRewind} enabled={backtest} />
            </>
          );
          return (
            <>
              {/* MOBILE — two rows */}
              <div className="md:hidden">
                <div className="px-4 h-12 flex items-center gap-3">
                  {backBtn}{div}{tickerBtn}{runBtn}
                </div>
                <div className="px-4 h-10 flex items-center gap-4 overflow-x-auto"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  {controls}
                </div>
              </div>

              {/* DESKTOP — single row */}
              <div className="hidden md:flex px-5 h-14 items-center gap-4">
                {backBtn}{div}{logo}{div}{tickerBtn}
                <div className="flex items-center gap-4 ml-auto">
                  {controls}{div}{runBtn}
                </div>
              </div>
            </>
          );
        })()}
      </header>

      {/* ── chart area ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>

        {/* empty state */}
        {!data && !loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <div className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle at 50% 40%, rgba(192,192,204,0.03) 0%, transparent 65%)",
              }}
            />
            <div className="relative flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <Sparkles className="w-7 h-7" style={{ color: "rgba(192,192,204,0.35)" }} />
              </div>
              <div>
                <p className="text-base font-semibold text-white/60 mb-1.5">AI Price Forecast</p>
                <p className="text-sm text-white/20 max-w-[280px] leading-relaxed">
                  Claude analyzes {nHistory} {timeframe} candles{technicals ? " with RSI, EMA crossover & ADX" : ""}
                  {" "}to produce {nForecast}-{tfCandleLabel(timeframe)} bear / base / bull scenarios.
                </p>
              </div>
              <button onClick={() => runForecast(ticker, nHistory, nForecast, nRuns, technicals, timeframe, backtest, rewind)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: "rgba(192,192,204,0.08)",
                  border: "1px solid rgba(192,192,204,0.18)",
                  color: "rgba(192,192,204,0.85)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(192,192,204,0.13)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(192,192,204,0.08)")}
              >
                <Sparkles className="w-4 h-4" />
                Forecast {ticker}
              </button>
            </div>
          </div>
        )}

        {/* loading state */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
            <div className="absolute inset-0"
              style={{ backgroundImage: "radial-gradient(circle at 50% 40%, rgba(192,192,204,0.04) 0%, transparent 60%)" }}
            />
            <div className="relative flex flex-col items-center gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full animate-ping"
                  style={{ border: "1px solid rgba(192,192,204,0.15)" }} />
                <div className="absolute inset-0 rounded-full"
                  style={{ border: "1px solid rgba(192,192,204,0.20)" }} />
                <RefreshCw className="absolute inset-0 m-auto w-6 h-6 animate-spin"
                  style={{ color: "rgba(192,192,204,0.6)" }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white/50 mb-1">Analyzing {ticker}</p>
                <p className="text-xs text-white/20">
                  {timeframe === "1d" ? `${nHistory}d` : `${nHistory} × ${timeframe}`} history
                  {technicals ? " · RSI · EMA 50/200 · ADX · VWAP" : ""} · {nForecast}-{tfCandleLabel(timeframe)} outlook
                </p>
              </div>
            </div>
          </div>
        )}

        {/* error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
            <p className="text-sm text-red-400/80 text-center max-w-sm">{error}</p>
            <button onClick={() => runForecast(ticker, nHistory, nForecast, nRuns, technicals, timeframe, backtest, rewind)}
              className="text-xs px-4 py-1.5 rounded-lg transition-all"
              style={{ color: "rgba(192,192,204,0.6)", border: "1px solid rgba(192,192,204,0.15)" }}
            >
              Retry
            </button>
          </div>
        )}

        {/* chart */}
        {data && !loading && (
          <div className="absolute inset-0" style={{ animation: "chartIn 0.25s ease forwards" }}>
            <ForecastChart
              historical={data.historical}
              futureDates={data.futureDates}
              lastClose={data.lastClose}
              scenarios={data.scenarios}
              timeframe={data.timeframe ?? timeframe}
              isBacktest={data.isBacktest}
              backtestSepTime={data.backtestSepTime}
              backtestActuals={data.backtestActuals}
            />
          </div>
        )}
      </div>

      {/* ── footer ───────────────────────────────────────────────────────────── */}
      {data && (
        <div className="shrink-0"
          style={{ background: "rgba(8,8,8,0.90)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>

          {/* MOBILE — two plain flex rows, no grid */}
          <div className="md:hidden">
            {/* Row 1: Bull | Base */}
            <div className="flex" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex-1 px-4 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}>
                <ScenStat label="Bull" price={bull} from={data.lastClose} color="rgba(34,197,94,0.85)" icon={<TrendingUp className="w-3 h-3" />} />
              </div>
              <div className="flex-1 px-4 py-3">
                <ScenStat label="Base" price={base} from={data.lastClose} color="rgba(192,192,204,0.85)" icon={<Minus className="w-3 h-3" />} />
              </div>
            </div>
            {/* Row 2: Bear | Confidence */}
            <div className="flex">
              <div className="flex-1 px-4 py-3" style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}>
                <ScenStat label="Bear" price={bear} from={data.lastClose} color="rgba(239,68,68,0.85)" icon={<TrendingDown className="w-3 h-3" />} />
              </div>
              <div className="flex-1 px-4 py-3">
                <ConfidenceRing value={data.confidence} />
              </div>
            </div>
            {/* Row 3: Analysis */}
            {data.analysis && (
              <div className="px-4 py-3 flex items-start gap-2"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "rgba(192,192,204,0.4)" }} />
                <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>{data.analysis}</p>
              </div>
            )}
          </div>

          {/* DESKTOP — single horizontal row */}
          <div className="hidden md:flex px-6 py-4 items-center gap-6 flex-wrap">
            <div className="flex items-center gap-6">
              <ScenStat label="Bull" price={bull} from={data.lastClose} color="rgba(34,197,94,0.85)" icon={<TrendingUp className="w-3 h-3" />} />
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.06)" }} />
              <ScenStat label="Base" price={base} from={data.lastClose} color="rgba(192,192,204,0.85)" icon={<Minus className="w-3 h-3" />} />
              <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.06)" }} />
              <ScenStat label="Bear" price={bear} from={data.lastClose} color="rgba(239,68,68,0.85)" icon={<TrendingDown className="w-3 h-3" />} />
            </div>
            {data.analysis && (
              <>
                <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.06)" }} className="shrink-0" />
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <Sparkles className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "rgba(192,192,204,0.4)" }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>{data.analysis}</p>
                </div>
              </>
            )}
            <div className="ml-auto flex items-center gap-4 shrink-0">
              <ConfidenceRing value={data.confidence} />
              <div className="hidden lg:block text-right">
                <div className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.15)" }}>Model</div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>claude-sonnet-4-6</div>
              </div>
            </div>
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
