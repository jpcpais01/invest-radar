"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

interface QualityData {
  overall: number;
  profitability: number;
  growth: number;
  health: number;
  efficiency: number;
}

function scoreColor(v: number) {
  if (v >= 70) return "#3fb950";
  if (v >= 45) return "#d29922";
  return "#f85149";
}

function scoreLabel(v: number) {
  if (v >= 75) return "Excellent";
  if (v >= 60) return "Good";
  if (v >= 45) return "Fair";
  if (v >= 30) return "Weak";
  return "Poor";
}

function SubBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#8b949e]">{label}</span>
        <span className="text-[10px] font-mono font-medium" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 rounded-full bg-[#21262d] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function QualityScoreWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<QualityData>({
    queryKey: ["quality", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/quality/${ticker}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const askAI = data
    ? `${ticker} quality score: Overall ${data.overall}/100 — Profitability ${data.profitability}, Growth ${data.growth}, Financial Health ${data.health}, Efficiency ${data.efficiency}. What does this tell us about the business quality?`
    : undefined;

  return (
    <WidgetShell
      title="Business Quality Score"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load quality data" : null}
      askAIContext={askAI}
    >
      {data && (
        <div className="p-4 flex flex-col h-full gap-4">
          {/* Overall score */}
          <div className="flex flex-col items-center justify-center gap-1 pt-1">
            <div
              className="text-5xl font-bold tabular-nums"
              style={{ color: scoreColor(data.overall) }}
            >
              {data.overall}
            </div>
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wider">out of 100</div>
            <div
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full mt-0.5"
              style={{
                color: scoreColor(data.overall),
                background: `${scoreColor(data.overall)}18`,
                border: `1px solid ${scoreColor(data.overall)}40`,
              }}
            >
              {scoreLabel(data.overall)}
            </div>
          </div>

          {/* Sub-scores */}
          <div className="flex flex-col gap-3 flex-1 justify-center">
            <SubBar label="Profitability" value={data.profitability} />
            <SubBar label="Growth" value={data.growth} />
            <SubBar label="Financial Health" value={data.health} />
            <SubBar label="Efficiency" value={data.efficiency} />
          </div>

          <p className="text-[10px] text-[#484f58] text-center leading-relaxed">
            Based on margins, ROE, growth, debt, and FCF conversion
          </p>
        </div>
      )}
    </WidgetShell>
  );
}
