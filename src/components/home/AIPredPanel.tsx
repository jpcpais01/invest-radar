"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, IChartApi, LineSeries, ColorType } from "lightweight-charts";
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
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7890a8", fontSize: 10 },
      grid: { vertLines: { color: "#182235" }, horzLines: { color: "#182235" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#182235" },
      timeScale: { borderColor: "#182235", timeVisible: true, secondsVisible: false },
      width: w, height: h,
    });
    histRef.current  = chart.addSeries(LineSeries, { color: "#384e68", lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    upperRef.current = chart.addSeries(LineSeries, { color: "rgba(90,144,176,0.25)", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    lowerRef.current = chart.addSeries(LineSeries, { color: "rgba(90,144,176,0.25)", lineWidth: 1, lineStyle: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    meanRef.current  = chart.addSeries(LineSeries, { color: "#5a90b0", lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4 });
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
    <div className="rounded-lg border border-[#182235] bg-[#0a1020] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-[#182235]">
        <div className="flex items-center gap-2.5">
          <span className="text-[#5a90b0] text-[8px]">◆</span>
          <div>
            <span className="text-[11px] font-semibold text-[#d8e4f0] tracking-wide">AI Price Forecast</span>
            <p className="text-[9px] text-[#384e68] mt-0.5">LLM Ensemble · Monte Carlo</p>
          </div>
        </div>
        {data && lastClose && predFinal && (
          <div className="text-right">
            <div
              className={cn("text-xl font-bold tabular-nums font-mono", isUp ? "text-[#5a90b0]" : "text-[#aa6060]")}
            >
              ${predFinal.toFixed(2)}
            </div>
            <div className={cn("text-[10px] font-medium flex items-center gap-1 justify-end", isUp ? "text-[#5a90b0]" : "text-[#aa6060]")}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isUp ? "+" : ""}{predChange?.toFixed(2)}% · {data.n}D
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height: 260 }}>
        {loading && !data && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-[#5a90b022] border-t-[#5a90b0] animate-spin" />
              <Sparkles className="w-4 h-4 text-[#5a90b0] absolute inset-0 m-auto" />
            </div>
            <p className="text-[10px] text-[#384e68]">Running {nRuns} scenarios…</p>
          </div>
        )}
        {error && !data && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[10px] text-[#aa6060]">{error}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-t border-[#182235]">
        {data && (
          <div className="flex items-center gap-1.5 text-[9px] text-[#384e68]">
            <Sparkles className="w-3 h-3 text-[#5a90b0]" />
            <span>{data.successfulRuns}/{data.totalRuns} runs</span>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[#384e68] uppercase tracking-widest">Days</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setNDays((v: number) => Math.max(1, v - 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#384e68] hover:text-[#d8e4f0] hover:bg-[#0e1628]"><Minus className="w-3 h-3" /></button>
              <span className="text-xs text-[#d8e4f0] w-5 text-center tabular-nums font-mono">{nDays}</span>
              <button onClick={() => setNDays((v: number) => Math.min(30, v + 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#384e68] hover:text-[#d8e4f0] hover:bg-[#0e1628]"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
          <div className="w-px h-3 bg-[#182235]" />
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[#384e68] uppercase tracking-widest">Runs</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setNRuns((v: number) => Math.max(1, v - 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#384e68] hover:text-[#d8e4f0] hover:bg-[#0e1628]"><Minus className="w-3 h-3" /></button>
              <span className="text-xs text-[#d8e4f0] w-5 text-center tabular-nums font-mono">{nRuns}</span>
              <button onClick={() => setNRuns((v: number) => Math.min(20, v + 1))} className="w-6 h-6 rounded flex items-center justify-center text-[#384e68] hover:text-[#d8e4f0] hover:bg-[#0e1628]"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
          <button
            onClick={() => predict(nDays, nRuns)}
            disabled={loading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-semibold tracking-wide transition-all whitespace-nowrap",
              loading
                ? "text-[#384e68] border-[#182235] cursor-not-allowed"
                : "text-[#5a90b0] bg-[#5a90b00a] border-[#5a90b033] hover:bg-[#5a90b018] hover:border-[#5a90b055]"
            )}
          >
            {loading ? <><RefreshCw className="w-3 h-3 animate-spin" />Running…</> : <><Sparkles className="w-3 h-3" />Predict</>}
          </button>
        </div>
      </div>
    </div>
  );
}
