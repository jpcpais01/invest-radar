"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props { ticker: string }

const SIGNAL_CONFIG = {
  "strong-buy":  { label: "STRONG BUY",  cls: "text-[#00ff8a] border-[#00ff8a44] bg-[#00ff8a0e]", dot: "#00ff8a" },
  "buy":         { label: "BUY",          cls: "text-[#00e87c] border-[#00e87c44] bg-[#00e87c0e]", dot: "#00e87c" },
  "neutral":     { label: "NEUTRAL",      cls: "text-[#5a9e7a] border-[#5a9e7a44] bg-transparent",  dot: "#5a9e7a" },
  "sell":        { label: "SELL",         cls: "text-[#ff4545] border-[#ff454544] bg-[#ff45450e]", dot: "#ff4545" },
  "strong-sell": { label: "STRONG SELL",  cls: "text-[#ff2020] border-[#ff202055] bg-[#ff20200e]", dot: "#ff2020" },
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
      className="relative rounded border border-[#152b1e] overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a1610 0%, #060d09 100%)",
        boxShadow: isUp
          ? "0 0 40px rgba(0,232,124,0.06), inset 0 1px 0 rgba(0,232,124,0.08)"
          : "0 0 40px rgba(255,69,69,0.06), inset 0 1px 0 rgba(255,69,69,0.08)",
      }}
    >
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-30"
           style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,232,124,0.012) 3px, rgba(0,232,124,0.012) 4px)" }} />

      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00e87c33]" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00e87c33]" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00e87c33]" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00e87c33]" />

      <div className="relative px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {/* Header row */}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] text-[#00e87c] tracking-widest">// MARKET_DATA</span>
            </div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-3xl sm:text-4xl font-black tracking-tight text-[#c8edd8]">{ticker}</span>
              {sigCfg && (
                <span className={cn("font-mono text-[10px] font-bold px-2 py-0.5 rounded border tracking-widest", sigCfg.cls)}>
                  {sigCfg.label}
                </span>
              )}
            </div>
            {name !== ticker && (
              <p className="font-mono text-[11px] text-[#5a9e7a] truncate max-w-xs">{name}</p>
            )}
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1">
            {price != null ? (
              <>
                <span
                  className="font-mono text-4xl sm:text-5xl font-black tabular-nums tracking-tight"
                  style={{
                    color: isUp ? "#00e87c" : "#ff4545",
                    textShadow: isUp
                      ? "0 0 20px rgba(0,232,124,0.4), 0 0 40px rgba(0,232,124,0.15)"
                      : "0 0 20px rgba(255,69,69,0.4), 0 0 40px rgba(255,69,69,0.15)",
                  }}
                >
                  ${price.toFixed(2)}
                </span>
                <div className={cn("flex items-center gap-1.5 font-mono text-sm font-semibold", isUp ? "text-[#00e87c]" : "text-[#ff4545]")}>
                  {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span>{isUp ? "+" : ""}{change?.toFixed(2)}</span>
                  <span className="opacity-75">({isUp ? "+" : ""}{pct?.toFixed(2)}%)</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#2d5040]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e87c] animate-pulse inline-block" />
                  LIVE FEED
                </div>
              </>
            ) : (
              <div className="animate-pulse space-y-2">
                <div className="h-10 w-36 rounded bg-[#152b1e]" />
                <div className="h-4 w-24 rounded bg-[#152b1e]" />
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
            <div className="mt-5 pt-4 border-t border-[#152b1e] flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-sm overflow-hidden flex" style={{ background: "#0f2218" }}>
                <div className="bg-[#00ff8a] transition-all" style={{ width: `${pctBuy * (s.strongBuys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#00e87c] transition-all" style={{ width: `${pctBuy * (s.buys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#2d5040] transition-all" style={{ width: `${pctNeu}%` }} />
                <div className="bg-[#ff4545] transition-all" style={{ width: `${pctSel}%` }} />
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px] shrink-0">
                <span className="text-[#00e87c]">{s.strongBuys + s.buys} BUY</span>
                <span className="text-[#2d5040]">{s.neutrals} NEU</span>
                <span className="text-[#ff4545]">{s.sells + s.strongSells} SELL</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
