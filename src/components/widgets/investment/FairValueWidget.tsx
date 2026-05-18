"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";

interface Props { ticker: string; id: string }

interface FairValueData {
  fairValue: number;
  currentPrice: number | null;
  trailingEps: number;
  growthRate: number;
  growthSource: string;
  upside: number | null;
  peg: number | null;
  error?: string;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctColor(pct: number) {
  if (pct >= 15) return "#3fb950";
  if (pct >= 0)  return "#d29922";
  return "#f85149";
}

function pegLabel(peg: number) {
  if (peg < 0.5)  return { text: "Deep Value", color: "#3fb950" };
  if (peg < 1.0)  return { text: "Undervalued", color: "#3fb950" };
  if (peg < 1.5)  return { text: "Fair Value",  color: "#d29922" };
  if (peg < 2.0)  return { text: "Overvalued",  color: "#f85149" };
  return             { text: "Expensive",   color: "#f85149" };
}

export default function FairValueWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<FairValueData>({
    queryKey: ["fair-value", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/fair-value/${ticker}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  const hasData = data && !data.error && data.fairValue != null;

  const askAI = hasData
    ? `${ticker} Peter Lynch Fair Value: $${fmt(data.fairValue)} vs current price $${data.currentPrice != null ? fmt(data.currentPrice) : "N/A"}. EPS: $${fmt(data.trailingEps)}, growth rate: ${data.growthRate.toFixed(1)}% (${data.growthSource}). PEG: ${data.peg != null ? data.peg.toFixed(2) : "N/A"}. Is this stock attractively priced using the Lynch framework?`
    : undefined;

  const upsideColor = hasData && data.upside != null ? pctColor(data.upside) : "#8b949e";
  const peg = hasData && data.peg != null ? data.peg : null;
  const pegCfg = peg != null ? pegLabel(peg) : null;

  // PEG gauge: clamp to [0, 3] range, fair value at 1.0
  const pegPct = peg != null ? Math.min(Math.max(peg / 3, 0), 1) * 100 : null;

  return (
    <WidgetShell
      title="Lynch Fair Value"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load fair value data" : null}
      askAIContext={askAI}
    >
      {hasData && (
        <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
          <p className="text-[10px] text-[#484f58] leading-relaxed">
            Peter Lynch fair value: a stock&apos;s fair P/E equals its EPS growth rate (PEG = 1)
          </p>

          {/* Main price comparison */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] text-[#8b949e] mb-0.5">Fair Value</p>
              <span className="text-2xl font-mono font-bold text-[#e6edf3]">${fmt(data.fairValue)}</span>
            </div>
            {data.currentPrice != null && (
              <div className="text-right">
                <p className="text-[10px] text-[#8b949e] mb-0.5">Current</p>
                <span className="text-xl font-mono text-[#8b949e]">${fmt(data.currentPrice)}</span>
              </div>
            )}
          </div>

          {/* Upside / downside badge */}
          {data.upside != null && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: `${upsideColor}10`, border: `1px solid ${upsideColor}30` }}
            >
              <span className="text-[11px] text-[#8b949e]">
                {data.upside >= 0 ? "Upside to fair value" : "Downside to fair value"}
              </span>
              <span className="text-sm font-semibold font-mono" style={{ color: upsideColor }}>
                {data.upside >= 0 ? "+" : ""}{data.upside.toFixed(1)}%
              </span>
            </div>
          )}

          {/* PEG gauge */}
          {peg != null && pegCfg != null && pegPct != null && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#8b949e]">PEG Ratio</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ color: pegCfg.color, background: `${pegCfg.color}18`, border: `1px solid ${pegCfg.color}40` }}
                  >
                    {pegCfg.text}
                  </span>
                  <span className="text-[11px] font-mono text-[#e6edf3]">{peg.toFixed(2)}x</span>
                </div>
              </div>
              <div className="relative h-1.5 rounded-full bg-[#21262d]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${pegPct}%`,
                    background: "linear-gradient(to right, #3fb950, #d29922, #f85149)",
                    opacity: 0.35,
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#0d1117]"
                  style={{ left: `${pegPct}%`, backgroundColor: pegCfg.color }}
                />
                {/* Fair value marker at PEG = 1 (33.3% of 0–3 range) */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-[#484f58] opacity-60"
                  style={{ left: "33.3%" }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[#484f58] font-mono">
                <span>0x</span>
                <span className="text-[#30363d]">PEG range 0–3x</span>
                <span>3x</span>
              </div>
            </div>
          )}

          {/* Formula inputs */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#21262d]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#484f58]">Trailing EPS</span>
              <span className="text-[11px] font-mono text-[#e6edf3]">${fmt(data.trailingEps)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#484f58]">Growth Rate ({data.growthSource})</span>
              <span className="text-[11px] font-mono text-[#e6edf3]">{data.growthRate.toFixed(1)}%</span>
            </div>
            <p className="text-[9px] text-[#30363d] pt-1">
              Fair Value = EPS × Growth Rate · Lynch PEG Model
            </p>
          </div>
        </div>
      )}

      {!hasData && !isLoading && !error && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">
            {data?.error === "Insufficient data"
              ? `Insufficient EPS or growth data for ${ticker}`
              : `No fair value data for ${ticker}`}
          </p>
        </div>
      )}
    </WidgetShell>
  );
}
