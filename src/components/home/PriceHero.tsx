"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props { ticker: string }

const SIGNAL_CONFIG = {
  "strong-buy":  { label: "Strong Buy",  cls: "text-[#5ecce8] border-[#5ecce833] bg-[#5ecce80a]", dot: "#5ecce8" },
  "buy":         { label: "Buy",          cls: "text-[#38b2cc] border-[#38b2cc33] bg-[#38b2cc0a]", dot: "#38b2cc" },
  "neutral":     { label: "Neutral",      cls: "text-[#8aa4be] border-[#2a3858]   bg-transparent",  dot: "#5a5570" },
  "sell":        { label: "Sell",         cls: "text-[#cc6464] border-[#cc646433] bg-[#cc64640a]", dot: "#cc6464" },
  "strong-sell": { label: "Strong Sell",  cls: "text-[#b05050] border-[#b0505044] bg-[#b050500a]", dot: "#b05050" },
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
      className="relative rounded-lg border border-[#1a2540] overflow-hidden px-6 py-6"
      style={{
        background: "linear-gradient(135deg, #0a1020 0%, #060a12 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
      }}
    >

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-[#edf2f8] font-mono">{ticker}</span>
            {sigCfg && (
              <span className={cn("text-[10px] font-semibold px-2.5 py-0.5 rounded-full border tracking-wide", sigCfg.cls)}>
                {sigCfg.label}
              </span>
            )}
          </div>
          {name !== ticker && (
            <p className="text-sm text-[#8aa4be]">{name}</p>
          )}
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1.5">
          {price != null ? (
            <>
              <span
                className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight font-mono"
                style={{ color: isUp ? "#38b2cc" : "#cc6464" }}
              >
                ${price.toFixed(2)}
              </span>
              <div className={cn("flex items-center gap-1.5 text-sm font-medium", isUp ? "text-[#38b2cc]" : "text-[#cc6464]")}>
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="font-mono">{isUp ? "+" : ""}{change?.toFixed(2)}</span>
                <span className="opacity-70 font-mono">({isUp ? "+" : ""}{pct?.toFixed(2)}%)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#4a6280]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#38b2cc] animate-pulse inline-block" />
                Live quote
              </div>
            </>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-10 w-36 rounded-md bg-[#1a2540]" />
              <div className="h-4 w-24 rounded bg-[#1a2540]" />
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
          <div className="mt-5 pt-4 border-t border-[#1a2540] flex items-center gap-4">
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-[#0e1628]">
              <div className="h-full flex">
                <div className="bg-[#5ecce8]" style={{ width: `${pctBuy * (s.strongBuys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#38b2cc]" style={{ width: `${pctBuy * (s.buys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#1a2e48]" style={{ width: `${pctNeu}%` }} />
                <div className="bg-[#cc6464]" style={{ width: `${pctSel}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px] shrink-0">
              <span className="text-[#38b2cc] font-medium">{s.strongBuys + s.buys} Buy</span>
              <span className="text-[#4a6280]">{s.neutrals} Neutral</span>
              <span className="text-[#cc6464] font-medium">{s.sells + s.strongSells} Sell</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
