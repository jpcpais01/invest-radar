"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, ColorType } from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import type { Time } from "lightweight-charts";

interface Props { ticker: string; id: string }

export default function BollingerWidget({ ticker, id }: Props) {
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3fb950", downColor: "#f85149",
      borderUpColor: "#3fb950", borderDownColor: "#f85149",
      wickUpColor: "#3fb950", wickDownColor: "#f85149",
    });

    const upperSeries = chart.addSeries(LineSeries, { color: "#f85149", lineWidth: 1, lineStyle: 2 });
    const midSeries   = chart.addSeries(LineSeries, { color: "#8b949e", lineWidth: 1 });
    const lowerSeries = chart.addSeries(LineSeries, { color: "#3fb950", lineWidth: 1, lineStyle: 2 });

    const bars = data.bars;
    const bb = data.indicators?.bollinger;

    candleSeries.setData(bars.map((b) => ({
      time: b.time as unknown as Time,
      open: b.open, high: b.high, low: b.low, close: b.close,
    })));

    if (bb) {
      const toSeries = (arr: number[]) =>
        bars
          .map((b, i) => ({ time: b.time as unknown as Time, value: arr[i] }))
          .filter((d) => d.value != null && !isNaN(d.value));
      upperSeries.setData(toSeries(bb.upper));
      midSeries.setData(toSeries(bb.middle));
      lowerSeries.setData(toSeries(bb.lower));
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

  const bb = data?.indicators?.bollinger;
  const lastUpper = bb?.upper?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastMid   = bb?.middle?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastLower = bb?.lower?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastClose = data?.bars?.slice(-1)[0]?.close;

  const bandwidth = lastUpper && lastLower && lastMid
    ? ((lastUpper - lastLower) / lastMid * 100).toFixed(1)
    : null;

  const position = lastClose != null && lastUpper != null && lastLower != null
    ? lastClose > lastUpper ? "Above Upper"
    : lastClose < lastLower ? "Below Lower"
    : "Inside Bands"
    : null;

  const positionStyle = position === "Above Upper"
    ? "text-[#f85149] border-[#f8514944] bg-[#f8514911]"
    : position === "Below Lower"
    ? "text-[#3fb950] border-[#3fb95044] bg-[#3fb95011]"
    : "text-[#8b949e] border-[#30363d]";

  const askAI = lastUpper && lastMid && lastLower
    ? `Bollinger Bands (20,2) for ${ticker}: Upper ${lastUpper.toFixed(2)}, Middle ${lastMid.toFixed(2)}, Lower ${lastLower.toFixed(2)}. Bandwidth ${bandwidth}%. Price is ${position}. What does this indicate?`
    : `Bollinger Bands for ${ticker}`;

  return (
    <WidgetShell
      title="Bollinger Bands (20,2)"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load Bollinger data" : null}
      askAIContext={askAI}
    >
      <div className="flex items-center gap-4 px-3 pt-2 pb-1 shrink-0 flex-wrap">
        {lastUpper && (
          <div className="flex flex-col">
            <span className="text-[9px] text-[#484f58]">Upper</span>
            <span className="text-xs font-mono text-[#f85149]">{lastUpper.toFixed(2)}</span>
          </div>
        )}
        {lastMid && (
          <div className="flex flex-col">
            <span className="text-[9px] text-[#484f58]">Middle</span>
            <span className="text-xs font-mono text-[#8b949e]">{lastMid.toFixed(2)}</span>
          </div>
        )}
        {lastLower && (
          <div className="flex flex-col">
            <span className="text-[9px] text-[#484f58]">Lower</span>
            <span className="text-xs font-mono text-[#3fb950]">{lastLower.toFixed(2)}</span>
          </div>
        )}
        {bandwidth && (
          <div className="flex flex-col">
            <span className="text-[9px] text-[#484f58]">BW%</span>
            <span className="text-xs font-mono text-white">{bandwidth}%</span>
          </div>
        )}
        {position && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ml-auto ${positionStyle}`}>
            {position}
          </span>
        )}
      </div>
      <div ref={chartRef} className="w-full flex-1 min-h-0" />
    </WidgetShell>
  );
}
