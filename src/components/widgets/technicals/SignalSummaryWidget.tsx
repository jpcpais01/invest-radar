"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary } from "@/lib/market/indicators";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

export default function SignalSummaryWidget({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();
  const { activeTimeframe: tf } = useTickerStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["history-indicators", ticker, tf],
    queryFn: async () => {
      const res = await fetch(`/api/market/history/${ticker}?tf=${tf}&indicators=true`);
      return res.json() as Promise<{ bars: OHLCVBar[]; indicators: TechnicalIndicators }>;
    },
  });

  const { data: quote } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/quote/${ticker}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const summary =
    data?.indicators && quote?.price
      ? computeSignalSummary(data.indicators, quote.price)
      : null;

  const overall = summary?.overall ?? "neutral";
  const totalSignals = summary ? summary.buys + summary.sells + summary.neutrals : 0;
  const buyPct = totalSignals ? (summary!.buys / totalSignals) * 100 : 0;
  const sellPct = totalSignals ? (summary!.sells / totalSignals) * 100 : 0;
  const neutralPct = totalSignals ? (summary!.neutrals / totalSignals) * 100 : 0;

  const overallColors = {
    buy:     { text: "text-[#3fb950]", bg: "bg-[#3fb95022]", border: "border-[#3fb95044]", bar: "bg-[#3fb950]" },
    sell:    { text: "text-[#f85149]", bg: "bg-[#f8514922]", border: "border-[#f8514944]", bar: "bg-[#f85149]" },
    neutral: { text: "text-[#8b949e]", bg: "bg-[#8b949e11]", border: "border-[#30363d]",   bar: "bg-[#8b949e]" },
  };
  const c = overallColors[overall];

  const signalColors = {
    buy:     "text-[#3fb950] bg-[#3fb95015] border-[#3fb95033]",
    sell:    "text-[#f85149] bg-[#f8514915] border-[#f8514933]",
    neutral: "text-[#8b949e] bg-transparent border-[#21262d]",
  };

  const askAI = summary
    ? `Signal Summary for ${ticker} over ${tf}: Overall ${overall.toUpperCase()} — ${summary.buys} buy, ${summary.sells} sell, ${summary.neutrals} neutral signals. Indicators: ${summary.signals.map((s) => `${s.name}: ${s.signal} (${s.value})`).join(", ")}.`
    : `Signal Summary for ${ticker}`;

  return (
    <WidgetShell
      title="Signal Summary"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load signals" : null}
      askAIContext={askAI}
    >
      <div className="flex flex-col h-full overflow-y-auto px-3 py-2 gap-3">
        {summary ? (
          <>
            {/* Overall verdict */}
            <div className={cn("flex items-center justify-between px-3 py-2 rounded-xl border", c.bg, c.border)}>
              <div>
                <div className="text-[10px] text-[#484f58] uppercase tracking-widest font-medium">Overall Signal</div>
                <div className={cn("text-xl font-bold mt-0.5 tracking-wide", c.text)}>
                  {overall.toUpperCase()}
                </div>
              </div>
              <div className="flex gap-3 text-center">
                <div>
                  <div className="text-sm font-bold text-[#3fb950]">{summary.buys}</div>
                  <div className="text-[9px] text-[#484f58] uppercase">Buy</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#f85149]">{summary.sells}</div>
                  <div className="text-[9px] text-[#484f58] uppercase">Sell</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#8b949e]">{summary.neutrals}</div>
                  <div className="text-[9px] text-[#484f58] uppercase">Neutral</div>
                </div>
              </div>
            </div>

            {/* Buy/sell/neutral bar */}
            <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
              <div className="bg-[#3fb950] rounded-l-full transition-all" style={{ width: `${buyPct}%` }} />
              <div className="bg-[#8b949e] transition-all" style={{ width: `${neutralPct}%` }} />
              <div className="bg-[#f85149] rounded-r-full transition-all" style={{ width: `${sellPct}%` }} />
            </div>

            {/* Individual signals */}
            <div className="flex flex-col gap-1.5">
              {summary.signals.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#21262d]"
                >
                  <span className="text-[11px] font-medium text-[#8b949e]">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#484f58] font-mono">{s.value}</span>
                    <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide", signalColors[s.signal])}>
                      {s.signal}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : !isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-[#484f58]">No signal data available</p>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
