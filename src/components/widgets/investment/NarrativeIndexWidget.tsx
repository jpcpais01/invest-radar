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
  sentimentTrend: number;
  olderSentiment: number;
  recentSentiment: number;
  totalArticles: number;
  positive: number;
  neutral: number;
  negative: number;
}

const STAGE_CONFIG: Record<Stage, { label: string; desc: string; color: string; position: number }> = {
  emerging:  { label: "Emerging",  desc: "Growing coverage, narrative forming",  color: "#3fb950", position: 0.12 },
  building:  { label: "Building",  desc: "Momentum increasing, wider attention", color: "#58a6ff", position: 0.38 },
  consensus: { label: "Consensus", desc: "Widely covered, crowded narrative",    color: "#d29922", position: 0.65 },
  fading:    { label: "Fading",    desc: "Coverage declining, interest waning",  color: "#f85149", position: 0.88 },
  unknown:   { label: "Unknown",   desc: "Insufficient data",                    color: "#484f58", position: 0.5  },
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
    ? `${ticker} narrative: Stage "${cfg.label}". ${data.totalArticles} articles over 4 weeks — ${data.positive} positive, ${data.neutral} neutral, ${data.negative} negative. Sentiment trend: ${data.sentimentTrend > 0 ? "improving" : data.sentimentTrend < 0 ? "declining" : "flat"} (${data.olderSentiment.toFixed(1)} → ${data.recentSentiment.toFixed(1)}). What does this suggest for investment timing?`
    : undefined;

  const maxCount = data ? Math.max(...data.coverage.map((w) => w.count), 1) : 1;
  const total = data ? data.positive + data.neutral + data.negative : 0;

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
      {data && data.stage === "unknown" && (
        <div className="h-full flex items-center justify-center">
          <p className="text-xs text-[#484f58]">Insufficient news data for {ticker}</p>
        </div>
      )}

      {data && cfg && data.stage !== "unknown" && (
        <div className="p-3 flex flex-col gap-3 h-full">

          {/* ── Stage + article count ── */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-base font-bold" style={{ color: cfg.color }}>
                {cfg.label}
              </div>
              <div className="text-[10px] text-[#8b949e] mt-0.5 leading-relaxed max-w-[160px]">
                {cfg.desc}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-[#484f58]">4-week total</div>
              <div className="text-lg font-bold text-[#e6edf3] leading-none">{data.totalArticles}</div>
              <div className="text-[9px] text-[#484f58]">articles</div>
            </div>
          </div>

          {/* ── Lifecycle bar ── */}
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
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#0d1117] transition-all"
                style={{ left: `${cfg.position * 100}%`, backgroundColor: cfg.color }}
              />
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

          {/* ── Sentiment breakdown pills ── */}
          {total > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider">Sentiment Breakdown</div>
              <div className="flex gap-1.5">
                {[
                  { label: "Positive", count: data.positive, color: "#3fb950", bg: "#3fb95018" },
                  { label: "Neutral",  count: data.neutral,  color: "#8b949e", bg: "#8b949e18" },
                  { label: "Negative", count: data.negative, color: "#f85149", bg: "#f8514918" },
                ].map(({ label, count, color, bg }) => (
                  <div
                    key={label}
                    className="flex-1 flex flex-col items-center py-1.5 rounded-lg"
                    style={{ backgroundColor: bg }}
                  >
                    <span className="text-sm font-bold" style={{ color }}>{count}</span>
                    <span className="text-[8px] mt-0.5" style={{ color }}>{label}</span>
                  </div>
                ))}
              </div>
              {/* Stacked proportion bar */}
              <div className="flex h-1 rounded-full overflow-hidden gap-px">
                {data.positive > 0 && (
                  <div className="h-full rounded-l-full" style={{ width: `${(data.positive / total) * 100}%`, backgroundColor: "#3fb950" }} />
                )}
                {data.neutral > 0 && (
                  <div className="h-full" style={{ width: `${(data.neutral / total) * 100}%`, backgroundColor: "#8b949e" }} />
                )}
                {data.negative > 0 && (
                  <div className="h-full rounded-r-full" style={{ width: `${(data.negative / total) * 100}%`, backgroundColor: "#f85149" }} />
                )}
              </div>
            </div>
          )}

          {/* ── Weekly coverage (stacked bars) ── */}
          {data.coverage.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="text-[9px] text-[#484f58] uppercase tracking-wider mb-1.5">Weekly Coverage</div>
              <div className="flex items-end gap-2 flex-1 min-h-0" style={{ maxHeight: 64 }}>
                {data.coverage.map((week) => {
                  const heightPct = maxCount > 0 ? (week.count / maxCount) * 100 : 0;
                  const posW = week.count > 0 ? (week.positive / week.count) * 100 : 0;
                  const neuW = week.count > 0 ? (week.neutral  / week.count) * 100 : 0;
                  const negW = week.count > 0 ? (week.negative / week.count) * 100 : 0;
                  return (
                    <div key={week.label} className="flex flex-col items-center gap-1 flex-1">
                      <div className="text-[9px] font-mono text-[#8b949e]">{week.count || ""}</div>
                      <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: 36 }}>
                        {week.count > 0 ? (
                          <div
                            className="w-full flex flex-col-reverse overflow-hidden rounded-sm"
                            style={{ height: `${heightPct}%`, minHeight: 3 }}
                          >
                            {/* Stacked: positive bottom, neutral mid, negative top */}
                            {negW > 0 && <div style={{ height: `${negW}%`, backgroundColor: "#f85149", opacity: 0.75 }} />}
                            {neuW > 0 && <div style={{ height: `${neuW}%`, backgroundColor: "#484f58", opacity: 0.6 }} />}
                            {posW > 0 && <div style={{ height: `${posW}%`, backgroundColor: "#3fb950", opacity: 0.75 }} />}
                          </div>
                        ) : (
                          <div className="w-full rounded-sm" style={{ height: 2, backgroundColor: "#21262d" }} />
                        )}
                      </div>
                      <div className="text-[8px] text-[#484f58] text-center whitespace-nowrap">{week.label}</div>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-2.5 mt-1.5">
                {[["#3fb950", "Pos"], ["#484f58", "Neu"], ["#f85149", "Neg"]].map(([color, label]) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color, opacity: 0.75 }} />
                    <span className="text-[8px] text-[#484f58]">{label}</span>
                  </div>
                ))}
                <span className="ml-auto text-[8px]" style={{ color: data.sentimentTrend > 0 ? "#3fb950" : data.sentimentTrend < 0 ? "#f85149" : "#8b949e" }}>
                  {data.sentimentTrend > 0 ? "↑ Improving" : data.sentimentTrend < 0 ? "↓ Declining" : "→ Flat"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
