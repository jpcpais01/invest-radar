"use client";
import { useState } from "react";
import { useTickerStore } from "@/store/tickerStore";
import { cn } from "@/lib/utils";
import { Search, Terminal, BarChart2, Compass, X } from "lucide-react";
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
    <div className="h-screen overflow-y-auto bg-[#0d1117] text-white" style={{ scrollbarWidth: "thin", scrollbarColor: "#21262d transparent" }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[#21262d]/80 bg-[#0d1117]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#388bfd] to-[#a78bfa] flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm text-white hidden sm:block tracking-tight">InvestRadar</span>
          </div>

          {/* Ticker search */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 w-full px-3 py-1.5 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#484f58] transition-colors text-left"
            >
              <Search className="w-3.5 h-3.5 text-[#484f58] shrink-0" />
              <span className="text-sm font-bold text-white truncate">{activeTicker}</span>
              <span className="text-xs text-[#484f58] ml-auto hidden sm:block whitespace-nowrap">Search ticker</span>
            </button>

            {searchOpen && (
              <div className="absolute top-full left-0 mt-1.5 rounded-xl border border-[#30363d] bg-[#161b22] shadow-2xl shadow-black/50 overflow-hidden z-50 w-64 sm:w-full sm:min-w-[260px]">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[#21262d]">
                  <Search className="w-3.5 h-3.5 text-[#484f58] shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value.toUpperCase())}
                    onKeyDown={handleSearchKey}
                    placeholder="Type ticker…"
                    className="flex-1 bg-transparent text-sm text-white placeholder-[#484f58] outline-none min-w-0"
                  />
                  <button onClick={() => { setSearchOpen(false); setQuery(""); }}>
                    <X className="w-3.5 h-3.5 text-[#484f58] hover:text-white" />
                  </button>
                </div>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {suggestions.map(t => (
                    <button
                      key={t}
                      onClick={() => selectTicker(t)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-[#21262d] transition-colors flex items-center gap-2",
                        t === activeTicker ? "text-[#388bfd]" : "text-white"
                      )}
                    >
                      <span className="font-medium">{t}</span>
                      {watchlist.includes(t) && <span className="text-[10px] text-[#484f58]">watchlist</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn("px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors", activeTab === "overview" ? "bg-[#21262d] text-white" : "text-[#8b949e] hover:text-white")}
            >Overview</button>
            <button
              onClick={() => setActiveTab("discover")}
              className={cn("px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1", activeTab === "discover" ? "bg-[#21262d] text-white" : "text-[#8b949e] hover:text-white")}
            >
              <Compass className="w-3 h-3" /><span className="hidden sm:inline">Discover</span>
            </button>
          </div>

          {/* Terminal button */}
          <a
            href={`/terminal/${activeTicker}`}
            className="shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#388bfd44] bg-[#1f6feb15] text-[#388bfd] text-xs font-medium hover:bg-[#1f6feb25] hover:border-[#388bfd88] transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:block whitespace-nowrap">Advanced Terminal</span>
          </a>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16">
          {/* Hero */}
          <PriceHero ticker={activeTicker} />

          {/* Main Grid */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

            {/* Left column */}
            <div className="flex flex-col gap-6">
              <AIPredPanel ticker={activeTicker} />
              <SignalCard ticker={activeTicker} />
              <NewsPanel ticker={activeTicker} />
              <HomeChat ticker={activeTicker} />
            </div>

            {/* Right column */}
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

      {/* Click-away for search */}
      {searchOpen && (
        <div className="fixed inset-0 z-30" onClick={() => { setSearchOpen(false); setQuery(""); }} />
      )}
    </div>
  );
}
