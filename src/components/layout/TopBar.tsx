"use client";
import { useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import { useTickerStore } from "@/store/tickerStore";
import { useRouter } from "next/navigation";
import CommandPalette from "@/components/search/CommandPalette";
import { cn } from "@/lib/utils";

export default function TopBar() {
  const { activeTicker, watchlist, setActiveTicker } = useTickerStore();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleTickerSelect = (ticker: string) => {
    setActiveTicker(ticker);
    router.push(`/${ticker}`);
  };

  return (
    <>
      <div className="flex items-center h-11 px-4 gap-4 border-b border-[#30363d] bg-[#161b22] shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <TrendingUp className="w-5 h-5 text-[#1f6feb]" />
          <span className="font-bold text-sm tracking-wide text-white">InvestRadar</span>
        </div>

        {/* Search button */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#0d1117] border border-[#30363d] text-[#8b949e] text-xs hover:border-[#484f58] transition-colors w-48"
        >
          <Search className="w-3 h-3" />
          <span>Search ticker...</span>
          <span className="ml-auto text-[10px] opacity-60">⌘K</span>
        </button>

        {/* Watchlist tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {watchlist.map((t) => (
            <button
              key={t}
              onClick={() => handleTickerSelect(t)}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors",
                t === activeTicker
                  ? "bg-[#1f6feb22] text-[#388bfd] border border-[#1f6feb]"
                  : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
              )}
            >
              {t}
            </button>
          ))}
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
