"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar } from "@/types/market";
import { TrendingUp, TrendingDown, Star } from "lucide-react";
import { useTickerStore } from "@/store/tickerStore";

interface Props { ticker: string }

function SparklineBg({ bars, isUp, id }: { bars: OHLCVBar[]; isUp: boolean; id: string }) {
  if (bars.length < 2) return null;
  const closes = bars.map(b => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 1000, H = 280;
  const yTop = H * 0.30, yBot = H * 0.92;
  const pts = closes.map((c, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: yTop + (1 - (c - min) / range) * (yBot - yTop),
  }));
  const linePath = pts.reduce((acc, { x, y }, i) => {
    if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cx = (prev.x + x) / 2;
    return `${acc} C ${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, "");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const color = isUp ? "#4ade80" : "#ef4444";
  const fillId = `sf-fill-${id}`, maskId = `sf-mask-${id}`, edgeId = `sf-edge-${id}`;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none select-none" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.10" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#fff" stopOpacity="0" />
          <stop offset="15%"  stopColor="#fff" stopOpacity="1" />
          <stop offset="85%"  stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={maskId}>
          <rect width={W} height={H} fill={`url(#${edgeId})`} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path d={areaPath} fill={`url(#${fillId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="5" strokeOpacity="0.05" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function PriceHero({ ticker }: Props) {
  const { watchlist, addToWatchlist, removeFromWatchlist } = useTickerStore();
  const isWatchlisted = watchlist.includes(ticker);

  const { data: quote } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: async () => { const r = await fetch(`/api/market/quote/${ticker}`); return r.json(); },
    refetchInterval: 30000,
  });

  const { data: histData } = useQuery<{ bars: OHLCVBar[] }>({
    queryKey: ["history-bars", ticker, "3M"],
    queryFn: async () => {
      const r = await fetch(`/api/market/history/${ticker}?tf=3M`);
      return r.json();
    },
    staleTime: 60000,
  });

  const price  = quote?.price  as number | undefined;
  const change = quote?.change as number | undefined;
  const pct    = quote?.changePercent as number | undefined;
  const name   = (quote?.name ?? ticker) as string;
  const isUp   = (change ?? 0) >= 0;

  return (
    <div
      className="relative rounded-xl border border-[#1e1e1e] overflow-hidden px-6 py-5"
      style={{
        background: "linear-gradient(135deg, #0e0e0e 0%, #080808 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
      }}
    >
      {/* Background sparkline */}
      {histData?.bars && <SparklineBg bars={histData.bars} isUp={isUp} id={ticker} />}

      {/* Content */}
      <div className="relative z-10">

        {/* Row 1: ticker · price · star */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-3xl sm:text-4xl font-bold tracking-tight text-[#f0f0f0] font-mono leading-none">
            {ticker}
          </span>

          {price != null ? (
            <span
              className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight font-mono leading-none"
              style={{ color: isUp ? "#4ade80" : "#ef4444" }}
            >
              ${price.toFixed(2)}
            </span>
          ) : (
            <div className="h-8 w-28 rounded-lg bg-[#1e1e1e] animate-pulse" />
          )}

          {/* Watchlist star */}
          <button
            onClick={() => isWatchlisted ? removeFromWatchlist(ticker) : addToWatchlist(ticker)}
            className={cn(
              "w-7 h-7 rounded-md border flex items-center justify-center transition-all",
              isWatchlisted
                ? "text-[#c0c0cc] bg-[#c0c0cc15] border-[#c0c0cc33] hover:bg-[#c0c0cc22]"
                : "text-[#3a3a3a] bg-transparent border-[#1e1e1e] hover:text-[#767676] hover:border-[#2c2c2c]"
            )}
            title={isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
          >
            <Star className={cn("w-3.5 h-3.5", isWatchlisted && "fill-current")} />
          </button>
        </div>

        {/* Row 2: company name */}
        {name !== ticker && (
          <p className="text-sm text-[#4a4a4a] mt-1.5 leading-none">{name}</p>
        )}

        {/* Row 3: change + live dot */}
        <div className="mt-2.5 flex items-center gap-2">
          {price != null && change != null && pct != null ? (
            <>
              <div className={cn("flex items-center gap-1 text-sm font-medium", isUp ? "text-[#4ade80]" : "text-[#ef4444]")}>
                {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span className="font-mono tabular-nums">{isUp ? "+" : ""}{change.toFixed(2)}</span>
                <span className="font-mono tabular-nums opacity-60">({isUp ? "+" : ""}{pct.toFixed(2)}%)</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#3a3a3a]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c0c0cc] animate-pulse inline-block" />
                Live
              </div>
            </>
          ) : (
            <div className="h-4 w-32 rounded bg-[#1e1e1e] animate-pulse" />
          )}
        </div>

      </div>
    </div>
  );
}
