"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, HistogramSeries, ColorType } from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { cn } from "@/lib/utils";
import type { Time } from "lightweight-charts";

interface Props { ticker: string; id: string }

export default function MACDWidget({ ticker, id }: Props) {
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
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", timeVisible: false },
      width: w,
      height: h,
    });

    const macdSeries = chart.addSeries(LineSeries, { color: "#388bfd", lineWidth: 2 });
    const signalSeries = chart.addSeries(LineSeries, { color: "#f85149", lineWidth: 1 });
    const histSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "price" } });

    const bars = data.bars;
    const macd = data.indicators?.macd;

    if (macd) {
      const mkData = (arr: number[]) =>
        bars
          .map((b, i) => ({ time: b.time as unknown as Time, value: arr[i] }))
          .filter((d) => d.value != null && !isNaN(d.value));

      macdSeries.setData(mkData(macd.macd));
      signalSeries.setData(mkData(macd.signal));
      histSeries.setData(
        bars
          .map((b, i) => ({
            time: b.time as unknown as Time,
            value: macd.histogram[i],
            color: macd.histogram[i] >= 0 ? "#3fb95066" : "#f8514966",
          }))
          .filter((d) => d.value != null && !isNaN(d.value))
      );
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

  const macd = data?.indicators?.macd;
  const lastMACD = macd?.macd?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastSignal = macd?.signal?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastHist = macd?.histogram?.filter((v) => !isNaN(v)).slice(-1)[0];
  const isBullish = (lastHist ?? 0) > 0;

  const askAI = `MACD for ${ticker}: MACD ${lastMACD?.toFixed(3) ?? "N/A"}, Signal ${lastSignal?.toFixed(3) ?? "N/A"}, Histogram ${lastHist?.toFixed(3) ?? "N/A"} (${isBullish ? "Bullish" : "Bearish"}). What does this signal?`;

  return (
    <WidgetShell
      title="MACD (12, 26, 9)"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load MACD" : null}
      askAIContext={askAI}
    >
      <div className="flex items-center gap-3 px-3 pt-2 pb-1 shrink-0 flex-wrap">
        <div className="text-[11px]">
          <span className="text-[#8b949e]">MACD </span>
          <span className="text-[#388bfd] font-mono">{lastMACD?.toFixed(3) ?? "—"}</span>
        </div>
        <div className="text-[11px]">
          <span className="text-[#8b949e]">Signal </span>
          <span className="text-[#f85149] font-mono">{lastSignal?.toFixed(3) ?? "—"}</span>
        </div>
        <div className={cn("text-[11px] font-semibold", isBullish ? "text-[#3fb950]" : "text-[#f85149]")}>
          {isBullish ? "▲ Bullish" : "▼ Bearish"}
        </div>
      </div>
      <div ref={chartRef} className="w-full flex-1 min-h-0" />
    </WidgetShell>
  );
}
