"use client";
import { X, Plus, LayoutGrid } from "lucide-react";
import { useTickerStore } from "@/store/tickerStore";
import { useLayoutStore, PRESET_LAYOUTS } from "@/store/layoutStore";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PresetLayout } from "@/types/widgets";

const PRESETS: { id: PresetLayout; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "options", label: "Options" },
  { id: "technical", label: "Technical" },
];

export default function LeftPanel() {
  const { watchlist, activeTicker, setActiveTicker, addToWatchlist, removeFromWatchlist } =
    useTickerStore();
  const { applyPreset, activePreset } = useLayoutStore();
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

  return (
    <div className="w-[200px] shrink-0 flex flex-col border-r border-[#30363d] bg-[#161b22] overflow-y-auto">
      {/* Layouts */}
      <div className="p-3 border-b border-[#30363d]">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
          <LayoutGrid className="w-3 h-3" />
          Layouts
        </div>
        <div className="flex flex-col gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={cn(
                "text-left px-2 py-1 rounded text-xs transition-colors",
                activePreset === p.id
                  ? "bg-[#1f6feb22] text-[#388bfd]"
                  : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Watchlist */}
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
            Watchlist
          </span>
          <button
            onClick={handleAdd}
            className="text-[#8b949e] hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {watchlist.map((t) => (
            <div
              key={t}
              className={cn(
                "flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group transition-colors",
                t === activeTicker
                  ? "bg-[#1f6feb22] text-white"
                  : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
              )}
              onClick={() => handleSelect(t)}
            >
              <span className="text-xs font-medium">{t}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromWatchlist(t);
                }}
                className="opacity-0 group-hover:opacity-100 text-[#8b949e] hover:text-[#f85149] transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
