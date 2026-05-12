"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props { ticker: string }

const SIGNAL_CONFIG = {
  "strong-buy":  { label: "Strong Buy",  cls: "text-[#3fb950] border-[#3fb95055] bg-[#3fb95015]", dot: "#3fb950" },
  "buy":         { label: "Buy",          cls: "text-[#56d364] border-[#56d36444] bg-[#56d36411]", dot: "#56d364" },
  "neutral":     { label: "Neutral",      cls: "text-[#8b949e] border-[#484f5855] bg-transparent",  dot: "#8b949e" },
  "sell":        { label: "Sell",         cls: "text-[#f85149] border-[#f8514944] bg-[#f8514911]", dot: "#f85149" },
  "strong-sell": { label: "Strong Sell",  cls: "text-[#f85149] border-[#f8514966] bg-[#f8514918]", dot: "#f85149" },
};

export default function PriceHero({ ticker }: Props) {
  const { data: quote } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/quote/${ticker}`); return r.json(); },
    refetchInterval: 30000,
  });

  const { data: indData } = useQuery({
    queryKey: ["history-indicators", ticker, "3M"],
    queryFn: async () => {
      const r = await fetch(`/api/market/history/${ticker}?tf=3M&indicators=true`);
      return r.json() as Promise<{ bars: OHLCVBar[]; indicators: TechnicalIndicators }>;
    },
    staleTime: 60000,
  });

  const price   = quote?.price;
  const change  = quote?.change;
  const pct     = quote?.changePercent;
  const name    = quote?.name ?? ticker;
  const isUp    = (change ?? 0) >= 0;

  const signal = (() => {
    if (!indData?.indicators || !price) return null;
    const s = computeSignalSummary(indData.indicators, price);
    return s.overall;
  })();

  const sigCfg = signal ? SIGNAL_CONFIG[signal] : null;

  const glowColor = isUp ? "radial-gradient(ellipse 60% 40% at 50% 0%, #3fb95010 0%, transparent 70%)"
                         : "radial-gradient(ellipse 60% 40% at 50% 0%, #f8514910 0%, transparent 70%)";

  return (
    <div
      className="relative rounded-2xl border border-[#21262d] bg-[#161b22] overflow-hidden px-6 py-5"
      style={{ background: `linear-gradient(135deg, #161b22 0%, #0d1117 100%)` }}
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: glowColor }} />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {/* Ticker + name */}
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">{ticker}</span>
            {sigCfg && (
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", sigCfg.cls)}>
                {sigCfg.label}
              </span>
            )}
          </div>
          <p className="text-sm text-[#8b949e] font-medium truncate max-w-xs">{name !== ticker ? name : ""}</p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1">
          {/* Price */}
          {price != null ? (
            <>
              <span className="text-4xl sm:text-5xl font-black tabular-nums text-white tracking-tight">
                ${price.toFixed(2)}
              </span>
              <div className={cn("flex items-center gap-1.5 text-base font-semibold", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{isUp ? "+" : ""}{change?.toFixed(2)}</span>
                <span className="text-sm opacity-75">({isUp ? "+" : ""}{pct?.toFixed(2)}%)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#484f58]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse inline-block" />
                Live quote
              </div>
            </>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-10 w-36 rounded-lg bg-[#21262d]" />
              <div className="h-4 w-24 rounded bg-[#21262d]" />
            </div>
          )}
        </div>
      </div>

      {/* Signal strip */}
      {indData?.indicators && price && (() => {
        const s = computeSignalSummary(indData.indicators, price);
        const total = s.strongBuys + s.buys + s.neutrals + s.sells + s.strongSells;
        const pctBuy = total ? ((s.strongBuys + s.buys) / total) * 100 : 0;
        const pctNeu = total ? (s.neutrals / total) * 100 : 0;
        const pctSel = total ? ((s.sells + s.strongSells) / total) * 100 : 0;
        return (
          <div className="relative mt-5 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
              <div className="bg-[#3fb950]" style={{ width: `${pctBuy}%` }} />
              <div className="bg-[#484f58]" style={{ width: `${pctNeu}%` }} />
              <div className="bg-[#f85149]" style={{ width: `${pctSel}%` }} />
            </div>
            <div className="flex items-center gap-3 text-[11px] shrink-0">
              <span className="text-[#3fb950]">{s.strongBuys + s.buys} Buy</span>
              <span className="text-[#484f58]">{s.neutrals} Neutral</span>
              <span className="text-[#f85149]">{s.sells + s.strongSells} Sell</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
