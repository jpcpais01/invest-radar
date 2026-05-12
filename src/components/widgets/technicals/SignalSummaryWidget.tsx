"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary, SignalValue } from "@/lib/market/indicators";
import { cn } from "@/lib/utils";

interface Props { ticker: string; id: string }

const SIGNAL_STYLE: Record<SignalValue, { text: string; bg: string; border: string; label: string }> = {
  "strong-buy":  { text: "text-[#3fb950]", bg: "bg-[#3fb95020]", border: "border-[#3fb95050]", label: "STRONG BUY"  },
  "buy":         { text: "text-[#56d364]", bg: "bg-[#56d36415]", border: "border-[#56d36430]", label: "BUY"         },
  "neutral":     { text: "text-[#8b949e]", bg: "bg-transparent", border: "border-[#21262d]",   label: "NEUTRAL"     },
  "sell":        { text: "text-[#ff7b72]", bg: "bg-[#ff7b7215]", border: "border-[#ff7b7230]", label: "SELL"        },
  "strong-sell": { text: "text-[#f85149]", bg: "bg-[#f8514920]", border: "border-[#f8514950]", label: "STRONG SELL" },
};

const BAR_COLOR: Record<SignalValue, string> = {
  "strong-buy":  "bg-[#3fb950]",
  "buy":         "bg-[#56d364]",
  "neutral":     "bg-[#484f58]",
  "sell":        "bg-[#ff7b72]",
  "strong-sell": "bg-[#f85149]",
};

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
  const totalSignals = summary
    ? summary.strongBuys + summary.buys + summary.neutrals + summary.sells + summary.strongSells
    : 0;

  const pct = (n: number) => totalSignals ? (n / totalSignals) * 100 : 0;
  const c = SIGNAL_STYLE[overall];

  const askAI = summary
    ? `Signal Summary for ${ticker} over ${tf}: Overall ${overall.toUpperCase()} — ${summary.strongBuys} strong buy, ${summary.buys} buy, ${summary.sells} sell, ${summary.strongSells} strong sell, ${summary.neutrals} neutral. Indicators: ${summary.signals.map((s) => `${s.name}: ${s.signal} (${s.value})`).join(", ")}.`
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
                  {c.label}
                </div>
              </div>
              <div className="flex gap-2.5 text-center">
                <div>
                  <div className="text-sm font-bold text-[#3fb950]">{summary.strongBuys + summary.buys}</div>
                  <div className="text-[9px] text-[#484f58] uppercase">Buy</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#f85149]">{summary.sells + summary.strongSells}</div>
                  <div className="text-[9px] text-[#484f58] uppercase">Sell</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#8b949e]">{summary.neutrals}</div>
                  <div className="text-[9px] text-[#484f58] uppercase">Neutral</div>
                </div>
              </div>
            </div>

            {/* 5-segment bar */}
            <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
              <div className={cn(BAR_COLOR["strong-buy"],  "rounded-l-full transition-all")} style={{ width: `${pct(summary.strongBuys)}%` }} />
              <div className={cn(BAR_COLOR["buy"],          "transition-all")}               style={{ width: `${pct(summary.buys)}%` }} />
              <div className={cn(BAR_COLOR["neutral"],      "transition-all")}               style={{ width: `${pct(summary.neutrals)}%` }} />
              <div className={cn(BAR_COLOR["sell"],         "transition-all")}               style={{ width: `${pct(summary.sells)}%` }} />
              <div className={cn(BAR_COLOR["strong-sell"],  "rounded-r-full transition-all")} style={{ width: `${pct(summary.strongSells)}%` }} />
            </div>

            {/* Individual signals */}
            <div className="flex flex-col gap-1.5">
              {summary.signals.map((s) => {
                const sc = SIGNAL_STYLE[s.signal];
                return (
                  <div
                    key={s.name}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#21262d]"
                  >
                    <span className="text-[11px] font-medium text-[#8b949e]">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#484f58] font-mono">{s.value}</span>
                      <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide", sc.text, sc.bg, sc.border)}>
                        {sc.label}
                      </span>
                    </div>
                  </div>
                );
              })}
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
