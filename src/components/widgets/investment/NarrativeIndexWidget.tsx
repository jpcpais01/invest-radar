"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

type Stage = "emerging" | "building" | "consensus" | "fading" | "unknown";

interface WeekCoverage {
  label: string;
  count: number;
  sentiment: number;
}

interface NarrativeData {
  stage: Stage;
  coverage: WeekCoverage[];
  sentimentTrend: number;
  olderSentiment: number;
  recentSentiment: number;
  totalArticles: number;
}

const STAGE_CONFIG: Record<Stage, { label: string; desc: string; color: string; position: number }> = {
  emerging:  { label: "Emerging",  desc: "Growing coverage, narrative forming",   color: "#3fb950", position: 0.12 },
  building:  { label: "Building",  desc: "Momentum increasing, wider attention",  color: "#58a6ff", position: 0.38 },
  consensus: { label: "Consensus", desc: "Widely covered, crowded narrative",     color: "#d29922", position: 0.65 },
  fading:    { label: "Fading",    desc: "Coverage declining, interest waning",   color: "#f85149", position: 0.88 },
  unknown:   { label: "Unknown",   desc: "Insufficient data",                     color: "#484f58", position: 0.5  },
};

const STAGES: Stage[] = ["emerging", "building", "consensus", "fading"];

export default function NarrativeIndexWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery<NarrativeData>({
    queryKey: ["narrative", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/narrative/${ticker}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  const cfg = data ? STAGE_CONFIG[data.stage] : null;

  const askAI = data && cfg
    ? `${ticker} narrative maturity: Stage is "${cfg.label}" — ${cfg.desc}. Total recent articles: ${data.totalArticles}. Sentiment trend: ${data.sentimentTrend > 0 ? "improving" : data.sentimentTrend < 0 ? "declining" : "flat"} (${data.olderSentiment.toFixed(1)} → ${data.recentSentiment.toFixed(1)}). What does the narrative lifecycle stage suggest for investment timing?`
    : undefined;

  const maxCount = data ? Math.max(...data.coverage.map((w) => w.count), 1) : 1;

  return (
    <WidgetShell
      title="Narrative Maturity"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load narrative data" : null}
      askAIContext={askAI}
    >
      {data && cfg && (
        <div className="p-4 flex flex-col gap-4 h-full">
          {/* Stage indicator */}
          <div className="flex items-start justify-between">
            <div>
              <div
                className="text-base font-bold"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </div>
              <div className="text-[10px] text-[#8b949e] mt-0.5 leading-relaxed max-w-[160px]">
                {cfg.desc}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[#484f58]">Articles</div>
              <div className="text-sm font-bold text-[#e6edf3]">{data.totalArticles}</div>
            </div>
          </div>

          {/* Lifecycle bar */}
          <div>
            <div className="relative h-2 rounded-full overflow-hidden flex">
              {STAGES.map((s) => (
                <div
                  key={s}
                  className="flex-1 h-full"
                  style={{ backgroundColor: `${STAGE_CONFIG[s].color}30` }}
                />
              ))}
              {/* marker */}
              {data.stage !== "unknown" && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[#0d1117] transition-all"
                  style={{ left: `${cfg.position * 100}%`, backgroundColor: cfg.color }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1">
              {STAGES.map((s) => (
                <span
                  key={s}
                  className={cn("text-[8px] capitalize", data.stage === s ? "font-semibold" : "text-[#30363d]")}
                  style={{ color: data.stage === s ? STAGE_CONFIG[s].color : undefined }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Weekly coverage bars */}
          {data.coverage.length > 0 && (
            <div>
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider mb-2">Weekly Coverage</div>
              <div className="flex items-end gap-2 h-14">
                {data.coverage.map((week) => {
                  const heightPct = maxCount > 0 ? (week.count / maxCount) * 100 : 0;
                  const sentColor = week.sentiment > 0 ? "#3fb950" : week.sentiment < 0 ? "#f85149" : "#484f58";
                  return (
                    <div key={week.label} className="flex flex-col items-center gap-1 flex-1">
                      <div className="text-[9px] font-mono text-[#8b949e]">{week.count}</div>
                      <div className="w-full flex flex-col-reverse" style={{ height: 32 }}>
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${heightPct}%`,
                            minHeight: week.count > 0 ? 3 : 0,
                            backgroundColor: sentColor,
                            opacity: 0.65,
                          }}
                        />
                      </div>
                      <div className="text-[8px] text-[#484f58] text-center whitespace-nowrap">{week.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sentiment trend */}
          <div className="flex items-center justify-between border-t border-[#21262d] pt-2">
            <span className="text-[10px] text-[#8b949e]">Sentiment trend</span>
            <span
              className="text-[10px] font-semibold"
              style={{ color: data.sentimentTrend > 0 ? "#3fb950" : data.sentimentTrend < 0 ? "#f85149" : "#8b949e" }}
            >
              {data.sentimentTrend > 0 ? "↑ Improving" : data.sentimentTrend < 0 ? "↓ Declining" : "→ Flat"}
            </span>
          </div>
        </div>
      )}

      {data && data.stage === "unknown" && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">Insufficient news data for {ticker}</p>
        </div>
      )}
    </WidgetShell>
  );
}
