"use client";
import { useState } from "react";
import { useTickerStore } from "@/store/tickerStore";
import { cn } from "@/lib/utils";
import { Search, Terminal, Compass, X } from "lucide-react";
import PriceHero from "./PriceHero";
import AIPredPanel from "./AIPredPanel";
import TechnicalsStrip from "./TechnicalsStrip";
import { SignalCard, QualityCard, NarrativeCard, ValuationCard, InsiderCard } from "./InsightCards";
import NewsPanel from "./NewsPanel";
import HomeDiscover from "./HomeDiscover";
import HomeChat from "./HomeChat";

const POPULAR = ["AAPL","NVDA","MSFT","TSLA","AMZN","META","GOOGL","AMD","NFLX","JPM","SPY","QQQ"];

type Tab = "overview" | "discover";

export default function HomePage() {
  const { activeTicker, setActiveTicker, watchlist } = useTickerStore();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const suggestions = query.length > 0
    ? [...new Set([...watchlist, ...POPULAR])].filter(t => t.startsWith(query.toUpperCase())).slice(0, 8)
    : [...new Set([...watchlist, ...POPULAR])].slice(0, 8);

  const selectTicker = (t: string) => {
    setActiveTicker(t.toUpperCase());
    setSearchOpen(false);
    setQuery("");
    setActiveTab("overview");
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) selectTicker(query.trim());
    if (e.key === "Escape") { setSearchOpen(false); setQuery(""); }
  };

  return (
    <div
      className="h-screen overflow-y-auto text-[#c8edd8]"
      style={{
        background: "#060d09",
        backgroundImage: "radial-gradient(rgba(0,232,124,0.055) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        scrollbarWidth: "thin",
        scrollbarColor: "#152b1e transparent",
      }}
    >
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[#152b1e] backdrop-blur-md" style={{ background: "rgba(6,13,9,0.92)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2 shrink-0 group">
            <div className="w-7 h-7 rounded border border-[#00e87c44] bg-[#00e87c12] flex items-center justify-center group-hover:border-[#00e87c88] transition-colors">
              <span className="font-mono text-[10px] font-bold text-[#00e87c]">&gt;_</span>
            </div>
            <span className="font-mono font-bold text-sm text-[#c8edd8] hidden sm:block tracking-tight">
              OPEN <span className="text-[#00e87c]">TERMINAL</span>
            </span>
          </a>

          {/* Ticker search */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 w-full px-3 py-1.5 rounded border border-[#152b1e] bg-[#0a1610] hover:border-[#1e4030] transition-colors text-left"
            >
              <span className="font-mono text-[10px] text-[#00e87c] shrink-0">$</span>
              <span className="font-mono text-sm font-bold text-[#c8edd8] truncate">{activeTicker}</span>
              <span className="text-[10px] text-[#2d5040] ml-auto hidden sm:block font-mono whitespace-nowrap">search ticker_</span>
            </button>

            {searchOpen && (
              <div className="absolute top-full left-0 mt-1 rounded border border-[#1e4030] bg-[#0a1610] shadow-2xl shadow-black/70 overflow-hidden z-50 w-64 sm:w-full sm:min-w-[260px]"
                   style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,232,124,0.1)" }}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[#152b1e]">
                  <span className="font-mono text-[10px] text-[#00e87c] shrink-0">$</span>
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value.toUpperCase())}
                    onKeyDown={handleSearchKey}
                    placeholder="TYPE TICKER…"
                    className="flex-1 bg-transparent font-mono text-sm text-[#c8edd8] placeholder-[#2d5040] outline-none min-w-0 uppercase"
                  />
                  <button onClick={() => { setSearchOpen(false); setQuery(""); }}>
                    <X className="w-3.5 h-3.5 text-[#2d5040] hover:text-[#c8edd8]" />
                  </button>
                </div>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {suggestions.map(t => (
                    <button
                      key={t}
                      onClick={() => selectTicker(t)}
                      className={cn(
                        "w-full text-left px-3 py-2 font-mono text-sm hover:bg-[#0f2218] transition-colors flex items-center gap-2",
                        t === activeTicker ? "text-[#00e87c]" : "text-[#c8edd8]"
                      )}
                    >
                      <span className="text-[#2d5040] text-xs">›</span>
                      <span className="font-medium">{t}</span>
                      {watchlist.includes(t) && <span className="text-[9px] text-[#2d5040] font-mono ml-auto">watchlist</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center border border-[#152b1e] rounded p-0.5 shrink-0 bg-[#0a1610]">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn(
                "px-2.5 sm:px-3 py-1 rounded-sm font-mono text-[11px] font-semibold tracking-wider transition-colors",
                activeTab === "overview"
                  ? "bg-[#00e87c18] text-[#00e87c] border border-[#00e87c33]"
                  : "text-[#5a9e7a] hover:text-[#c8edd8]"
              )}
            >OVERVIEW</button>
            <button
              onClick={() => setActiveTab("discover")}
              className={cn(
                "px-2.5 sm:px-3 py-1 rounded-sm font-mono text-[11px] font-semibold tracking-wider transition-colors flex items-center gap-1",
                activeTab === "discover"
                  ? "bg-[#00e87c18] text-[#00e87c] border border-[#00e87c33]"
                  : "text-[#5a9e7a] hover:text-[#c8edd8]"
              )}
            >
              <Compass className="w-3 h-3" />
              <span className="hidden sm:inline">SCAN</span>
            </button>
          </div>

          {/* Terminal button */}
          <a
            href={`/terminal/${activeTicker}`}
            className="shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded border border-[#00e87c33] bg-[#00e87c0a] text-[#00e87c] font-mono text-[11px] font-semibold tracking-wider hover:bg-[#00e87c18] hover:border-[#00e87c66] transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:block whitespace-nowrap">ADVANCED</span>
          </a>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16">
          <PriceHero ticker={activeTicker} />

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            <div className="flex flex-col gap-6">
              <AIPredPanel ticker={activeTicker} />
              <SignalCard ticker={activeTicker} />
              <NewsPanel ticker={activeTicker} />
              <HomeChat ticker={activeTicker} />
            </div>
            <div className="flex flex-col gap-4">
              <TechnicalsStrip ticker={activeTicker} />
              <QualityCard ticker={activeTicker} />
              <NarrativeCard ticker={activeTicker} />
              <ValuationCard ticker={activeTicker} />
              <InsiderCard ticker={activeTicker} />
            </div>
          </div>
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16">
          <HomeDiscover onSelectTicker={selectTicker} />
        </main>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-30" onClick={() => { setSearchOpen(false); setQuery(""); }} />
      )}
    </div>
  );
}
