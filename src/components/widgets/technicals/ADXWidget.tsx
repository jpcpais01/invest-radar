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

export default function ADXWidget({ ticker, id }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adxRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdiRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mdiRef = useRef<any>(null);
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
    if (!ready || !chartRef.current) return;
    const el = chartRef.current;
    const w = el.clientWidth; const h = el.clientHeight;
    if (w <= 0 || h <= 0) return;
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      rightPriceScale: { borderColor: "#30363d", scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: "#30363d", timeVisible: false },
      width: w, height: h,
    });
    adxRef.current = chart.addSeries(LineSeries, { color: "#a371f7", lineWidth: 2, title: "ADX" });
    pdiRef.current = chart.addSeries(LineSeries, { color: "#3fb950", lineWidth: 1, title: "+DI" });
    mdiRef.current = chart.addSeries(LineSeries, { color: "#f85149", lineWidth: 1, title: "-DI" });
    apiRef.current = chart;
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth; const nh = el.clientHeight;
      if (nw > 0 && nh > 0) chart.applyOptions({ width: nw, height: nh });
    });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); apiRef.current = adxRef.current = pdiRef.current = mdiRef.current = null; };
  }, [ready]);

  useEffect(() => {
    if (!apiRef.current || !adxRef.current || !data?.bars?.length) return;
    const bars = data.bars; const adxData = data.indicators?.adx;
    const mkPoints = (arr: number[]) =>
      bars.map((b, i) => ({ time: b.time as unknown as Time, value: arr[i] }))
          .filter((d) => d.value != null && !isNaN(d.value));
    if (adxData) {
      adxRef.current.setData(mkPoints(adxData.adx));
      pdiRef.current.setData(mkPoints(adxData.pdi));
      mdiRef.current.setData(mkPoints(adxData.mdi));
    }
    apiRef.current.timeScale().fitContent();
  }, [data, ready]);

  const adxData = data?.indicators?.adx;
  const lastADX = adxData?.adx?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastPDI = adxData?.pdi?.filter((v) => !isNaN(v)).slice(-1)[0];
  const lastMDI = adxData?.mdi?.filter((v) => !isNaN(v)).slice(-1)[0];

  const strength = lastADX == null ? null : lastADX >= 40 ? "Very Strong" : lastADX >= 25 ? "Strong" : lastADX >= 20 ? "Moderate" : "Weak/No Trend";
  const strengthColor = lastADX == null ? "#8b949e" : lastADX >= 25 ? "#3fb950" : lastADX >= 20 ? "#d29922" : "#8b949e";
  const direction = lastPDI != null && lastMDI != null ? (lastPDI > lastMDI ? "Bullish" : "Bearish") : null;

  const askAI = `ADX/DMI for ${ticker} (${tf}): ADX ${lastADX?.toFixed(1) ?? "N/A"} (${strength}), +DI ${lastPDI?.toFixed(1) ?? "N/A"}, -DI ${lastMDI?.toFixed(1) ?? "N/A"}. Analyse the trend strength and direction.`;

  return (
    <WidgetShell
      title="ADX / DMI (14)"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load ADX" : null}
      askAIContext={askAI}
    >
      <div className="flex items-center gap-3 px-3 pt-2 pb-1 shrink-0 flex-wrap">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white">{lastADX?.toFixed(1) ?? "—"}</span>
          <span className="text-[11px] text-[#8b949e]">ADX</span>
        </div>
        {strength && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-current" style={{ color: strengthColor }}>
            {strength}
          </span>
        )}
        {direction && (
          <span className={cn("text-[11px] font-semibold", direction === "Bullish" ? "text-[#3fb950]" : "text-[#f85149]")}>
            {direction === "Bullish" ? "▲" : "▼"} {direction}
          </span>
        )}
      </div>
      <div className="flex gap-4 px-3 pb-1 shrink-0 text-[11px]">
        <span className="text-[#3fb950]">+DI {lastPDI?.toFixed(1) ?? "—"}</span>
        <span className="text-[#f85149]">-DI {lastMDI?.toFixed(1) ?? "—"}</span>
        <span className="text-[#484f58]">Strong &gt;25 · No trend &lt;20</span>
      </div>
      <div ref={chartRef} className="w-full flex-1 min-h-0" />
      <div className="flex gap-3 px-3 pb-1.5 shrink-0 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#a371f7] inline-block" />ADX</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#3fb950] inline-block" />+DI</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f85149] inline-block" />-DI</span>
      </div>
    </WidgetShell>
  );
}
