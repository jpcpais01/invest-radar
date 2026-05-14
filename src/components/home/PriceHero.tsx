"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";
import { computeSignalSummary } from "@/lib/market/indicators";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props { ticker: string }

const SIGNAL_CONFIG = {
  "strong-buy":  { label: "Strong Buy",  cls: "text-[#d8d8e4] border-[#d8d8e433] bg-[#d8d8e40a]", dot: "#d8d8e4" },
  "buy":         { label: "Buy",          cls: "text-[#c0c0cc] border-[#c0c0cc33] bg-[#c0c0cc0a]", dot: "#c0c0cc" },
  "neutral":     { label: "Neutral",      cls: "text-[#767676] border-[#2c2c2c]   bg-transparent",  dot: "#5a5570" },
  "sell":        { label: "Sell",         cls: "text-[#ef4444] border-[#ef444433] bg-[#ef44440a]", dot: "#ef4444" },
  "strong-sell": { label: "Strong Sell",  cls: "text-[#dc2626] border-[#dc262644] bg-[#dc26260a]", dot: "#dc2626" },
};

// ── Background sparkline ────────────────────────────────────────────────────
function SparklineBg({ bars, isUp, id }: { bars: OHLCVBar[]; isUp: boolean; id: string }) {
  if (bars.length < 2) return null;

  const closes = bars.map(b => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const W = 1000;
  const H = 280;
  // Keep the line in the lower 55% of the card so it breathes under the text
  const yTop = H * 0.30;
  const yBot = H * 0.92;

  const pts = closes.map((c, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: yTop + (1 - (c - min) / range) * (yBot - yTop),
  }));

  // Smooth polyline via cubic bezier control points
  const linePath = pts.reduce((acc, { x, y }, i) => {
    if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cx = (prev.x + x) / 2;
    return `${acc} C ${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, "");

  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  const color = isUp ? "#c0c0cc" : "#ef4444";
  const fillId  = `sf-fill-${id}`;
  const maskId  = `sf-mask-${id}`;
  const edgeId  = `sf-edge-${id}`;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        {/* Vertical fill gradient */}
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.13" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
        {/* Horizontal edge-fade gradient for mask */}
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#fff" stopOpacity="0"   />
          <stop offset="18%"  stopColor="#fff" stopOpacity="1"   />
          <stop offset="82%"  stopColor="#fff" stopOpacity="1"   />
          <stop offset="100%" stopColor="#fff" stopOpacity="0"   />
        </linearGradient>
        <mask id={maskId}>
          <rect width={W} height={H} fill={`url(#${edgeId})`} />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        {/* Area fill */}
        <path d={areaPath} fill={`url(#${fillId})`} />
        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeOpacity="0.30"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Subtle glow duplicate at lower opacity */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeOpacity="0.06"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

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
      className="relative rounded-lg border border-[#1e1e1e] overflow-hidden px-6 py-6"
      style={{
        background: "linear-gradient(135deg, #101010 0%, #080808 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
      }}
    >
      {/* ── Background sparkline ─────────────────────────────────────────── */}
      {indData?.bars && (
        <SparklineBg bars={indData.bars} isUp={isUp} id={ticker} />
      )}

      {/* ── Foreground content ───────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-[#f0f0f0] font-mono">{ticker}</span>
            {sigCfg && (
              <span className={cn("text-[10px] font-semibold px-2.5 py-0.5 rounded-full border tracking-wide", sigCfg.cls)}>
                {sigCfg.label}
              </span>
            )}
          </div>
          {name !== ticker && (
            <p className="text-sm text-[#767676]">{name}</p>
          )}
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1.5">
          {price != null ? (
            <>
              <span
                className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight font-mono"
                style={{ color: isUp ? "#c0c0cc" : "#ef4444" }}
              >
                ${price.toFixed(2)}
              </span>
              <div className={cn("flex items-center gap-1.5 text-sm font-medium", isUp ? "text-[#c0c0cc]" : "text-[#ef4444]")}>
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="font-mono">{isUp ? "+" : ""}{change?.toFixed(2)}</span>
                <span className="opacity-70 font-mono">({isUp ? "+" : ""}{pct?.toFixed(2)}%)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#3a3a3a]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c0c0cc] animate-pulse inline-block" />
                Live quote
              </div>
            </>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-10 w-36 rounded-md bg-[#1e1e1e]" />
              <div className="h-4 w-24 rounded bg-[#1e1e1e]" />
            </div>
          )}
        </div>
      </div>

      {/* ── Signal strip ─────────────────────────────────────────────────── */}
      {indData?.indicators && price && (() => {
        const s = computeSignalSummary(indData.indicators, price);
        const total = s.strongBuys + s.buys + s.neutrals + s.sells + s.strongSells;
        const pctBuy = total ? ((s.strongBuys + s.buys) / total) * 100 : 0;
        const pctNeu = total ? (s.neutrals / total) * 100 : 0;
        const pctSel = total ? ((s.sells + s.strongSells) / total) * 100 : 0;
        return (
          <div className="relative z-10 mt-5 pt-4 border-t border-[#1e1e1e] flex items-center gap-4">
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-[#161616]">
              <div className="h-full flex">
                <div className="bg-[#d8d8e4]" style={{ width: `${pctBuy * (s.strongBuys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#c0c0cc]" style={{ width: `${pctBuy * (s.buys / (s.strongBuys + s.buys || 1))}%` }} />
                <div className="bg-[#252525]" style={{ width: `${pctNeu}%` }} />
                <div className="bg-[#ef4444]" style={{ width: `${pctSel}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px] shrink-0">
              <span className="text-[#c0c0cc] font-medium">{s.strongBuys + s.buys} Buy</span>
              <span className="text-[#3a3a3a]">{s.neutrals} Neutral</span>
              <span className="text-[#ef4444] font-medium">{s.sells + s.strongSells} Sell</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
