"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";

interface Props { ticker: string; id: string }

interface ValRange {
  min: number;
  max: number;
  current: number;
}

interface ValuationData {
  pe?: ValRange | null;
  ps?: ValRange | null;
  pfcf?: ValRange | null;
  pb?: ValRange | null;
  evEbitda?: { current?: number } | null;
}

function position(min: number, max: number, current: number) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (current - min) / (max - min)));
}

function valLabel(pos: number) {
  if (pos < 0.25) return { text: "Cheap", color: "#3fb950" };
  if (pos < 0.55) return { text: "Fair", color: "#d29922" };
  return { text: "Rich", color: "#f85149" };
}

function RangeBar({ label, range }: { label: string; range: ValRange }) {
  const pos = position(range.min, range.max, range.current);
  const { text, color } = valLabel(pos);
  const pct = pos * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#8b949e]">{label}</span>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
          >
            {text}
          </span>
          <span className="text-[11px] font-mono text-[#e6edf3]">{range.current.toFixed(1)}x</span>
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-[#21262d]">
        {/* gradient fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(to right, #3fb950, #d29922, #f85149)`,
            opacity: 0.35,
          }}
        />
        {/* current marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#0d1117]"
          style={{ left: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-[#484f58] font-mono">
        <span>{range.min.toFixed(1)}x</span>
        <span className="text-[#30363d]">1Y range</span>
        <span>{range.max.toFixed(1)}x</span>
      </div>
    </div>
  );
}

export default function ValuationContextWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<ValuationData>({
    queryKey: ["valuation", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/valuation/${ticker}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const hasData = data && (data.pe || data.ps || data.pfcf || data.pb);

  const askAI = hasData
    ? `${ticker} valuation context vs 1-year own range — P/E: ${data.pe ? `${data.pe.current.toFixed(1)}x (range ${data.pe.min.toFixed(1)}–${data.pe.max.toFixed(1)})` : "N/A"}, P/S: ${data.ps ? `${data.ps.current.toFixed(1)}x` : "N/A"}, P/FCF: ${data.pfcf ? `${data.pfcf.current.toFixed(1)}x` : "N/A"}. Is this company cheap or expensive relative to its own history?`
    : undefined;

  return (
    <WidgetShell
      title="Valuation Context"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load valuation data" : null}
      askAIContext={askAI}
    >
      {hasData && (
        <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
          <p className="text-[10px] text-[#484f58] leading-relaxed">
            Where today&apos;s valuation sits within its own 1-year price-implied range
          </p>

          <div className="flex flex-col gap-4">
            {data.pe && data.pe.min > 0 && data.pe.max > 0 && data.pe.current > 0 && (
              <RangeBar label="P/E (TTM)" range={data.pe} />
            )}
            {data.ps && data.ps.min > 0 && data.ps.max > 0 && data.ps.current > 0 && (
              <RangeBar label="P/S" range={data.ps} />
            )}
            {data.pfcf && data.pfcf.min > 0 && data.pfcf.max > 0 && data.pfcf.current > 0 && (
              <RangeBar label="P/FCF" range={data.pfcf} />
            )}
            {data.pb && data.pb.min > 0 && data.pb.max > 0 && data.pb.current > 0 && (
              <RangeBar label="P/B" range={data.pb} />
            )}
            {data.evEbitda?.current != null && data.evEbitda.current > 0 && (
              <div className="flex items-center justify-between py-1 border-t border-[#21262d]">
                <span className="text-[11px] text-[#8b949e]">EV/EBITDA</span>
                <span className="text-[11px] font-mono text-[#e6edf3]">{data.evEbitda.current.toFixed(1)}x</span>
              </div>
            )}
          </div>
        </div>
      )}
      {!hasData && !isLoading && !error && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">Insufficient data for {ticker}</p>
        </div>
      )}
    </WidgetShell>
  );
}
