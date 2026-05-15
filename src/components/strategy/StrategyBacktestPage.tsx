"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, FlaskConical, RefreshCw, ChevronDown, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTickerStore } from "@/store/tickerStore";
import CommandPalette from "@/components/search/CommandPalette";
import StrategyChart, { CurvePoint, DerivedPoint } from "./StrategyChart";

// ─── types ────────────────────────────────────────────────────────────────────
type Timeframe = "1m" | "5m" | "1h" | "1d";

interface RawPoint {
  time: number; entryPrice: number; exitTime: number; exitPrice: number;
  basePath: number[]; bullPath: number[]; bearPath: number[]; actualPath: number[];
  confidence: number; analysis: string; atr14: number; baseFinal: number;
  upCount: number; totalPaths: number;
}
interface BacktestData {
  ticker: string; timeframe: Timeframe; nHistory: number; nForecast: number;
  nRuns: number; withTech: boolean; requestedPoints: number; points: RawPoint[];
}

const TIMEFRAME_OPTS: Timeframe[] = ["1m", "5m", "1h", "1d"];
const HISTORY_OPTS  = [30, 60, 90, 120, 252];
const FORECAST_OPTS = [5, 10, 15, 20, 30];
const POINTS_OPTS   = [3, 4, 6, 8, 10, 12];

const ACCENT = "#a78bfa"; // violet — the strategy lab signature

// ─── client-side trade gate + equity derivation ──────────────────────────────
interface Derived {
  derived: DerivedPoint[];
  equityCurve: CurvePoint[];
  buyHoldCurve: CurvePoint[];
  summary: {
    totalReturnPct: number; buyHoldReturnPct: number; winRate: number;
    tradesPlaced: number; totalPoints: number; profitFactor: number;
    avgPnlPct: number; bestPct: number; worstPct: number;
  };
}

function deriveResults(data: BacktestData, magK: number, minAgreement: number): Derived | null {
  const pts = data.points;
  if (pts.length < 2) return null;
  const sqrtM = Math.sqrt(data.nForecast);

  let equity = 1;
  const derived: DerivedPoint[] = pts.map(pt => {
    const predictedMove    = pt.baseFinal - pt.entryPrice;
    const predictedMovePct = (predictedMove / pt.entryPrice) * 100;
    const magThreshold     = magK * pt.atr14 * sqrtM;
    const magPass          = Math.abs(predictedMove) > magThreshold;

    const downCount = pt.totalPaths - pt.upCount;
    const agreement = Math.max(pt.upCount, downCount) / pt.totalPaths;
    const agreePass = agreement >= minAgreement;
    const direction: "long" | "short" = pt.upCount >= downCount ? "long" : "short";

    const traded = magPass && agreePass;
    let pnlPct = 0, won = false;
    if (traded) {
      const rawRet = (pt.exitPrice - pt.entryPrice) / pt.entryPrice;
      pnlPct = (direction === "long" ? rawRet : -rawRet) * 100;
      won = pnlPct > 0;
      equity *= 1 + pnlPct / 100;
    }
    return {
      time: pt.time, entryPrice: pt.entryPrice, exitTime: pt.exitTime, exitPrice: pt.exitPrice,
      confidence: pt.confidence, predictedMovePct, agreement, direction, traded, pnlPct, won,
      equityAfter: equity,
    };
  });

  const equityCurve: CurvePoint[] = [
    { time: pts[0].time, equity: 1 },
    ...derived.map(d => ({ time: d.exitTime, equity: d.equityAfter })),
  ];
  const bhStart = pts[0].entryPrice;
  const buyHoldCurve: CurvePoint[] = [
    { time: pts[0].time, equity: 1 },
    ...pts.map(p => ({ time: p.exitTime, equity: p.exitPrice / bhStart })),
  ];

  const tradedArr = derived.filter(d => d.traded);
  const wins      = tradedArr.filter(d => d.won);
  const grossWin  = wins.reduce((s, d) => s + d.pnlPct, 0);
  const grossLoss = Math.abs(tradedArr.filter(d => d.pnlPct < 0).reduce((s, d) => s + d.pnlPct, 0));
  const bhEnd     = pts[pts.length - 1].exitPrice;

  return {
    derived, equityCurve, buyHoldCurve,
    summary: {
      totalReturnPct:   (equity - 1) * 100,
      buyHoldReturnPct: (bhEnd / bhStart - 1) * 100,
      winRate:          tradedArr.length ? (wins.length / tradedArr.length) * 100 : 0,
      tradesPlaced:     tradedArr.length,
      totalPoints:      derived.length,
      profitFactor:     grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      avgPnlPct:        tradedArr.length ? tradedArr.reduce((s, d) => s + d.pnlPct, 0) / tradedArr.length : 0,
      bestPct:          tradedArr.length ? Math.max(...tradedArr.map(d => d.pnlPct)) : 0,
      worstPct:         tradedArr.length ? Math.min(...tradedArr.map(d => d.pnlPct)) : 0,
    },
  };
}

