"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, ColorType } from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { cn } from "@/lib/utils";
import type { Time } from "lightweight-charts";

interface Props { ticker: string; id: string }

export default function PSARWidget({ ticker, id }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const { removeWidget } = useLayoutStore();
  const { activeTimeframe: tf } = useTickerStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["history-indicators", ticker, tf],
    queryFn: async () => {
      const res = await fetch(`/api/market/history/${ticker}?tf=${tf}&indicators=true`);
      return res.json() as Promise<{ bars: OHLCVBar[]; indicators: TechnicalIndicators }>;
    },
  });

  const { data: quote } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/quote/${ticker}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!chartRef.current) return;
    const ro = new ResizeObserver((entries) => {
      if (entries[0].contentRect.height > 10) setReady(true);
    });
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !chartRef.current || !data?.bars?.length) return;
    const el = chartRef.current;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w <= 0 || h <= 0) return;

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      rightPriceScale: { borderColor: "#30363d", scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: "#30363d", timeVisible: false },
      width: w,
      height: h,
    });

    const priceSeries = chart.addSeries(LineSeries, { color: "#e6edf3", lineWidth: 1, title: "Price" });
    const sarSeries   = chart.addSeries(LineSeries, { color: "#f0883e", lineWidth: 1, lineStyle: 2, title: "SAR" });

    const bars    = data.bars;
    const sarVals = data.indicators?.psar ?? [];

    const mkPoints = (arr: number[]) =>
      bars
        .map((b, i) => ({ time: b.time as unknown as Time, value: arr[i] }))
        .filter((d) => d.value != null && !isNaN(d.value));

    priceSeries.setData(mkPoints(bars.map((b) => b.close)));
    sarSeries.setData(mkPoints(sarVals));

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth;
      const nh = el.clientHeight;
      if (nw > 0 && nh > 0) chart.applyOptions({ width: nw, height: nh });
    });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [ready, data]);

  const sarVals  = data?.indicators?.psar ?? [];
  const lastSAR  = sarVals.filter((v) => !isNaN(v)).slice(-1)[0];
  const price    = quote?.price;
  const isBullish = price != null && lastSAR != null && price > lastSAR;
  const dist     = price != null && lastSAR != null ? Math.abs(((price - lastSAR) / price) * 100) : null;

  const askAI = `Parabolic SAR for ${ticker}: SAR at $${lastSAR?.toFixed(2) ?? "N/A"}, price at $${price?.toFixed(2) ?? "N/A"}. SAR is ${isBullish ? "below price (uptrend / buy signal)" : "above price (downtrend / sell signal)"}. Interpret this signal.`;

  return (
    <WidgetShell
      title="Parabolic SAR (0.02, 0.2)"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load PSAR" : null}
      askAIContext={askAI}
    >
      <div className="flex items-center gap-3 px-3 pt-2 pb-1 shrink-0">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white">${lastSAR?.toFixed(2) ?? "—"}</span>
          <span className="text-[11px] text-[#8b949e]">SAR</span>
        </div>
        {lastSAR != null && (
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", isBullish ? "text-[#3fb950] border-[#3fb95044] bg-[#3fb95011]" : "text-[#f85149] border-[#f8514944] bg-[#f8514911]")}>
            {isBullish ? "▲ Below price" : "▼ Above price"}
          </span>
        )}
      </div>
      <div className="flex gap-4 px-3 pb-1 shrink-0 text-[11px] text-[#8b949e]">
        {dist != null && <span>Distance <span className="text-white font-mono">{dist.toFixed(2)}%</span></span>}
        <span className="text-[#484f58]">SAR below = uptrend · SAR above = downtrend</span>
      </div>
      <div ref={chartRef} className="w-full flex-1 min-h-0" />
      <div className="flex gap-3 px-3 pb-1.5 shrink-0 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#e6edf3] inline-block" />Price</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f0883e] inline-block rounded border-dashed" />SAR</span>
      </div>
    </WidgetShell>
  );
}
