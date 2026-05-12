"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, IChartApi, LineSeries, AreaSeries, ColorType } from "lightweight-charts";
import type { Time } from "lightweight-charts";
import { Sparkles, RefreshCw, Minus, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PredictionResponse {
  historical: { time: number; close: number }[];
  futureDates: number[];
  runs: number[][];
  mean: number[];
  n: number;
  successfulRuns: number;
  totalRuns: number;
}

interface Props { ticker: string }

export default function AIPredPanel({ ticker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histRef      = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upperRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lowerRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meanRef      = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const [nDays, setNDays] = useState(() => { try { return JSON.parse(localStorage.getItem(`home-pred-days`) ?? "7"); } catch { return 7; } });
  const [nRuns, setNRuns] = useState(() => { try { return JSON.parse(localStorage.getItem(`home-pred-runs`) ?? "4"); } catch { return 4; } });
  const [data, setData]     = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const cacheKey = `home-pred-${ticker}`;

  useEffect(() => { localStorage.setItem("home-pred-days", String(nDays)); }, [nDays]);
  useEffect(() => { localStorage.setItem("home-pred-runs", String(nRuns)); }, [nRuns]);

  const predict = useCallback(async (days: number, runs: number) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/market/predict/${ticker}?n=${days}&runs=${runs}`);
      const json = await res.json();
      if (json.error) throw new Error(json.details?.[0] ?? json.error);
      setData(json);
      try { localStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* quota */ }
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [ticker, cacheKey]);

  useEffect(() => {
    setData(null); setError(null);
    try { const c = localStorage.getItem(cacheKey); if (c) { setData(JSON.parse(c)); return; } } catch { /* ignore */ }
    predict(nDays, nRuns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Chart readiness
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => { if (entries[0].contentRect.height > 10) setReady(true); });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Chart creation
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const el = containerRef.current;
    const w = el.clientWidth; const h = el.clientHeight;
    if (w <= 0 || h <= 0) return;
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e", fontSize: 11 },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#21262d" },
      timeScale: { borderColor: "#21262d", timeVisible: true, secondsVisible: false },
      width: w, height: h,
    });
    histRef.current  = chart.addSeries(LineSeries, { color: "#c9d1d9", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    upperRef.current = chart.addSeries(AreaSeries, { lineColor: "transparent", lineWidth: 1, topColor: "rgba(167,139,250,0.18)", bottomColor: "rgba(167,139,250,0.04)", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    lowerRef.current = chart.addSeries(AreaSeries, { lineColor: "transparent", lineWidth: 1, topColor: "transparent", bottomColor: "transparent", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    meanRef.current  = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4 });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => { const nw = el.clientWidth, nh = el.clientHeight; if (nw > 0 && nh > 0) chart.applyOptions({ width: nw, height: nh }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = histRef.current = upperRef.current = lowerRef.current = meanRef.current = null; };
  }, [ready]);

  // Data update
  useEffect(() => {
    if (!chartRef.current || !histRef.current || !data) return;
    const lastH = data.historical[data.historical.length - 1];
    const times = [lastH.time, ...data.futureDates] as unknown as Time[];
    const meanVals  = [lastH.close, ...data.mean];
    const upperVals = [lastH.close, ...data.futureDates.map((_, i) => Math.max(...data.runs.map(r => r[i])))];
    const lowerVals = [lastH.close, ...data.futureDates.map((_, i) => Math.min(...data.runs.map(r => r[i])))];
    histRef.current.setData(data.historical.map(p => ({ time: p.time as unknown as Time, value: p.close })));
    upperRef.current.setData(times.map((t, i) => ({ time: t, value: upperVals[i] })));
    lowerRef.current.setData(times.map((t, i) => ({ time: t, value: lowerVals[i] })));
    meanRef.current.setData(times.map((t, i) => ({ time: t, value: meanVals[i] })));
    chartRef.current.timeScale().fitContent();
  }, [data, ready]);

  const lastClose  = data?.historical.at(-1)?.close ?? null;
  const predFinal  = data?.mean.at(-1) ?? null;
  const predChange = lastClose && predFinal ? ((predFinal - lastClose) / lastClose) * 100 : null;
  const isUp       = (predChange ?? 0) >= 0;

  return (
    <div className="rounded-2xl border border-[#a78bfa33] bg-gradient-to-br from-[#161b22] to-[#0d1117] overflow-hidden"
         style={{ boxShadow: "0 0 40px rgba(167,139,250,0.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#21262d]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-purple-900/30">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">AI Price Prediction</div>
            <div className="text-[10px] text-[#484f58]">LLM ensemble Monte Carlo</div>
          </div>
        </div>
        {data && lastClose && predFinal && (
          <div className="text-right">
            <div className={cn("text-xl font-black tabular-nums", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
              ${predFinal.toFixed(2)}
            </div>
            <div className={cn("text-xs font-semibold flex items-center gap-1 justify-end", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isUp ? "+" : ""}{predChange?.toFixed(2)}% in {data.n}d
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height: 260 }}>
        {loading && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-[#a78bfa44] border-t-[#a78bfa] animate-spin" />
              <Sparkles className="w-4 h-4 text-[#a78bfa] absolute inset-0 m-auto" />
            </div>
            <p className="text-xs text-[#484f58]">Running {nRuns} prediction scenarios…</p>
          </div>
        )}
        {error && !data && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-[#f85149]">{error}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-[#21262d] bg-[#0d1117]">
        {/* Stats */}
        {data && (
          <div className="flex items-center gap-1.5 text-[10px] text-[#484f58]">
            <Sparkles className="w-3 h-3 text-[#a78bfa]" />
            <span>{data.successfulRuns}/{data.totalRuns} runs</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Days */}
        <span className="text-[10px] text-[#484f58] uppercase tracking-wide font-semibold">Days</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setNDays((v: number) => Math.max(1, v - 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d]"><Minus className="w-3 h-3" /></button>
          <span className="text-xs font-mono text-white w-5 text-center">{nDays}</span>
          <button onClick={() => setNDays((v: number) => Math.min(30, v + 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d]"><Plus className="w-3 h-3" /></button>
        </div>
        <div className="w-px h-3 bg-[#21262d]" />
        {/* Runs */}
        <span className="text-[10px] text-[#484f58] uppercase tracking-wide font-semibold">Runs</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setNRuns((v: number) => Math.max(1, v - 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d]"><Minus className="w-3 h-3" /></button>
          <span className="text-xs font-mono text-white w-5 text-center">{nRuns}</span>
          <button onClick={() => setNRuns((v: number) => Math.min(20, v + 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d]"><Plus className="w-3 h-3" /></button>
        </div>
        <button
          onClick={() => predict(nDays, nRuns)}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
            loading
              ? "text-[#484f58] border-[#21262d] cursor-not-allowed"
              : "text-[#a78bfa] bg-[#a78bfa0d] border-[#a78bfa44] hover:bg-[#a78bfa18] hover:border-[#a78bfa88]"
          )}
        >
          {loading ? <><RefreshCw className="w-3 h-3 animate-spin" />Running…</> : <><Sparkles className="w-3 h-3" />Predict</>}
        </button>
      </div>
    </div>
  );
}