// ─── small controls ───────────────────────────────────────────────────────────
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

function TimeframePill({ active, onChange }: { active: Timeframe; onChange: (v: Timeframe) => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>TF</span>
      <div className="flex rounded-lg overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {TIMEFRAME_OPTS.map(tf => (
          <button key={tf} onClick={() => onChange(tf)}
            className="px-2.5 py-1.5 text-[10px] font-medium font-mono tracking-wide transition-all duration-150 border-r last:border-r-0"
            style={{
              borderColor: "rgba(255,255,255,0.06)",
              background: active === tf ? "rgba(167,139,250,0.16)" : "transparent",
              color: active === tf ? "#c4b5fd" : "rgba(255,255,255,0.28)",
            }}>
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}

function LabeledSeg({ label, options, active, onChange }:
  { label: string; options: number[]; active: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>{label}</span>
      <SegPill options={options} active={active} onChange={onChange} />
    </div>
  );
}

function RunsStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>Runs</span>
      <div className="flex items-center rounded-lg overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <button onClick={() => onChange(Math.max(1, value - 1))}
          className="px-2 py-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>−</button>
        <span className="text-[10px] font-mono font-medium px-1.5"
          style={{ color: "rgba(255,255,255,0.65)", minWidth: 14, textAlign: "center" }}>{value}</span>
        <button onClick={() => onChange(Math.min(5, value + 1))}
          className="px-2 py-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>+</button>
      </div>
    </div>
  );
}

function TechToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)}
      className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium tracking-wide transition-all shrink-0"
      style={{
        background: active ? "rgba(192,192,204,0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "rgba(192,192,204,0.28)" : "rgba(255,255,255,0.07)"}`,
        color: active ? "rgba(210,210,220,0.9)" : "rgba(255,255,255,0.28)",
      }}>
      Technicals
    </button>
  );
}

// live gate slider
function GateSlider({ label, value, display, min, max, step, onChange }:
  { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="text-[10px] uppercase tracking-widest shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 min-w-[80px] h-1 cursor-pointer"
        style={{ accentColor: ACCENT }} />
      <span className="text-[11px] font-mono font-semibold shrink-0 tabular-nums" style={{ color: "#c4b5fd", minWidth: 52, textAlign: "right" }}>
        {display}
      </span>
    </div>
  );
}

