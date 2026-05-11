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

export default function StochasticWidget({ ticker, id }: Props) {
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

    const kSeries = chart.addSeries(LineSeries, { color: "#388bfd", lineWidth: 2 });
    const dSeries = chart.addSeries(LineSeries, { color: "#f85149", lineWidth: 1 });

    const bars = data.bars;
    const stoch = data.indicators?.stochastic;

    if (stoch) {
      const mkData = (arr: number[]) =>
        bars
          .map((b, i) => ({ time: b.time as unknown as Time, value: arr[i] }))
          .filter((d) => d.value != null && !isNaN(d.value));
      kSeries.setData(mkData(stoch.k));
      dSeries.setData(mkData(stoch.d));
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth;
      const nh = el.clientHeight;
      if (nw > 0 && nh > 0) chart.applyOptions({ width: nw, height: nh });
    });
    ro.observe(el);

    return () => { ro.disconnect(); chart.remove(); };
  }, [ready, data]);

  const stoch = data?.indicators?.stochastic;
  const lastK = stoch?.k?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastD = stoch?.d?.filter((v) => !isNaN(v)).slice(-1)[0];
  const level = (lastK ?? 50) > 80 ? "Overbought" : (lastK ?? 50) < 20 ? "Oversold" : "Neutral";

  const askAI = `Stochastic(14,3) for ${ticker}: %K ${lastK?.toFixed(1) ?? "N/A"}, %D ${lastD?.toFixed(1) ?? "N/A"} — ${level}. What does this signal?`;

  return (
    <WidgetShell
      title="Stochastic (14, 3)"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load Stochastic" : null}
      askAIContext={askAI}
    >
      <div className="flex items-center gap-3 px-3 pt-2 pb-1 shrink-0">
        <div className="text-[11px]">
          <span className="text-[#8b949e]">%K </span>
          <span className="text-[#388bfd] font-mono">{lastK?.toFixed(1) ?? "—"}</span>
        </div>
        <div className="text-[11px]">
          <span className="text-[#8b949e]">%D </span>
          <span className="text-[#f85149] font-mono">{lastD?.toFixed(1) ?? "—"}</span>
        </div>
        <div className={cn("text-[11px] font-semibold ml-auto", {
          "text-[#f85149]": level === "Overbought",
          "text-[#3fb950]": level === "Oversold",
          "text-[#8b949e]": level === "Neutral",
        })}>
          {level}
        </div>
      </div>
      <div className="flex gap-4 px-3 pb-1 shrink-0 text-[10px] text-[#8b949e]">
        <span className="text-[#f85149]">Overbought &gt;80</span>
        <span className="text-[#3fb950]">Oversold &lt;20</span>
      </div>
      <div ref={chartRef} className="w-full flex-1 min-h-0" />
    </WidgetShell>
  );
}
