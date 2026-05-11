"use client";
import { useState } from "react";
import { Search, TrendingUp, Radar, LayoutDashboard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTickerStore } from "@/store/tickerStore";
import { useRouter, usePathname } from "next/navigation";
import CommandPalette from "@/components/search/CommandPalette";
import { cn } from "@/lib/utils";

export default function TopBar() {
  const { activeTicker, watchlist, setActiveTicker, reorderWatchlist } = useTickerStore();
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const watchlistRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    const el = watchlistRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY || e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const { data: quote } = useQuery({
    queryKey: ["quote", activeTicker],
    queryFn: async () => {
      const res = await fetch(`/api/market/quote/${activeTicker}`);
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: watchlistNames } = useQuery<Record<string, string>>({
    queryKey: ["ticker-names", watchlist.join(",")],
    queryFn: async () => {
      if (!watchlist.length) return {};
      const res = await fetch(`/api/market/names?tickers=${watchlist.join(",")}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    enabled: watchlist.length > 0,
  });

  const handleTickerSelect = (ticker: string) => {
    setActiveTicker(ticker);
    router.push(`/${ticker}`);
  };

  const price = quote?.price;
  const change = quote?.change;
  const pct = quote?.changePercent;
  const isUp = (change ?? 0) >= 0;

  return (
    <>
      <div className="flex items-center h-12 px-4 gap-4 border-b border-[#21262d] bg-[#0d1117] shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-1 shrink-0">
          <TrendingUp className="w-4 h-4 text-[#388bfd]" />
          <span className="font-semibold text-sm tracking-tight text-white">InvestRadar</span>
        </div>

        {/* Desk link */}
        <button
          onClick={() => router.push(`/${activeTicker}`)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
            pathname !== "/discover"
              ? "bg-[#1f6feb22] text-[#388bfd] border border-[#1f6feb44]"
              : "text-[#8b949e] hover:text-white hover:bg-[#161b22] border border-transparent"
          )}
        >
          <LayoutDashboard className="w-3 h-3" />
          Desk
        </button>

        {/* Discover link */}
        <button
          onClick={() => router.push("/discover")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
            pathname === "/discover"
              ? "bg-[#1f6feb22] text-[#388bfd] border border-[#1f6feb44]"
              : "text-[#8b949e] hover:text-white hover:bg-[#161b22] border border-transparent"
          )}
        >
          <Radar className="w-3 h-3" />
          Discover
        </button>

        {/* Search */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] text-xs hover:border-[#484f58] hover:text-white transition-colors w-44 shrink-0"
        >
          <Search className="w-3 h-3 shrink-0" />
          <span>Search ticker…</span>
          <kbd className="ml-auto text-[10px] opacity-50 font-mono">⌘K</kbd>
        </button>

        {/* Active ticker price badge */}
        {price != null && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#161b22] border border-[#30363d] shrink-0">
            <span className="text-xs font-semibold text-white">{activeTicker}</span>
            <span className="text-sm font-bold text-white">${price.toFixed(2)}</span>
            <span className={cn("text-xs font-medium", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
              {isUp ? "+" : ""}{change?.toFixed(2)} ({isUp ? "+" : ""}{pct?.toFixed(2)}%)
            </span>
          </div>
        )}

        {/* Watchlist tabs */}
        <div ref={watchlistRef} className="flex items-center gap-1 overflow-x-auto ml-2 scrollbar-none">
          {watchlist.map((t, idx) => {
            const name = watchlistNames?.[t];
            return (
              <button
                key={t}
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
                onClick={() => handleTickerSelect(t)}
                className={cn(
                  "flex flex-col items-start px-2.5 py-1 rounded-md whitespace-nowrap transition-all cursor-pointer select-none",
                  t === activeTicker
                    ? "bg-[#1f6feb22] text-[#388bfd] border border-[#1f6feb44]"
                    : "text-[#8b949e] hover:text-white hover:bg-[#161b22] border border-transparent",
                  dragOver === idx && dragIndexRef.current !== idx && "ring-1 ring-[#388bfd] ring-inset"
                )}
              >
                <span className="text-xs font-medium leading-tight">{t}</span>
                {name && (
                  <span className="text-[9px] leading-tight opacity-60 max-w-[80px] truncate">
                    {name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={handleTickerSelect}
      />
    </>
  );
}
