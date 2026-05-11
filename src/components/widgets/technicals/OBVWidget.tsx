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

function fmtObv(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export default function OBVWidget({ ticker, id }: Props) {
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

    const obvVals = data.indicators?.obv ?? [];
    const isRising = (() => {
      const valid = obvVals.filter((v) => !isNaN(v));
      if (valid.length < 6) return null;
      return valid[valid.length - 1] > valid[valid.length - 6];
    })();

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      rightPriceScale: {
        borderColor: "#30363d",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: "#30363d", timeVisible: false },
      width: w,
      height: h,
    });

    const obvSeries = chart.addSeries(LineSeries, {
      color: isRising === false ? "#f85149" : "#3fb950",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: fmtObv },
    });

    const bars = data.bars;
    obvSeries.setData(
      bars
        .map((b, i) => ({ time: b.time as unknown as Time, value: obvVals[i] }))
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

  const obvVals = data?.indicators?.obv ?? [];
  const validObv = obvVals.filter((v) => !isNaN(v));
  const lastOBV  = validObv.slice(-1)[0];
  const prevOBV  = validObv.length >= 6 ? validObv[validObv.length - 6] : null;
  const trend    = prevOBV == null ? null : lastOBV > prevOBV ? "Rising" : lastOBV < prevOBV ? "Falling" : "Flat";
  const trendColor = trend === "Rising" ? "#3fb950" : trend === "Falling" ? "#f85149" : "#8b949e";
  const pctChange = prevOBV != null && prevOBV !== 0 ? ((lastOBV - prevOBV) / Math.abs(prevOBV)) * 100 : null;

  const askAI = `OBV for ${ticker}: current ${fmtObv(lastOBV ?? 0)}, trend ${trend ?? "unknown"} (${pctChange?.toFixed(1) ?? "N/A"}% over 5 bars). What does this volume flow indicate about accumulation or distribution?`;

  return (
    <WidgetShell
      title="OBV"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load OBV" : null}
      askAIContext={askAI}
    >
      <div className="flex items-center gap-3 px-3 pt-2 pb-1 shrink-0">
        <span className="text-2xl font-bold text-white">{lastOBV != null ? fmtObv(lastOBV) : "—"}</span>
        {trend && (
          <span
            className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border")}
            style={{ color: trendColor, borderColor: trendColor + "44", backgroundColor: trendColor + "11" }}
          >
            {trend === "Rising" ? "▲" : trend === "Falling" ? "▼" : "→"} {trend}
          </span>
        )}
        {pctChange != null && (
          <span className={cn("text-[11px] font-mono", pctChange >= 0 ? "text-[#3fb950]" : "text-[#f85149]")}>
            {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="px-3 pb-1 shrink-0 text-[11px] text-[#484f58]">
        Rising OBV = accumulation · Falling OBV = distribution
      </div>
      <div ref={chartRef} className="w-full flex-1 min-h-0" />
    </WidgetShell>
  );
}
