"use client";
import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTickerStore } from "@/store/tickerStore";
import { cn } from "@/lib/utils";

function WatchlistChip({
  ticker,
  isActive,
  onClick,
}: {
  ticker: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/quote/${ticker}`);
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const price = data?.price as number | undefined;
  const pct = data?.changePercent as number | undefined;
  const isUp = (pct ?? 0) >= 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 h-9 rounded-md whitespace-nowrap transition-all shrink-0",
        isActive
          ? "bg-[#c0c0cc15] border border-[#c0c0cc28] text-[#c0c0cc]"
          : "border border-transparent text-[#767676] hover:text-[#f0f0f0] hover:bg-[#101010]"
      )}
    >
      <span className="text-xs font-semibold font-mono">{ticker}</span>
      {price != null ? (
        <>
          <span className="text-xs text-[#f0f0f0]">${price.toFixed(2)}</span>
          <span className={cn("text-xs font-medium tabular-nums", isUp ? "text-[#4ade80]" : "text-[#ef4444]")}>
            {isUp ? "+" : ""}{pct?.toFixed(2)}%
          </span>
        </>
      ) : (
        <span className="w-16 h-3 rounded bg-[#1e1e1e] animate-pulse" />
      )}
    </button>
  );
}

export default function HomeWatchlistBar({
  onSelectTicker,
}: {
  onSelectTicker: (ticker: string) => void;
}) {
  const { activeTicker, watchlist, reorderWatchlist } = useTickerStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY || e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (!watchlist.length) return null;

  return (
    <div className="border-b border-[#1e1e1e] shrink-0" style={{ background: "#080808" }}>
      <div
        ref={scrollRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-0.5 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {watchlist.map((ticker, idx) => (
          <div
            key={ticker}
            draggable
            onDragStart={(e) => {
              dragIndexRef.current = idx;
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(idx); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndexRef.current !== null && dragIndexRef.current !== idx) {
                reorderWatchlist(dragIndexRef.current, idx);
              }
              dragIndexRef.current = null;
              setDragOver(null);
            }}
            onDragEnd={() => { dragIndexRef.current = null; setDragOver(null); }}
            className={cn(
              "rounded-md transition-all",
              dragOver === idx && dragIndexRef.current !== idx && "ring-1 ring-[#c0c0cc33] ring-inset"
            )}
          >
            <WatchlistChip
              ticker={ticker}
              isActive={ticker === activeTicker}
              onClick={() => onSelectTicker(ticker)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
