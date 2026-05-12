"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props { ticker: string }

const SIGNAL_CONFIG = {
  "strong-buy":  { label: "Strong Buy",  cls: "text-[#93c5fd] border-[#93c5fd33] bg-[#93c5fd0a]", dot: "#93c5fd" },
  "buy":         { label: "Buy",          cls: "text-[#60a5fa] border-[#60a5fa33] bg-[#60a5fa0a]", dot: "#60a5fa" },
  "neutral":     { label: "Neutral",      cls: "text-[#7c7890] border-[#272738]   bg-transparent",  dot: "#5a5570" },
  "sell":        { label: "Sell",         cls: "text-[#e05252] border-[#e0525233] bg-[#e052520a]", dot: "#e05252" },
  "strong-sell": { label: "Strong Sell",  cls: "text-[#d04444] border-[#d0444444] bg-[#d044440a]", dot: "#d04444" },
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

  const price  = quote?.price;
  const change = quote?.change;
  const pct    = quote?.changePercent;
  const name   = quote?.name ?? ticker;
  const isUp   = (change ?? 0) >= 0;

  const signal = (() => {
    if (!indData?.indicators || !price) return null;
    return computeSignalSummary(indData.indicators, price).overall;
  })();
  const sigCfg = signal ? SIGNAL_CONFIG[signal] : null;

  return (
    <div
      className="relative rounded-lg border border-[#1a1a28] overflow-hidden px-6 py-6"
      style={{
        background: "linear-gradient(135deg, #0d0d15 0%, #09090e 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
      }}
    >

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-[#ede8e0] font-mono">{ticker}</span>
            {sigCfg && (
              <span className={cn("text-[10px] font-semibold px-2.5 py-0.5 rounded-full border tracking-wide", sigCfg.cls)}>
                {sigCfg.label}
              </span>
            )}
          </div>
          {name !== ticker && (
            <p className="text-sm text-[#7c7890]">{name}</p>
          )}
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1.5">
          {price != null ? (
            <>
              <span
                className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight font-mono"
                style={{ color: isUp ? "#60a5fa" : "#e05252" }}
              >
                ${price.toFixed(2)}
              </span>
              <div className={cn("flex items-center gap-1.5 text-sm font-medium", isUp ? "text-[#60a5fa]" : "text-[#e05252]")}>
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="font-mono">{isUp ? "+" : ""}{change?.toFixed(2)}</span>
                <span className="opacity-70 font-mono">({isUp ? "+" : ""}{pct?.toFixed(2)}%)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#3a3748]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] animate-pulse inline-block" />
                Live quote
              </div>
            </>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-10 w-36 rounded-md bg-[#1a1a28]" />
              <div className="h-4 w-24 rounded bg-[#1a1a28]" />
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
          <div className="mt-5 pt-4 border-t border-[#1a1a28] flex items-center gap-4">
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-[#12121c]">
              <div className="h-full flex">
                <div className="bg-[#93c5fd]" style={{ width: `${pctBuy * (s.strongBuys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#60a5fa]" style={{ width: `${pctBuy * (s.buys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#2a2a3e]" style={{ width: `${pctNeu}%` }} />
                <div className="bg-[#e05252]" style={{ width: `${pctSel}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px] shrink-0">
              <span className="text-[#60a5fa] font-medium">{s.strongBuys + s.buys} Buy</span>
              <span className="text-[#3a3748]">{s.neutrals} Neutral</span>
              <span className="text-[#e05252] font-medium">{s.sells + s.strongSells} Sell</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
