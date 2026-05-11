"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, CandlestickSeries, HistogramSeries, ColorType } from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar } from "@/types/market";
import { cn } from "@/lib/utils";
import type { Time } from "lightweight-charts";

const TIMEFRAMES = ["1D", "5D", "1M", "3M", "6M", "1Y", "2Y"];

interface Props { ticker: string; id: string }

export default function CandlestickChart({ ticker, id }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [ready, setReady] = useState(false);
  const { removeWidget } = useLayoutStore();
  const { activeTimeframe: tf, setActiveTimeframe: setTf } = useTickerStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["history", ticker, tf],
    queryFn: async () => {
      const res = await fetch(`/api/market/history/${ticker}?tf=${tf}`);
      return res.json() as Promise<{ bars: OHLCVBar[] }>;
    },
  });

  const { data: quote, refetch: refetchQuote } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/quote/${ticker}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Wait for the container to have real dimensions before creating the chart
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { height } = entries[0].contentRect;
      if (height > 10) setReady(true);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || !data?.bars?.length) return;

    const el = containerRef.current;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w <= 0 || h <= 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#161b22" },
        textColor: "#8b949e",
      },
      grid: {
        vertLines: { color: "#21262d" },
        horzLines: { color: "#21262d" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: {
        borderColor: "#30363d",
        timeVisible: true,
        secondsVisible: false,
      },
      width: w,
      height: h,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3fb950",
      downColor: "#f85149",
      borderUpColor: "#3fb950",
      borderDownColor: "#f85149",
      wickUpColor: "#3fb950",
      wickDownColor: "#f85149",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#1f6feb44",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;

    const sorted = [...data.bars].sort((a, b) => a.time - b.time);
    candleSeries.setData(
      sorted.map((b) => ({
        time: b.time as unknown as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );
    volumeSeries.setData(
      sorted.map((b) => ({
        time: b.time as unknown as Time,
        value: b.volume,
        color: b.close >= b.open ? "#3fb95044" : "#f8514944",
      }))
    );
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) {
        const nw = el.clientWidth;
        const nh = el.clientHeight;
        if (nw > 0 && nh > 0) {
          chartRef.current.applyOptions({ width: nw, height: nh });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [ready, data]);

  const price = quote?.price;
  const change = quote?.change;
  const pct = quote?.changePercent;
  const isUp = (change ?? 0) >= 0;

  const askAICtx = `Price chart for ${ticker} over ${tf}. Current price: ${price ? `$${price.toFixed(2)}` : "N/A"}. Change: ${change ? `${isUp ? "+" : ""}${change.toFixed(2)} (${pct?.toFixed(2)}%)` : "N/A"}. Analyze the price action and any notable trends.`;

  return (
    <WidgetShell
      title={`${ticker} — Price Chart`}
      id={id}
      onRemove={removeWidget}
      onRefresh={async () => { await Promise.all([refetch(), refetchQuote()]); }}
      loading={isLoading}
      error={error ? "Failed to load chart data" : null}
      askAIContext={askAICtx}
    >
      {/* Price header */}
      {price != null && (
        <div className="flex items-baseline gap-2 px-3 pt-2 pb-1 shrink-0">
          <span className="text-xl font-bold text-white">${price.toFixed(2)}</span>
          <span className={cn("text-sm font-medium", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
            {isUp ? "+" : ""}
            {change?.toFixed(2)} ({isUp ? "+" : ""}
            {pct?.toFixed(2)}%)
          </span>
        </div>
      )}

      {/* Timeframe selector */}
      <div className="flex items-center gap-1 px-3 pb-1 shrink-0">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
              tf === t
                ? "bg-[#1f6feb22] text-[#388bfd]"
                : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Chart container — fills remaining space */}
      <div ref={containerRef} className="w-full flex-1 min-h-0" />
    </WidgetShell>
  );
}
