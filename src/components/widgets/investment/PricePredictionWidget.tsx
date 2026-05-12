"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  IChartApi,
  LineSeries,
  AreaSeries,
  ColorType,
} from "lightweight-charts";
import type { Time } from "lightweight-charts";
import { Minus, Plus, Sparkles, RefreshCw } from "lucide-react";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

interface PredictionResponse {
  historical: { time: number; close: number }[];
  futureDates: number[];
  runs: number[][];
  mean: number[];
  n: number;
  successfulRuns: number;
  totalRuns: number;
}

export default function PricePredictionWidget({ ticker, id }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const { removeWidget } = useLayoutStore();

  const [ready,   setReady]   = useState(false);
  const [nDays,   setNDays]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(`pp-days-${id}`) ?? "7"); } catch { return 7; }
  });
  const [nRuns,   setNRuns]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(`pp-runs-${id}`) ?? "5"); } catch { return 5; }
  });
  const [data,    setData]    = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      if (entries[0].contentRect.height > 10) setReady(true);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Persist settings
  useEffect(() => { localStorage.setItem(`pp-days-${id}`, String(nDays)); }, [id, nDays]);
  useEffect(() => { localStorage.setItem(`pp-runs-${id}`, String(nRuns)); }, [id, nRuns]);

  const predict = useCallback(async (days: number, runs: number) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/market/predict/${ticker}?n=${days}&runs=${runs}`);
      const json = await res.json();
      if (json.error) throw new Error(json.details?.[0] ?? json.error);
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  // Auto-run on mount / ticker change with default params
  useEffect(() => {
    predict(7, 5);
    setNDays(7);
    setNRuns(5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Chart
  useEffect(() => {
    if (!ready || !containerRef.current || !data) return;
    const el = containerRef.current;
    const w  = el.clientWidth;
    const h  = el.clientHeight;
    if (w <= 0 || h <= 0) return;

    chartRef.current?.remove();
    chartRef.current = null;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0d1117" },
        textColor: "#8b949e",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#161b22" },
        horzLines: { color: "#161b22" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#21262d" },
      timeScale: { borderColor: "#21262d", timeVisible: true, secondsVisible: false },
      width: w,
      height: h,
    });

    // ── Historical line ────────────────────────────────────────────────────────
    const histSeries = chart.addSeries(LineSeries, {
      color: "#c9d1d9",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    histSeries.setData(
      data.historical.map((p) => ({ time: p.time as unknown as Time, value: p.close }))
    );

    // ── Prediction data arrays (anchor = last historical point) ───────────────
    const lastH  = data.historical[data.historical.length - 1];
    const times  = [lastH.time, ...data.futureDates] as unknown as Time[];

    const meanVals  = [lastH.close, ...data.mean];
    const upperVals = [lastH.close, ...data.futureDates.map((_, i) =>
      Math.max(...data.runs.map((r) => r[i]))
    )];
    const lowerVals = [lastH.close, ...data.futureDates.map((_, i) =>
      Math.min(...data.runs.map((r) => r[i]))
    )];

    // ── Confidence band: upper area (purple fill) then lower mask ─────────────
    const upperArea = chart.addSeries(AreaSeries, {
      lineColor: "transparent",
      lineWidth: 1,
      topColor:    "rgba(139,92,246,0.20)",
      bottomColor: "rgba(139,92,246,0.04)",
      priceLineVisible:      false,
      lastValueVisible:      false,
      crosshairMarkerVisible: false,
    });
    upperArea.setData(times.map((t, i) => ({ time: t, value: upperVals[i] })));

    const lowerMask = chart.addSeries(AreaSeries, {
      lineColor: "transparent",
      lineWidth: 1,
      topColor:    "#0d1117",
      bottomColor: "#0d1117",
      priceLineVisible:      false,
      lastValueVisible:      false,
      crosshairMarkerVisible: false,
    });
    lowerMask.setData(times.map((t, i) => ({ time: t, value: lowerVals[i] })));

    // ── Individual run lines (spaghetti) ──────────────────────────────────────
    for (const run of data.runs) {
      const s = chart.addSeries(LineSeries, {
        color: "rgba(139,92,246,0.22)",
        lineWidth: 1,
        priceLineVisible:      false,
        lastValueVisible:      false,
        crosshairMarkerVisible: false,
      });
      s.setData([
        { time: lastH.time as unknown as Time, value: lastH.close },
        ...run.map((v, i) => ({ time: data.futureDates[i] as unknown as Time, value: v })),
      ]);
    }

    // ── Mean prediction line (dashed, on top) ─────────────────────────────────
    const meanLine = chart.addSeries(LineSeries, {
      color: "#a78bfa",
      lineWidth: 2,
      lineStyle: 2, // dashed
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });
    meanLine.setData(times.map((t, i) => ({ time: t, value: meanVals[i] })));

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (!el || !chartRef.current) return;
      const nw = el.clientWidth;
      const nh = el.clientHeight;
      if (nw > 0 && nh > 0) chartRef.current.applyOptions({ width: nw, height: nh });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [ready, data]);

  // Header stats
  const lastClose  = data?.historical.at(-1)?.close ?? null;
  const predFinal  = data?.mean.at(-1) ?? null;
  const predChange = lastClose && predFinal
    ? ((predFinal - lastClose) / lastClose) * 100
    : null;
  const isUp = (predChange ?? 0) >= 0;

  const askAICtx = data && lastClose && predFinal
    ? `AI Price Prediction for ${ticker}. Current price: $${lastClose.toFixed(2)}. ${data.n}-day mean prediction: $${predFinal.toFixed(2)} (${isUp ? "+" : ""}${predChange?.toFixed(2)}%). Based on ${data.successfulRuns} independent LLM runs.`
    : undefined;

  return (
    <WidgetShell
      title={`${ticker} — AI Price Prediction`}
      id={id}
      onRemove={removeWidget}
      onRefresh={() => predict(nDays, nRuns)}
      loading={loading && !data}
      error={error ?? null}
      askAIContext={askAICtx}
    >
      {/* ── Stats header ───────────────────────────────────────────────────── */}
      {data && lastClose && predFinal && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-0.5 shrink-0 flex-wrap">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-[#484f58] font-medium uppercase tracking-wide">Now</span>
            <span className="text-sm font-bold text-white">${lastClose.toFixed(2)}</span>
          </div>
          <span className="text-[#30363d]">→</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-[#484f58] font-medium uppercase tracking-wide">{data.n}d</span>
            <span className={cn("text-sm font-bold", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
              ${predFinal.toFixed(2)}
            </span>
            <span className={cn("text-xs", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
              {isUp ? "+" : ""}{predChange?.toFixed(2)}%
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-[#a78bfa]" />
            <span className="text-[10px] text-[#484f58]">
              {data.successfulRuns}/{data.totalRuns} runs
            </span>
          </div>
        </div>
      )}

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="relative z-10 shrink-0 flex items-center gap-2 px-3 py-1.5 border-t border-[#21262d] bg-[#0d1117]">

        {/* Days stepper */}
        <span className="text-[9px] font-semibold tracking-widest text-[#484f58] uppercase">Days</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setNDays((v: number) => Math.max(1, v - 1))}
            className="w-5 h-5 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <span className="text-[11px] font-mono text-white w-5 text-center select-none">{nDays}</span>
          <button
            onClick={() => setNDays((v: number) => Math.min(30, v + 1))}
            className="w-5 h-5 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="w-px h-3 bg-[#21262d] mx-0.5" />

        {/* Runs stepper */}
        <span className="text-[9px] font-semibold tracking-widest text-[#484f58] uppercase">Runs</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setNRuns((v: number) => Math.max(1, v - 1))}
            className="w-5 h-5 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <span className="text-[11px] font-mono text-white w-5 text-center select-none">{nRuns}</span>
          <button
            onClick={() => setNRuns((v: number) => Math.min(20, v + 1))}
            className="w-5 h-5 rounded flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Predict button */}
        <button
          onClick={() => predict(nDays, nRuns)}
          disabled={loading}
          className={cn(
            "ml-auto flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all border",
            loading
              ? "text-[#484f58] bg-transparent border-[#21262d] cursor-not-allowed"
              : "text-[#a78bfa] bg-[#a78bfa0d] hover:bg-[#a78bfa1a] border-[#a78bfa40] hover:border-[#a78bfa80]"
          )}
        >
          {loading ? (
            <><RefreshCw className="w-3 h-3 animate-spin" />Running…</>
          ) : (
            <><Sparkles className="w-3 h-3" />Predict</>
          )}
        </button>
      </div>
    </WidgetShell>
  );
}
