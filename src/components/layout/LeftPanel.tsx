"use client";
import { X, Plus, LayoutGrid, Layers, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTickerStore } from "@/store/tickerStore";
import { useLayoutStore, PRESET_LAYOUTS } from "@/store/layoutStore";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PresetLayout } from "@/types/widgets";

const PRESETS: { id: PresetLayout; label: string; desc: string }[] = [
  { id: "overview",  label: "Overview",   desc: "Price + sentiment" },
  { id: "options",   label: "Options",    desc: "Chain + greeks" },
  { id: "technical", label: "Technical",  desc: "Full indicator set" },
];

function WatchlistItem({ ticker, isActive, onSelect, onRemove }: {
  ticker: string;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
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

  const pct = data?.changePercent;
  const price = data?.price;
  const isUp = (data?.change ?? 0) >= 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer group transition-colors",
        isActive
          ? "bg-[#1f6feb15] border border-[#1f6feb33] text-white"
          : "text-[#8b949e] hover:text-white hover:bg-[#161b22] border border-transparent"
      )}
      onClick={onSelect}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold leading-tight">{ticker}</span>
        {price != null && (
          <span className="text-[10px] text-[#8b949e] font-mono leading-tight">${price.toFixed(2)}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {pct != null && (
          <span className={cn("text-[10px] font-medium tabular-nums", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
            {isUp ? "+" : ""}{pct.toFixed(1)}%
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 text-[#8b949e] hover:text-[#f85149] transition-all shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export default function LeftPanel() {
  const { watchlist, activeTicker, setActiveTicker, addToWatchlist, removeFromWatchlist } =
    useTickerStore();
  const {
    applyPreset, activePreset,
    customLayouts, activeCustomId,
    addCustomLayout, applyCustomLayout, removeCustomLayout,
  } = useLayoutStore();
  const router = useRouter();
  void PRESET_LAYOUTS;

  const handleSelect = (t: string) => {
    setActiveTicker(t);
    router.push(`/${t}`);
  };

  const handleAdd = () => {
    const ticker = prompt("Add ticker:")?.toUpperCase();
    if (ticker) addToWatchlist(ticker);
  };

  const handleAddLayout = () => {
    const name = prompt("Layout name:")?.trim();
    if (name) addCustomLayout(name);
  };

  return (
    <div className="w-[200px] shrink-0 flex flex-col border-r border-[#21262d] bg-[#0d1117] overflow-y-auto">
      {/* Layouts */}
      <div className="p-3 border-b border-[#21262d]">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#484f58] uppercase tracking-widest mb-2">
          <LayoutGrid className="w-3 h-3" />
          Layouts
        </div>
        <div className="flex flex-col gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={cn(
                "text-left px-2 py-1.5 rounded-lg text-xs transition-colors",
                activePreset === p.id
                  ? "bg-[#1f6feb15] text-[#388bfd] border border-[#1f6feb33]"
                  : "text-[#8b949e] hover:text-white hover:bg-[#161b22] border border-transparent"
              )}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Layouts */}
      <div className="p-3 border-b border-[#21262d]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">
            <Layers className="w-3 h-3" />
            Custom
          </div>
          <button
            onClick={handleAddLayout}
            title="Add layout"
            className="text-[#484f58] hover:text-[#388bfd] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {customLayouts.length === 0 ? (
          <p className="text-[10px] text-[#30363d] leading-relaxed px-1">
            No custom layouts yet. Click + to create one.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {customLayouts.map((cl) => (
              <div
                key={cl.id}
                className={cn(
                  "flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer group transition-colors",
                  activeCustomId === cl.id
                    ? "bg-[#1f6feb15] border border-[#1f6feb33] text-[#388bfd]"
                    : "text-[#8b949e] hover:text-white hover:bg-[#161b22] border border-transparent"
                )}
                onClick={() => applyCustomLayout(cl.id)}
              >
                <span className="text-xs font-medium truncate">{cl.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeCustomLayout(cl.id); }}
                  className="opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-[#f85149] transition-all shrink-0 ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Watchlist */}
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">
            Watchlist
          </span>
          <button
            onClick={handleAdd}
            title="Add ticker"
            className="text-[#484f58] hover:text-[#388bfd] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {watchlist.map((t) => (
            <WatchlistItem
              key={t}
              ticker={t}
              isActive={t === activeTicker}
              onSelect={() => handleSelect(t)}
              onRemove={() => removeFromWatchlist(t)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
