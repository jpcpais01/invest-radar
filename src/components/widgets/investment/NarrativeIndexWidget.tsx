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
  positive: number;
  neutral: number;
  negative: number;
}

interface NarrativeData {
  stage: Stage;
  coverage: WeekCoverage[];
  totalArticles: number;
  positive: number;
  neutral: number;
  negative: number;
}

const STAGE_CONFIG: Record<Stage, { label: string; desc: string; color: string; position: number }> = {
  emerging:  { label: "Emerging",  desc: "Story forming, limited coverage",   color: "#3fb950", position: 0.12 },
  building:  { label: "Building",  desc: "Gaining traction, more attention",  color: "#58a6ff", position: 0.38 },
  consensus: { label: "Consensus", desc: "Widely known, crowded narrative",   color: "#d29922", position: 0.65 },
  fading:    { label: "Fading",    desc: "Interest waning, coverage dropping",color: "#f85149", position: 0.88 },
  unknown:   { label: "Unknown",   desc: "Insufficient data",                 color: "#484f58", position: 0.5  },
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
  const total = data ? data.positive + data.neutral + data.negative : 0;
  const maxCount = data ? Math.max(...data.coverage.map((w) => w.count), 1) : 1;

  const askAI = data && cfg
    ? `${ticker} narrative stage: "${cfg.label}" — ${cfg.desc}. ${data.totalArticles} articles over 4 weeks: ${data.positive} positive, ${data.neutral} neutral, ${data.negative} negative. What does this narrative maturity suggest about timing?`
    : undefined;

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
      {data?.stage === "unknown" && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">Insufficient news data for {ticker}</p>
        </div>
      )}

      {data && cfg && data.stage !== "unknown" && (
        <div className="p-3 flex flex-col gap-3 h-full">

          {/* Stage + count */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold leading-none" style={{ color: cfg.color }}>
                {cfg.label}
              </div>
              <div className="text-[10px] text-[#8b949e] mt-1">{cfg.desc}</div>
            </div>
            <div
              className="flex flex-col items-center justify-center w-12 h-12 rounded-full border-2"
              style={{ borderColor: `${cfg.color}55`, backgroundColor: `${cfg.color}12` }}
            >
              <span className="text-base font-bold leading-none" style={{ color: cfg.color }}>{data.totalArticles}</span>
              <span className="text-[8px] text-[#484f58] mt-0.5">articles</span>
            </div>
          </div>

          {/* Lifecycle bar */}
          <div>
            <div className="relative h-1.5 rounded-full overflow-hidden flex">
              {STAGES.map((s) => (
                <div
                  key={s}
                  className="flex-1 h-full"
                  style={{ backgroundColor: `${STAGE_CONFIG[s].color}28` }}
                />
              ))}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[#0d1117] shadow-md"
                style={{ left: `${cfg.position * 100}%`, backgroundColor: cfg.color }}
              />
            </div>
            <div className="flex justify-between mt-1">
              {STAGES.map((s) => (
                <span
                  key={s}
                  className={cn("text-[8px] capitalize")}
                  style={{ color: data.stage === s ? STAGE_CONFIG[s].color : "#30363d", fontWeight: data.stage === s ? 600 : 400 }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Sentiment pills */}
          {total > 0 && (
            <div className="flex gap-1.5">
              {[
                { label: "Positive", count: data.positive, color: "#3fb950", bg: "#3fb95015" },
                { label: "Neutral",  count: data.neutral,  color: "#8b949e", bg: "#8b949e15" },
                { label: "Negative", count: data.negative, color: "#f85149", bg: "#f8514915" },
              ].map(({ label, count, color, bg }) => (
                <div
                  key={label}
                  className="flex-1 flex flex-col items-center py-2 rounded-xl"
                  style={{ backgroundColor: bg }}
                >
                  <span className="text-base font-bold leading-none" style={{ color }}>{count}</span>
                  <span className="text-[9px] mt-1" style={{ color }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stacked proportion bar */}
          {total > 0 && (
            <div className="flex h-1 rounded-full overflow-hidden">
              {data.positive > 0 && <div style={{ width: `${(data.positive / total) * 100}%`, backgroundColor: "#3fb950" }} />}
              {data.neutral  > 0 && <div style={{ width: `${(data.neutral  / total) * 100}%`, backgroundColor: "#484f58" }} />}
              {data.negative > 0 && <div style={{ width: `${(data.negative / total) * 100}%`, backgroundColor: "#f85149" }} />}
            </div>
          )}

          {/* 4-week bars */}
          {data.coverage.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider mb-1.5">Weekly Coverage</div>
              <div className="flex items-end gap-2" style={{ height: 52 }}>
                {data.coverage.map((week) => {
                  const heightPct = (week.count / maxCount) * 100;
                  const posH = week.count > 0 ? (week.positive / week.count) * 100 : 0;
                  const neuH = week.count > 0 ? (week.neutral  / week.count) * 100 : 0;
                  const negH = week.count > 0 ? (week.negative / week.count) * 100 : 0;
                  return (
                    <div key={week.label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] font-mono text-[#8b949e]">{week.count || ""}</span>
                      <div className="w-full rounded-sm overflow-hidden flex flex-col-reverse" style={{ height: 32 }}>
                        {week.count > 0 ? (
                          <div className="w-full flex flex-col-reverse overflow-hidden" style={{ height: `${heightPct}%`, minHeight: 3 }}>
                            {negH > 0 && <div style={{ height: `${negH}%`, backgroundColor: "#f85149", opacity: 0.8 }} />}
                            {neuH > 0 && <div style={{ height: `${neuH}%`, backgroundColor: "#484f58", opacity: 0.6 }} />}
                            {posH > 0 && <div style={{ height: `${posH}%`, backgroundColor: "#3fb950", opacity: 0.8 }} />}
                          </div>
                        ) : (
                          <div className="w-full" style={{ height: 2, backgroundColor: "#21262d" }} />
                        )}
                      </div>
                      <span className="text-[8px] text-[#484f58] whitespace-nowrap">{week.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2.5 mt-1.5">
                {[["#3fb950", "Positive"], ["#484f58", "Neutral"], ["#f85149", "Negative"]].map(([color, label]) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color, opacity: 0.8 }} />
                    <span className="text-[8px] text-[#484f58]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
