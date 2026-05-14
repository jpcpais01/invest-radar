"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart, IChartApi, LineSeries, AreaSeries, ColorType, LineStyle,
} from "lightweight-charts";
import type { Time } from "lightweight-charts";
import {
  ArrowLeft, Sparkles, RefreshCw, BarChart2,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTickerStore } from "@/store/tickerStore";
import CommandPalette from "@/components/search/CommandPalette";
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
}

// ─── constants ────────────────────────────────────────────────────────────────
const BG = "#080808";
const HISTORY_OPTS  = [30, 60, 90, 120, 252];
const FORECAST_OPTS = [5, 10, 15, 20, 30];

// ─── helper: fmt pct ─────────────────────────────────────────────────────────
function fmtPct(from: number, to: number) {
  const p = ((to - from) / from) * 100;
  return { pct: p, str: `${p >= 0 ? "+" : ""}${p.toFixed(1)}%` };
}

// ─── Option pill ──────────────────────────────────────────────────────────────
function Pill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-[10px] transition-colors border-r border-[#1e1e1e] last:border-r-0",
        active
          ? "bg-[#1e1e1e] text-[#c0c0cc]"
          : "text-[#484848] hover:text-[#c0c0cc] hover:bg-[#111111]",
      )}
    >
      {label}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function ForecastPage() {
  const router = useRouter();
  const { activeTicker, setActiveTicker } = useTickerStore();

  const [ticker,    setTicker]    = useState(activeTicker || "AAPL");
  const [nHistory,  setNHistory]  = useState(90);
  const [nForecast, setNForecast] = useState(15);
  const [loading,   setLoading]   = useState(false);
  const [data,      setData]      = useState<ForecastData | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  // ── Cache helpers ────────────────────────────────────────────────────────────
  const cacheKey = (t: string) => `forecast-${t}`;

  const loadCache = (t: string): ForecastData | null => {
    try {
      const raw = localStorage.getItem(cacheKey(t));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ForecastData;
      // Validate it has the shape we expect
      if (!parsed.predictions || !parsed.scenarios) return null;
      return parsed;
    } catch { return null; }
  };

  const saveCache = (d: ForecastData) => {
    try { localStorage.setItem(cacheKey(d.ticker), JSON.stringify(d)); } catch { /* quota */ }
  };

  // ── API call ────────────────────────────────────────────────────────────────
  const runForecast = useCallback(async (t: string, hist: number, fore: number) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/ai/forecast?ticker=${t}&nHistory=${hist}&nForecast=${fore}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const d = json as ForecastData;
      setData(d);
      saveCache(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Build / rebuild chart when data arrives ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !data) return;

    // Destroy old chart
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const el = containerRef.current;
    const chart = createChart(el, {
      width:  el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: "#484848",
        fontFamily: "'Inter', 'system-ui', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#111111" },
        horzLines: { color: "#111111" },
      },
      crosshair: {
        vertLine: { color: "#2a2a2a", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "#2a2a2a", width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: "#1a1a1a",
        textColor: "#484848",
      },
      timeScale: {
        borderColor: "#1a1a1a",
        timeVisible: false,
        rightOffset: 10,
      },
      handleScroll: true,
      handleScale:  true,
    });
    chartRef.current = chart;

    const mkPt = (t: number, v: number) => ({ time: t as Time, value: v });

    // ── History area ───────────────────────────────────────────────────────
    const histSeries = chart.addSeries(AreaSeries, {
      lineColor:   "rgba(192,192,204,0.55)",
      topColor:    "rgba(192,192,204,0.10)",
      bottomColor: "rgba(192,192,204,0.00)",
      lineWidth: 2,
      priceLineVisible:  false,
      lastValueVisible:  false,
    });
    histSeries.setData(data.historical.map(b => mkPt(b.time, b.close)));

    const lastTime  = data.historical[data.historical.length - 1].time;
    const lastClose = data.lastClose;
    const futureTs  = data.futureDates;

    // ── Bear (avg of 2 worst predictions) ─────────────────────────────────
    const bearSeries = chart.addSeries(LineSeries, {
      color:     "rgba(239,68,68,0.80)",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Bear",
    });
    bearSeries.setData([
      mkPt(lastTime, lastClose),
      ...data.scenarios.bear.map((v, i) => mkPt(futureTs[i], v)),
    ]);

    // ── Base (avg of all 5) ───────────────────────────────────────────────
    const baseSeries = chart.addSeries(LineSeries, {
      color:     "#c0c0cc",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Base",
    });
    baseSeries.setData([
      mkPt(lastTime, lastClose),
      ...data.scenarios.base.map((v, i) => mkPt(futureTs[i], v)),
    ]);

    // ── Bull (avg of 2 best predictions) ──────────────────────────────────
    const bullSeries = chart.addSeries(LineSeries, {
      color:     "rgba(34,197,94,0.85)",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Bull",
    });
    bullSeries.setData([
      mkPt(lastTime, lastClose),
      ...data.scenarios.bull.map((v, i) => mkPt(futureTs[i], v)),
    ]);

    chart.timeScale().fitContent();

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [data]);

  // ── Restore cache when ticker changes ──────────────────────────────────────
  useEffect(() => {
    const cached = loadCache(ticker);
    if (cached) {
      setData(cached);
      setError(null);
    } else {
      setData(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // ── Ticker select handler ───────────────────────────────────────────────────
  const handleTickerSelect = (t: string) => {
    const upper = t.toUpperCase();
    setTicker(upper);
    setActiveTicker(upper);
    setPaletteOpen(false);
  };

  // ── Derived stats ───────────────────────────────────────────────────────────
  const lastBull = data?.scenarios.bull.at(-1) ?? null;
  const lastBase = data?.scenarios.base.at(-1) ?? null;
  const lastBear = data?.scenarios.bear.at(-1) ?? null;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: BG }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 border-b border-[#1a1a1a] px-4 h-14 flex items-center gap-3"
        style={{ background: "rgba(8,8,8,0.96)", backdropFilter: "blur(12px)" }}
      >
        {/* Back to home */}
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-[#484848] hover:text-[#c0c0cc] transition-colors shrink-0 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-xs hidden sm:block">Home</span>
        </button>

        <div className="w-px h-4 bg-[#1e1e1e] shrink-0" />

        {/* Logo / title */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded border border-[#c0c0cc22] bg-[#c0c0cc08] flex items-center justify-center">
            <span className="text-[#c0c0cc] text-[8px] font-bold leading-none">◆</span>
          </div>
          <span className="text-xs font-semibold text-[#767676] hidden sm:block tracking-wide">AI Forecast</span>
        </div>

        <div className="w-px h-4 bg-[#1e1e1e] shrink-0" />

        {/* Ticker selector */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1e1e1e] bg-[#101010] hover:border-[#2c2c2c] transition-colors"
        >
          <BarChart2 className="w-3.5 h-3.5 text-[#3a3a3a]" />
          <span className="text-sm font-semibold text-[#f0f0f0] font-mono">{ticker}</span>
          <span className="text-[9px] text-[#3a3a3a] ml-0.5">▼</span>
        </button>

        {/* Right-side controls */}
        <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">

          {/* History */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#3a3a3a] hidden md:block shrink-0">History</span>
            <div className="flex border border-[#1e1e1e] rounded-md overflow-hidden">
              {HISTORY_OPTS.map(v => (
                <Pill key={v} label={`${v}d`} active={nHistory === v} onClick={() => setNHistory(v)} />
              ))}
            </div>
          </div>

          {/* Forecast */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#3a3a3a] hidden md:block shrink-0">Forecast</span>
            <div className="flex border border-[#1e1e1e] rounded-md overflow-hidden">
              {FORECAST_OPTS.map(v => (
                <Pill key={v} label={`${v}d`} active={nForecast === v} onClick={() => setNForecast(v)} />
              ))}
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={() => runForecast(ticker, nHistory, nForecast)}
            disabled={loading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all shrink-0",
              loading
                ? "border-[#1e1e1e] text-[#3a3a3a] cursor-not-allowed"
                : "bg-[#c0c0cc08] border-[#c0c0cc28] text-[#c0c0cc] hover:bg-[#c0c0cc15] hover:border-[#c0c0cc55]",
            )}
          >
            {loading
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5" />}
            <span className="hidden sm:block">{loading ? "Analyzing…" : "Run Forecast"}</span>
          </button>
        </div>
      </header>

      {/* ── Chart area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">

        {/* Empty state */}
        {!data && !loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-4">
            {/* Decorative grid lines */}
            <div className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: "linear-gradient(#111 1px, transparent 1px), linear-gradient(90deg, #111 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
            <div className="relative flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] flex items-center justify-center shadow-2xl">
                <Sparkles className="w-7 h-7 text-[#3a3a3a]" />
              </div>
              <div className="text-center">
                <p className="text-[#767676] text-base font-medium">AI Price Forecast</p>
                <p className="text-[#3a3a3a] text-sm mt-1.5 max-w-xs leading-relaxed">
                  Claude analyzes {nHistory} days of price history with RSI, EMA crossover &amp; ADX signals
                  to generate bear / base / bull scenarios for the next {nForecast} trading days.
                </p>
              </div>
              <button
                onClick={() => runForecast(ticker, nHistory, nForecast)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#c0c0cc28] bg-[#c0c0cc08] text-[#c0c0cc] text-sm font-medium hover:bg-[#c0c0cc15] hover:border-[#c0c0cc44] transition-all"
              >
                <Sparkles className="w-4 h-4" />
                Forecast {ticker}
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
            <div className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: "linear-gradient(#111 1px, transparent 1px), linear-gradient(90deg, #111 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
            <div className="relative flex flex-col items-center gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border border-[#1e1e1e] animate-ping opacity-20" />
                <div className="absolute inset-0 rounded-full border border-[#c0c0cc22]" />
                <RefreshCw className="absolute inset-0 m-auto w-7 h-7 text-[#c0c0cc] animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-[#767676] text-sm font-medium">Claude is analyzing {ticker}…</p>
                <p className="text-[#3a3a3a] text-xs mt-1">
                  Processing {nHistory} days · RSI · EMA(50/200) · ADX · Generating {nForecast}-day scenarios
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
            <p className="text-[#ef4444] text-sm text-center max-w-sm">{error}</p>
            <button
              onClick={() => runForecast(ticker, nHistory, nForecast)}
              className="text-xs text-[#c0c0cc] border border-[#c0c0cc28] px-3 py-1.5 rounded-lg hover:bg-[#c0c0cc08] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Chart */}
        <div
          ref={containerRef}
          className={cn(
            "w-full h-full transition-opacity duration-500",
            data && !loading ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        />
      </div>

      {/* ── Stats / analysis footer ─────────────────────────────────────────── */}
      {data && (
        <div className="shrink-0 border-t border-[#1a1a1a] px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
          style={{ background: "rgba(8,8,8,0.98)" }}
        >
          {/* Scenario stats */}
          <div className="flex items-center gap-5 text-xs">
            {/* Bull */}
            {lastBull != null && (() => {
              const { str } = fmtPct(data.lastClose, lastBull);
              return (
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#22c55e]" />
                  <span className="text-[#3a3a3a]">Bull</span>
                  <span className="font-mono text-[#22c55e] font-semibold">${lastBull.toFixed(2)}</span>
                  <span className="text-[#22c55e] text-[10px]">{str}</span>
                </div>
              );
            })()}

            {/* Base */}
            {lastBase != null && (() => {
              const { pct, str } = fmtPct(data.lastClose, lastBase);
              const col = pct >= 0 ? "#c0c0cc" : "#ef4444";
              return (
                <div className="flex items-center gap-1.5">
                  <Minus className="w-3.5 h-3.5" style={{ color: col }} />
                  <span className="text-[#3a3a3a]">Base</span>
                  <span className="font-mono font-semibold" style={{ color: col }}>${lastBase.toFixed(2)}</span>
                  <span className="text-[10px]" style={{ color: col }}>{str}</span>
                </div>
              );
            })()}

            {/* Bear */}
            {lastBear != null && (() => {
              const { str } = fmtPct(data.lastClose, lastBear);
              return (
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-[#ef4444]" />
                  <span className="text-[#3a3a3a]">Bear</span>
                  <span className="font-mono text-[#ef4444] font-semibold">${lastBear.toFixed(2)}</span>
                  <span className="text-[#ef4444] text-[10px]">{str}</span>
                </div>
              );
            })()}
          </div>

          {/* Divider */}
          {data.analysis && <div className="w-px h-4 bg-[#1e1e1e] shrink-0 hidden sm:block" />}

          {/* Claude analysis */}
          {data.analysis && (
            <div className="flex items-start gap-1.5 min-w-0 flex-1">
              <Sparkles className="w-3 h-3 text-[#c0c0cc] shrink-0 mt-px" />
              <p className="text-[11px] text-[#767676] leading-relaxed">{data.analysis}</p>
            </div>
          )}

          {/* Confidence */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#3a3a3a]">Confidence</span>
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${data.confidence}%`,
                      backgroundColor:
                        data.confidence >= 66 ? "#22c55e"
                        : data.confidence >= 40 ? "#f59e0b"
                        : "#ef4444",
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-mono font-semibold tabular-nums"
                  style={{
                    color:
                      data.confidence >= 66 ? "#22c55e"
                      : data.confidence >= 40 ? "#f59e0b"
                      : "#ef4444",
                  }}
                >
                  {data.confidence}%
                </span>
              </div>
            </div>
            <span className="text-[9px] text-[#2a2a2a] hidden lg:block">
              claude-sonnet-4-6 · {data.nHistory}d · {data.nForecast}d
            </span>
          </div>
        </div>
      )}

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={handleTickerSelect}
        variant="home"
      />
    </div>
  );
}
