"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";

interface Props { ticker: string; id: string }

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function upsideColor(pct: number) {
  if (pct >= 15) return "#3fb950";
  if (pct >= 0)  return "#d29922";
  return "#f85149";
}

const MODELS = [
  { key: "lynch",  label: "Lynch PEG",    color: "#388bfd" },
  { key: "pe",     label: "P/E Comps",    color: "#d29922" },
  { key: "dcf",    label: "DCF",          color: "#bc8cff" },
] as const;

export default function FairPriceWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const lynch = useQuery({
    queryKey: ["fair-value", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/fair-value/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });

  const pe = useQuery({
    queryKey: ["pe-valuation", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/pe-valuation/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });

  const dcf = useQuery({
    queryKey: ["dcf", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/dcf/${ticker}`); return r.json(); },
    staleTime: 15 * 60 * 1000,
  });

  const isLoading = lynch.isLoading || pe.isLoading || dcf.isLoading;

  const lynchVal: number | null = lynch.data?.fairValue > 0 && !lynch.data?.error ? lynch.data.fairValue : null;
  const peVal:    number | null = pe.data?.fairValueTrailing > 0 && !pe.data?.error ? pe.data.fairValueTrailing : null;
  const dcfVal:   number | null = dcf.data?.intrinsicValue > 0 && !dcf.data?.error ? dcf.data.intrinsicValue : null;

  const values = [lynchVal, peVal, dcfVal];
  const valid  = values.filter((v): v is number => v != null);
  const avg    = valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;

  const currentPrice: number | null =
    lynch.data?.currentPrice ?? pe.data?.currentPrice ?? dcf.data?.currentPrice ?? null;

  const upside = avg != null && currentPrice != null
    ? ((avg - currentPrice) / currentPrice) * 100
    : null;

  const modelValues = [lynchVal, peVal, dcfVal];

  // Positions for the price bar: span from min to max of all fair values + current price
  const allPrices = [...modelValues.filter((v): v is number => v != null)];
  if (currentPrice != null) allPrices.push(currentPrice);
  const barMin = allPrices.length > 0 ? Math.min(...allPrices) * 0.95 : 0;
  const barMax = allPrices.length > 0 ? Math.max(...allPrices) * 1.05 : 1;
  const barRange = barMax - barMin;
  const barPct = (v: number) => barRange > 0 ? Math.max(0, Math.min(1, (v - barMin) / barRange)) * 100 : 50;

  const askAI = avg != null
    ? `${ticker} composite fair price: $${fmt(avg)} (average of ${valid.length} model${valid.length > 1 ? "s" : ""}: Lynch $${lynchVal != null ? fmt(lynchVal) : "N/A"}, P/E Comps $${peVal != null ? fmt(peVal) : "N/A"}, DCF $${dcfVal != null ? fmt(dcfVal) : "N/A"}). Current price: $${currentPrice != null ? fmt(currentPrice) : "N/A"}, upside: ${upside != null ? upside.toFixed(1) + "%" : "N/A"}. How reliable is this composite valuation?`
    : undefined;

  return (
    <WidgetShell
      title="Fair Price"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => { lynch.refetch(); pe.refetch(); dcf.refetch(); }}
      loading={isLoading}
      error={null}
      askAIContext={askAI}
    >
      {avg != null ? (
        <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
          <p className="text-[10px] text-[#484f58] leading-relaxed">
            Equal-weight average of {valid.length} valuation model{valid.length > 1 ? "s" : ""}: Lynch PEG, P/E Comparable, DCF
          </p>

          {/* Main price */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] text-[#8b949e] mb-0.5">Avg Fair Price</p>
              <span className="text-2xl font-mono font-bold text-[#e6edf3]">${fmt(avg)}</span>
            </div>
            {currentPrice != null && (
              <div className="text-right">
                <p className="text-[10px] text-[#8b949e] mb-0.5">Current</p>
                <span className="text-xl font-mono text-[#8b949e]">${fmt(currentPrice)}</span>
              </div>
            )}
          </div>

          {/* Upside badge */}
          {upside != null && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                background: `${upsideColor(upside)}10`,
                border: `1px solid ${upsideColor(upside)}30`,
              }}
            >
              <span className="text-[11px] text-[#8b949e]">
                {upside >= 0 ? "Upside to fair price" : "Downside to fair price"}
              </span>
              <span className="text-sm font-semibold font-mono" style={{ color: upsideColor(upside) }}>
                {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
              </span>
            </div>
          )}

          {/* Price scatter bar */}
          {allPrices.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-[#484f58] uppercase tracking-wider">Model Range</p>
              <div className="relative h-2 rounded-full bg-[#21262d]">
                {/* Model value dots */}
                {MODELS.map(({ key, color }) => {
                  const val = key === "lynch" ? lynchVal : key === "pe" ? peVal : dcfVal;
                  if (val == null) return null;
                  return (
                    <div
                      key={key}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                      style={{ left: `${barPct(val)}%`, backgroundColor: color }}
                    />
                  );
                })}
                {/* Average marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[#0d1117] bg-[#e6edf3]"
                  style={{ left: `${barPct(avg)}%` }}
                />
                {/* Current price marker */}
                {currentPrice != null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-[#484f58]"
                    style={{ left: `${barPct(currentPrice)}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between text-[9px] text-[#484f58] font-mono">
                <span>${fmt(barMin / 0.95)}</span>
                <span className="text-[#30363d]">● avg  | current</span>
                <span>${fmt(barMax / 1.05)}</span>
              </div>
            </div>
          )}

          {/* Per-model breakdown */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#21262d]">
            <p className="text-[10px] text-[#484f58] uppercase tracking-wider">Model Breakdown</p>
            {MODELS.map(({ key, label, color }) => {
              const val = key === "lynch" ? lynchVal : key === "pe" ? peVal : dcfVal;
              const modelUpside = val != null && currentPrice != null
                ? ((val - currentPrice) / currentPrice) * 100 : null;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-[#484f58] flex-1">{label}</span>
                  {val != null ? (
                    <>
                      <span className="text-[11px] font-mono text-[#e6edf3]">${fmt(val)}</span>
                      {modelUpside != null && (
                        <span className="text-[9px] font-mono w-14 text-right" style={{ color: upsideColor(modelUpside) }}>
                          {modelUpside >= 0 ? "+" : ""}{modelUpside.toFixed(1)}%
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-[#30363d]">N/A</span>
                  )}
                </div>
              );
            })}
          </div>

          {valid.length < 3 && (
            <p className="text-[9px] text-[#30363d]">
              {3 - valid.length} model{3 - valid.length > 1 ? "s" : ""} unavailable (negative FCF or missing data)
            </p>
          )}
        </div>
      ) : !isLoading ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">No valuation data available for {ticker}</p>
        </div>
      ) : null}
    </WidgetShell>
  );
}
