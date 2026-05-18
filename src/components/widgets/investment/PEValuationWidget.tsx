"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";

interface Props { ticker: string; id: string }

interface PEValuationData {
  trailingEps: number;
  forwardEps: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  sectorPE: number | null;
  sectorLabel: string;
  etfTicker: string;
  fairValueTrailing: number | null;
  fairValueForward: number | null;
  premiumDiscount: number | null;
  upsideTrailing: number | null;
  currentPrice: number | null;
  analystTarget: number | null;
  analystHigh: number | null;
  analystLow: number | null;
  analystCount: number | null;
  recommendation: string | null;
  sector: string | null;
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

function premColor(pct: number) {
  // premium = expensive (bad), discount = cheap (good)
  if (pct <= -15) return "#3fb950";
  if (pct <= 0)   return "#d29922";
  return "#f85149";
}

const REC_CFG: Record<string, { label: string; color: string }> = {
  "strongBuy":  { label: "Strong Buy",  color: "#3fb950" },
  "buy":        { label: "Buy",         color: "#3fb950" },
  "hold":       { label: "Hold",        color: "#d29922" },
  "underperform":{ label: "Underperform", color: "#f85149" },
  "sell":       { label: "Sell",        color: "#f85149" },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[#484f58]">{label}</span>
      <span className="text-[11px] font-mono text-[#e6edf3]">{value}</span>
    </div>
  );
}

export default function PEValuationWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<PEValuationData>({
    queryKey: ["pe-valuation", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/pe-valuation/${ticker}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  const hasData = data && !data.error && data.trailingEps != null;
  const recCfg = data?.recommendation ? REC_CFG[data.recommendation] : null;

  const askAI = hasData
    ? `${ticker} P/E Relative Valuation — Trailing P/E: ${data.trailingPE?.toFixed(1) ?? "N/A"}x vs ${data.sectorLabel} sector (${data.etfTicker}) P/E: ${data.sectorPE?.toFixed(1) ?? "N/A"}x. Fair value (trailing): $${data.fairValueTrailing != null ? fmt(data.fairValueTrailing) : "N/A"}, current: $${data.currentPrice != null ? fmt(data.currentPrice) : "N/A"}. Analyst target: $${data.analystTarget != null ? fmt(data.analystTarget) : "N/A"} (${data.analystCount ?? 0} analysts, ${recCfg?.label ?? data.recommendation ?? "N/A"}). Is this stock cheap or expensive relative to its sector peers?`
    : undefined;

  return (
    <WidgetShell
      title="P/E Relative Valuation"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load P/E valuation data" : null}
      askAIContext={askAI}
    >
      {hasData && (
        <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
          <p className="text-[10px] text-[#484f58] leading-relaxed">
            Fair value using {data.sectorLabel} sector median P/E ({data.etfTicker}) applied to {ticker}&apos;s EPS
          </p>

          {/* Fair value vs current */}
          {data.fairValueTrailing != null && (
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] text-[#8b949e] mb-0.5">Fair Value (Trailing)</p>
                <span className="text-2xl font-mono font-bold text-[#e6edf3]">${fmt(data.fairValueTrailing)}</span>
              </div>
              {data.currentPrice != null && (
                <div className="text-right">
                  <p className="text-[10px] text-[#8b949e] mb-0.5">Current</p>
                  <span className="text-xl font-mono text-[#8b949e]">${fmt(data.currentPrice)}</span>
                </div>
              )}
            </div>
          )}

          {/* Upside badge */}
          {data.upsideTrailing != null && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                background: `${pctColor(data.upsideTrailing)}10`,
                border: `1px solid ${pctColor(data.upsideTrailing)}30`,
              }}
            >
              <span className="text-[11px] text-[#8b949e]">
                {data.upsideTrailing >= 0 ? "Upside to fair value" : "Downside to fair value"}
              </span>
              <span className="text-sm font-semibold font-mono" style={{ color: pctColor(data.upsideTrailing) }}>
                {data.upsideTrailing >= 0 ? "+" : ""}{data.upsideTrailing.toFixed(1)}%
              </span>
            </div>
          )}

          {/* P/E comparison */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#21262d]">
            <p className="text-[10px] text-[#484f58] uppercase tracking-wider mb-1">P/E Comparison</p>
            <Row label={`${ticker} Trailing P/E`} value={data.trailingPE != null ? `${data.trailingPE.toFixed(1)}x` : "—"} />
            <Row label={`${ticker} Forward P/E`}  value={data.forwardPE  != null ? `${data.forwardPE.toFixed(1)}x`  : "—"} />
            <Row label={`${data.sectorLabel} P/E (${data.etfTicker})`} value={data.sectorPE != null ? `${data.sectorPE.toFixed(1)}x` : "—"} />

            {data.premiumDiscount != null && (
              <div className="flex items-center justify-between pt-1 border-t border-[#21262d]">
                <span className="text-[10px] text-[#484f58]">
                  {data.premiumDiscount >= 0 ? "Premium to sector" : "Discount to sector"}
                </span>
                <span
                  className="text-[11px] font-semibold font-mono px-1.5 py-0.5 rounded-full"
                  style={{
                    color: premColor(data.premiumDiscount),
                    background: `${premColor(data.premiumDiscount)}18`,
                    border: `1px solid ${premColor(data.premiumDiscount)}40`,
                  }}
                >
                  {data.premiumDiscount >= 0 ? "+" : ""}{data.premiumDiscount.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* Forward fair value */}
          {data.fairValueForward != null && (
            <div className="flex items-center justify-between pt-2 border-t border-[#21262d]">
              <span className="text-[10px] text-[#484f58]">Fair Value (Forward EPS)</span>
              <span className="text-[12px] font-mono text-[#e6edf3]">${fmt(data.fairValueForward)}</span>
            </div>
          )}

          {/* Analyst consensus */}
          {data.analystTarget != null && (
            <div className="flex flex-col gap-2 pt-2 border-t border-[#21262d]">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[#484f58] uppercase tracking-wider">Analyst Consensus</p>
                {recCfg && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ color: recCfg.color, background: `${recCfg.color}18`, border: `1px solid ${recCfg.color}40` }}
                  >
                    {recCfg.label}
                  </span>
                )}
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-[#484f58] mb-0.5">Mean Target</p>
                  <span className="text-lg font-mono font-semibold text-[#e6edf3]">${fmt(data.analystTarget)}</span>
                </div>
                {data.analystCount != null && (
                  <span className="text-[10px] text-[#484f58]">{data.analystCount} analysts</span>
                )}
              </div>

              {/* Target range bar */}
              {data.analystHigh != null && data.analystLow != null && data.currentPrice != null && (() => {
                const lo = data.analystLow;
                const hi = data.analystHigh;
                const range = hi - lo;
                const curPct  = range > 0 ? Math.max(0, Math.min(1, (data.currentPrice - lo) / range)) * 100 : 50;
                const meanPct = range > 0 ? Math.max(0, Math.min(1, (data.analystTarget! - lo) / range)) * 100 : 50;
                return (
                  <div className="flex flex-col gap-1">
                    <div className="relative h-1.5 rounded-full bg-[#21262d]">
                      <div className="absolute inset-y-0 left-0 right-0 rounded-full opacity-20"
                        style={{ background: "linear-gradient(to right, #f85149, #d29922, #3fb950)" }} />
                      {/* mean target dot */}
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#8b949e]"
                        style={{ left: `${meanPct}%` }} />
                      {/* current price dot */}
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#0d1117] bg-[#e6edf3]"
                        style={{ left: `${curPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-[#484f58] font-mono">
                      <span>${fmt(lo)}</span>
                      <span className="text-[#30363d]">analyst range</span>
                      <span>${fmt(hi)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Inputs footer */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#21262d]">
            <Row label="Trailing EPS" value={`$${fmt(data.trailingEps)}`} />
            {data.forwardEps != null && <Row label="Forward EPS" value={`$${fmt(data.forwardEps)}`} />}
            <p className="text-[9px] text-[#30363d] pt-0.5">
              Fair Value = EPS × Sector Median P/E · Comparable Companies Method
            </p>
          </div>
        </div>
      )}

      {!hasData && !isLoading && !error && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">
            {data?.error === "Insufficient data"
              ? `Insufficient EPS data for ${ticker}`
              : `No P/E valuation data for ${ticker}`}
          </p>
        </div>
      )}
    </WidgetShell>
  );
}
