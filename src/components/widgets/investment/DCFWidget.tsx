"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";

interface Props { ticker: string; id: string }

interface YearRow { year: number; fcf: number; pv: number }

interface DCFData {
  intrinsicValue: number;
  bearValue: number;
  bullValue: number;
  currentPrice: number | null;
  fcfPerShare: number;
  growthRate: number;
  growthSource: string;
  wacc: number;
  rfRate: number;
  beta: number;
  costOfEquity: number;
  costOfDebt: number;
  terminalGrowth: number;
  pvHighGrowth: number;
  pvFade: number;
  pvTerminal: number;
  years: YearRow[];
  upside: number | null;
  error?: string;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pctColor(pct: number) {
  if (pct >= 20) return "#3fb950";
  if (pct >= 0)  return "#d29922";
  return "#f85149";
}

function Row({ label, value, dim }: { label: string; value: React.ReactNode; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[10px] ${dim ? "text-[#30363d]" : "text-[#484f58]"}`}>{label}</span>
      <span className={`text-[11px] font-mono ${dim ? "text-[#484f58]" : "text-[#e6edf3]"}`}>{value}</span>
    </div>
  );
}

export default function DCFWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<DCFData>({
    queryKey: ["dcf", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/dcf/${ticker}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  const hasData = data && !data.error && data.intrinsicValue != null;

  const askAI = hasData
    ? `${ticker} DCF Intrinsic Value: $${fmt(data.intrinsicValue)} (bear $${fmt(data.bearValue)}, bull $${fmt(data.bullValue)}) vs current $${data.currentPrice != null ? fmt(data.currentPrice) : "N/A"}. Assumptions: FCF/share $${fmt(data.fcfPerShare)}, growth ${fmt(data.growthRate, 1)}% (${data.growthSource}), WACC ${fmt(data.wacc, 1)}%, terminal growth ${fmt(data.terminalGrowth, 1)}%. Is this DCF valuation reasonable and what are the key risks?`
    : undefined;

  // Value composition bar widths
  const total = hasData ? data.pvHighGrowth + data.pvFade + data.pvTerminal : 1;
  const highPct     = hasData ? (data.pvHighGrowth / total) * 100 : 0;
  const fadePct     = hasData ? (data.pvFade      / total) * 100 : 0;
  const terminalPct = hasData ? (data.pvTerminal  / total) * 100 : 0;

  // Scenario bar: position base within bear–bull range
  const scenarioRange = hasData ? data.bullValue - data.bearValue : 1;
  const basePct = hasData && scenarioRange > 0
    ? Math.max(0, Math.min(1, (data.intrinsicValue - data.bearValue) / scenarioRange)) * 100
    : 50;
  const curPct = hasData && data.currentPrice != null && scenarioRange > 0
    ? Math.max(0, Math.min(1, (data.currentPrice - data.bearValue) / scenarioRange)) * 100
    : null;

  return (
    <WidgetShell
      title="DCF Valuation"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load DCF data" : null}
      askAIContext={askAI}
    >
      {hasData && (
        <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
          <p className="text-[10px] text-[#484f58] leading-relaxed">
            10-year discounted free cash flow · 5yr high-growth then 5yr fade · Gordon Growth terminal value
          </p>

          {/* Intrinsic value vs current */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] text-[#8b949e] mb-0.5">Intrinsic Value</p>
              <span className="text-2xl font-mono font-bold text-[#e6edf3]">${fmt(data.intrinsicValue)}</span>
            </div>
            {data.currentPrice != null && (
              <div className="text-right">
                <p className="text-[10px] text-[#8b949e] mb-0.5">Current</p>
                <span className="text-xl font-mono text-[#8b949e]">${fmt(data.currentPrice)}</span>
              </div>
            )}
          </div>

          {/* Upside badge */}
          {data.upside != null && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{
                background: `${pctColor(data.upside)}10`,
                border: `1px solid ${pctColor(data.upside)}30`,
              }}
            >
              <span className="text-[11px] text-[#8b949e]">
                {data.upside >= 0 ? "Margin of safety" : "Downside to fair value"}
              </span>
              <span className="text-sm font-semibold font-mono" style={{ color: pctColor(data.upside) }}>
                {data.upside >= 0 ? "+" : ""}{fmt(data.upside, 1)}%
              </span>
            </div>
          )}

          {/* Bear / Base / Bull scenario bar */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-[#484f58] uppercase tracking-wider">Scenario Range</p>
            <div className="relative h-2 rounded-full bg-[#21262d]">
              {/* gradient fill */}
              <div className="absolute inset-y-0 left-0 right-0 rounded-full opacity-20"
                style={{ background: "linear-gradient(to right, #f85149, #d29922, #3fb950)" }} />
              {/* base case dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#8b949e]"
                style={{ left: `${basePct}%` }}
              />
              {/* current price dot */}
              {curPct != null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#0d1117] bg-[#e6edf3]"
                  style={{ left: `${curPct}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-[#484f58]">
              <span>Bear ${fmt(data.bearValue, 0)}</span>
              <span className="text-[#30363d]">Base ${fmt(data.intrinsicValue, 0)}</span>
              <span>Bull ${fmt(data.bullValue, 0)}</span>
            </div>
          </div>

          {/* Value composition */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-[#484f58] uppercase tracking-wider">Value Breakdown</p>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div className="rounded-l-full" style={{ width: `${highPct}%`, background: "#388bfd" }} />
              <div style={{ width: `${fadePct}%`, background: "#d29922" }} />
              <div className="rounded-r-full" style={{ width: `${terminalPct}%`, background: "#484f58" }} />
            </div>
            <div className="flex items-center gap-3 text-[9px] text-[#484f58]">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#388bfd] inline-block" />Yrs 1–5 ({highPct.toFixed(0)}%)</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#d29922] inline-block" />Yrs 6–10 ({fadePct.toFixed(0)}%)</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#484f58] inline-block" />Terminal ({terminalPct.toFixed(0)}%)</span>
            </div>
          </div>

          {/* Key assumptions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#21262d]">
            <p className="text-[10px] text-[#484f58] uppercase tracking-wider">Assumptions</p>
            <Row label={`FCF / Share (TTM)`}                  value={`$${fmt(data.fcfPerShare)}`} />
            <Row label={`Growth Rate (${data.growthSource})`} value={`${fmt(data.growthRate, 1)}%`} />
            <Row label="Terminal Growth Rate"                  value={`${fmt(data.terminalGrowth, 1)}%`} />
            <Row label="WACC"                                  value={`${fmt(data.wacc, 1)}%`} />
          </div>

          {/* WACC components */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#21262d]">
            <p className="text-[10px] text-[#484f58] uppercase tracking-wider">WACC Detail</p>
            <Row label={`Risk-Free Rate (10Y Treasury)`} value={`${fmt(data.rfRate, 2)}%`} dim />
            <Row label={`Beta`}                          value={fmt(data.beta, 2)} dim />
            <Row label={`Cost of Equity (CAPM)`}         value={`${fmt(data.costOfEquity, 1)}%`} dim />
            <Row label={`Cost of Debt`}                  value={`${fmt(data.costOfDebt, 1)}%`} dim />
            <p className="text-[9px] text-[#30363d] pt-0.5">
              WACC = Ke × E/(D+E) + Kd × (1–t) × D/(D+E)
            </p>
          </div>
        </div>
      )}

      {!hasData && !isLoading && !error && (
        <div className="h-full flex items-center justify-center px-4 text-center">
          <p className="text-xs text-[#484f58]">
            {data?.error === "Insufficient data"
              ? `${ticker} has negative or unavailable FCF — DCF requires positive free cash flow`
              : `No DCF data for ${ticker}`}
          </p>
        </div>
      )}
    </WidgetShell>
  );
}