// ─── stat block ───────────────────────────────────────────────────────────────
function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>{label}</span>
      <span className="text-sm font-semibold font-mono" style={{ color: color ?? "rgba(255,255,255,0.85)" }}>{value}</span>
      {sub && <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</span>}
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function StrategyBacktestPage() {
  const router = useRouter();
  const { activeTicker, setActiveTicker } = useTickerStore();

  const [ticker,     setTicker]     = useState(activeTicker || "AAPL");
  const [nHistory,   setNHistory]   = useState(120);
  const [nForecast,  setNForecast]  = useState(20);
  const [nRuns,      setNRuns]      = useState(3);
  const [nPoints,    setNPoints]    = useState(6);
  const [technicals, setTechnicals] = useState(true);
  const [timeframe,  setTimeframe]  = useState<Timeframe>("1d");

  // live gate — applied client-side, no re-run needed
  const [magK,         setMagK]         = useState(0.5);
  const [minAgreement, setMinAgreement] = useState(0.6);

  const [loading,     setLoading]     = useState(false);
  const [data,        setData]        = useState<BacktestData | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── cache ──────────────────────────────────────────────────────────────────
  const loadCache = (t: string): BacktestData | null => {
    try {
      const raw = localStorage.getItem(`strategy-bt-${t}`);
      if (!raw) return null;
      const d = JSON.parse(raw) as BacktestData;
      return d.points && d.points.length >= 2 ? d : null;
    } catch { return null; }
  };
  const saveCache = (d: BacktestData) => {
    try { localStorage.setItem(`strategy-bt-${d.ticker}`, JSON.stringify(d)); } catch { /**/ }
  };

  const runBacktest = useCallback(async (
    t: string, hist: number, fore: number, runs: number, points: number, tech: boolean, tf: Timeframe,
  ) => {
    setLoading(true); setError(null);
    try {
      const url = `/api/ai/strategy-backtest?ticker=${t}&nHistory=${hist}&nForecast=${fore}`
        + `&nRuns=${runs}&nPoints=${points}&technicals=${tech}&timeframe=${tf}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const d = json as BacktestData;
      setData(d); saveCache(d);
    } catch (e) { setError(String(e)); }
    finally     { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // client-side derivation — recomputes instantly when the gate sliders move
  const result = useMemo(() => (data ? deriveResults(data, magK, minAgreement) : null), [data, magK, minAgreement]);

  const fmtPF = (pf: number) => (pf === Infinity ? "∞" : pf.toFixed(2));
  const fmtPct = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: `@keyframes chartIn { from { opacity: 0 } to { opacity: 1 } }` }} />
    <div className="flex flex-col" style={{ position: "fixed", inset: 0, background: "#080808" }}>

      {/* ── top bar ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-20"
        style={{ background: "rgba(8,8,8,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        {(() => {
          const backBtn = (
            <button onClick={() => router.push("/")}
              className="flex items-center gap-1.5 group transition-colors shrink-0"
              style={{ color: "rgba(255,255,255,0.28)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}>
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-xs">Home</span>
            </button>
          );
          const logo = (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-5 h-5 rounded flex items-center justify-center"
                style={{ border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)" }}>
                <FlaskConical className="w-3 h-3" style={{ color: ACCENT }} />
              </div>
              <span className="hidden md:inline text-[10px] font-semibold"
                style={{ color: "rgba(196,181,253,0.65)", letterSpacing: "0.06em" }}>STRATEGY LAB</span>
            </div>
          );
          const tickerBtn = (
            <button onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all flex-1 min-w-0"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}>
              <span className="text-sm font-semibold font-mono text-white truncate">{ticker}</span>
              <ChevronDown className="w-3 h-3 shrink-0 ml-auto" style={{ color: "rgba(255,255,255,0.3)" }} />
            </button>
          );
          const runBtn = (
            <button onClick={() => runBacktest(ticker, nHistory, nForecast, nRuns, nPoints, technicals, timeframe)}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0"
              style={{
                background: loading ? "rgba(255,255,255,0.04)" : "rgba(167,139,250,0.14)",
                border: `1px solid ${loading ? "rgba(255,255,255,0.06)" : "rgba(167,139,250,0.4)"}`,
                color: loading ? "rgba(255,255,255,0.25)" : "#c4b5fd",
                cursor: loading ? "not-allowed" : "pointer",
              }}>
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
              <span>{loading ? "Backtesting…" : "Run Backtest"}</span>
            </button>
          );
          const div = <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />;
          const controls = (
            <>
              <TimeframePill active={timeframe} onChange={setTimeframe} />
              {div}
              <LabeledSeg label="Hist"   options={HISTORY_OPTS}  active={nHistory}  onChange={setNHistory} />
              {div}
              <LabeledSeg label="Fcst"   options={FORECAST_OPTS} active={nForecast} onChange={setNForecast} />
              {div}
              <LabeledSeg label="Points" options={POINTS_OPTS}   active={nPoints}   onChange={setNPoints} />
              {div}
              <RunsStepper value={nRuns} onChange={setNRuns} />
              {div}
              <TechToggle active={technicals} onChange={setTechnicals} />
            </>
          );
          return (
            <>
              {/* MOBILE */}
              <div className="md:hidden">
                <div className="px-4 h-12 flex items-center gap-3">
                  {backBtn}{div}{tickerBtn}{runBtn}
                </div>
                <div className="px-4 h-10 flex items-center gap-4 overflow-x-auto"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  {controls}
                </div>
              </div>
              {/* DESKTOP */}
              <div className="hidden md:flex px-5 h-14 items-center gap-4">
                {backBtn}{div}{logo}{div}{tickerBtn}
                <div className="flex items-center gap-4 ml-auto overflow-x-auto">
                  {controls}{div}{runBtn}
                </div>
              </div>
            </>
          );
        })()}
      </header>

      {/* ── live gate bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 md:px-5 py-2.5 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-6"
        style={{ background: "rgba(167,139,250,0.04)", borderBottom: "1px solid rgba(167,139,250,0.10)" }}>
        <div className="flex items-center gap-1.5 shrink-0">
          <Zap className="w-3 h-3" style={{ color: ACCENT }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#c4b5fd" }}>Trade Gate</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded ml-0.5"
            style={{ background: "rgba(167,139,250,0.14)", color: "rgba(196,181,253,0.7)" }}>live</span>
        </div>
        <div className="flex-1 min-w-0 md:max-w-[300px]">
          <GateSlider label="Move" value={magK} display={`${magK.toFixed(2)}×ATR`}
            min={0} max={2} step={0.05} onChange={setMagK} />
        </div>
        <div className="flex-1 min-w-0 md:max-w-[300px]">
          <GateSlider label="Agree" value={minAgreement} display={`${(minAgreement * 100).toFixed(0)}%`}
            min={0.5} max={1} step={0.05} onChange={setMinAgreement} />
        </div>
        {result && (
          <div className="text-[10px] font-mono shrink-0 md:ml-auto" style={{ color: "rgba(255,255,255,0.35)" }}>
            {result.summary.tradesPlaced}/{result.summary.totalPoints} points traded
          </div>
        )}
      </div>

      {/* ── chart area ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>
        {/* empty */}
        {!data && !loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)" }}>
              <FlaskConical className="w-7 h-7" style={{ color: "rgba(167,139,250,0.55)" }} />
            </div>
            <div>
              <p className="text-base font-semibold text-white/60 mb-1.5">Strategy Backtest</p>
              <p className="text-sm text-white/25 max-w-[360px] leading-relaxed">
                Walk the LLM forecast backward through history. At each point it reads {nHistory} candles,
                predicts {nForecast}, and the trade gate decides whether to act. Tune the gate live — the
                equity curve recomputes instantly.
              </p>
            </div>
            <button onClick={() => runBacktest(ticker, nHistory, nForecast, nRuns, nPoints, technicals, timeframe)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)", color: "#c4b5fd" }}>
              <FlaskConical className="w-4 h-4" />
              Backtest {ticker}
            </button>
          </div>
        )}

        {/* loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full animate-ping" style={{ border: "1px solid rgba(167,139,250,0.15)" }} />
              <div className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(167,139,250,0.22)" }} />
              <RefreshCw className="absolute inset-0 m-auto w-6 h-6 animate-spin" style={{ color: "rgba(167,139,250,0.6)" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/50 mb-1">Backtesting {ticker}</p>
              <p className="text-xs text-white/25">
                {nPoints} decision points × {nRuns} runs · {nForecast}-candle horizon · this takes a moment
              </p>
            </div>
          </div>
        )}

        {/* error */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
            <p className="text-sm text-red-400/80 text-center max-w-sm">{error}</p>
            <button onClick={() => runBacktest(ticker, nHistory, nForecast, nRuns, nPoints, technicals, timeframe)}
              className="text-xs px-4 py-1.5 rounded-lg transition-all"
              style={{ color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.2)" }}>
              Retry
            </button>
          </div>
        )}

        {/* chart */}
        {data && result && !loading && (
          <div className="absolute inset-0">
            <StrategyChart
              equityCurve={result.equityCurve}
              buyHoldCurve={result.buyHoldCurve}
              points={result.derived}
              timeframe={data.timeframe}
            />
          </div>
        )}
      </div>

      {/* ── stats + trade log ────────────────────────────────────────────────── */}
      {data && result && !loading && (
        <div className="shrink-0"
          style={{ background: "rgba(8,8,8,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>

          {/* stats row */}
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
              sub={`${result.summary.tradesPlaced} trades`} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0" />
            <Stat label="Profit Factor" value={fmtPF(result.summary.profitFactor)} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0" />
            <Stat label="Avg P&L" value={fmtPct(result.summary.avgPnlPct)}
              color={result.summary.avgPnlPct >= 0 ? "#22c55e" : "#ef4444"} />
            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} className="shrink-0 hidden sm:block" />
            <div className="hidden sm:block"><Stat label="Best / Worst"
              value={`${fmtPct(result.summary.bestPct)} / ${fmtPct(result.summary.worstPct)}`} /></div>
          </div>

          {/* trade log */}
          <div className="overflow-y-auto" style={{ maxHeight: 168 }}>
            <table className="w-full text-[10px]">
              <thead className="sticky top-0" style={{ background: "rgba(10,10,12,0.97)" }}>
                <tr style={{ color: "rgba(255,255,255,0.3)" }}>
                  <th className="text-left  font-medium px-4 py-1.5">#</th>
                  <th className="text-left  font-medium px-2 py-1.5">Date</th>
                  <th className="text-left  font-medium px-2 py-1.5">Dir</th>
                  <th className="text-right font-medium px-2 py-1.5">Entry</th>
                  <th className="text-right font-medium px-2 py-1.5">Exit</th>
                  <th className="text-right font-medium px-2 py-1.5">Pred</th>
                  <th className="text-right font-medium px-2 py-1.5">Agree</th>
                  <th className="text-right font-medium px-2 py-1.5">Conf</th>
                  <th className="text-right font-medium px-4 py-1.5">P&L</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {result.derived.map((d, i) => {
                  const dt = new Date(d.time * 1000);
                  const dateStr = data.timeframe === "1d"
                    ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })
                    : dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                  return (
                    <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", opacity: d.traded ? 1 : 0.4 }}>
                      <td className="px-4 py-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>{i + 1}</td>
                      <td className="px-2 py-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>{dateStr}</td>
                      <td className="px-2 py-1.5">
                        {d.traded ? (
                          <span className="flex items-center gap-1"
                            style={{ color: d.direction === "long" ? "#22c55e" : "#ef4444" }}>
                            {d.direction === "long"
                              ? <TrendingUp className="w-2.5 h-2.5" />
                              : <TrendingDown className="w-2.5 h-2.5" />}
                            {d.direction}
                          </span>
                        ) : <span style={{ color: "rgba(255,255,255,0.25)" }}>skip</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>${d.entryPrice.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.55)" }}>${d.exitPrice.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {d.predictedMovePct >= 0 ? "+" : ""}{d.predictedMovePct.toFixed(1)}%
                      </td>
                      <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{(d.agreement * 100).toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{d.confidence}</td>
                      <td className="px-4 py-1.5 text-right font-semibold"
                        style={{ color: !d.traded ? "rgba(255,255,255,0.2)" : d.won ? "#22c55e" : "#ef4444" }}>
                        {d.traded ? `${d.pnlPct >= 0 ? "+" : ""}${d.pnlPct.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
