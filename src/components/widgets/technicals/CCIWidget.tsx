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

export default function CCIWidget({ ticker, id }: Props) {
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
      rightPriceScale: { borderColor: "#30363d", scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: "#30363d", timeVisible: false },
      width: w,
      height: h,
    });

    const cciSeries = chart.addSeries(LineSeries, {
      color: "#58a6ff",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(1) },
    });

    const bars = data.bars;
    const cciVals = data.indicators?.cci ?? [];

    cciSeries.setData(
      bars
        .map((b, i) => ({ time: b.time as unknown as Time, value: cciVals[i] }))
        .filter((d) => d.value != null && !isNaN(d.value))
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth;
      const nh = el.clientHeight;
      if (nw > 0 && nh > 0) chart.applyOptions({ width: nw, height: nh });
    });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [ready, data]);

  const cciVals = data?.indicators?.cci ?? [];
  const lastCCI = cciVals.filter((v) => !isNaN(v)).slice(-1)[0];
  const level = lastCCI == null ? null : lastCCI > 200 ? "Strongly Overbought" : lastCCI > 100 ? "Overbought" : lastCCI < -200 ? "Strongly Oversold" : lastCCI < -100 ? "Oversold" : "Neutral";
  const levelColor = level?.includes("Overbought") ? "#f85149" : level?.includes("Oversold") ? "#3fb950" : "#8b949e";

  const askAI = `CCI(20) for ${ticker} is ${lastCCI?.toFixed(1) ?? "N/A"} — ${level}. What does this momentum reading suggest for the near-term price action?`;

  return (
    <WidgetShell
      title="CCI (20)"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load CCI" : null}
      askAIContext={askAI}
    >
      <div className="flex items-center gap-3 px-3 pt-2 pb-1 shrink-0">
        <span className="text-2xl font-bold text-white">{lastCCI?.toFixed(1) ?? "—"}</span>
        {level && (
          <span
            className={cn("text-xs font-medium px-2 py-0.5 rounded-full border")}
            style={{ color: levelColor, borderColor: levelColor + "44", backgroundColor: levelColor + "11" }}
          >
            {level}
          </span>
        )}
      </div>
      <div className="flex gap-4 px-3 pb-1 shrink-0 text-[11px] text-[#8b949e]">
        <span className="text-[#f85149]">Overbought &gt;100</span>
        <span className="text-[#3fb950]">Oversold &lt;-100</span>
      </div>
      <div ref={chartRef} className="w-full flex-1 min-h-0" />
    </WidgetShell>
  );
}
