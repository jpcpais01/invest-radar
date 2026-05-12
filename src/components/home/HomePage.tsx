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
      className="h-screen overflow-y-auto text-[#ede8e0]"
      style={{
        background: "radial-gradient(ellipse 100% 50% at 50% -5%, rgba(90,158,133,0.05) 0%, transparent 65%), #09090e",
        scrollbarWidth: "thin",
        scrollbarColor: "#1a1a28 transparent",
      }}
    >
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[#1a1a28]" style={{ background: "rgba(9,9,14,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-7 h-7 rounded-md border border-[#5a9e8533] bg-[#5a9e8508] flex items-center justify-center group-hover:border-[#5a9e8566] transition-colors">
              <span className="text-[#5a9e85] text-[10px] font-bold">◆</span>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-xs font-semibold text-[#ede8e0] tracking-wide">Open Terminal</span>
              <span className="text-[8px] text-[#3a3748] tracking-widest uppercase">by open source</span>
            </div>
          </a>

          {/* Ticker search */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md border border-[#1a1a28] bg-[#0d0d15] hover:border-[#272738] transition-colors text-left"
            >
              <Search className="w-3.5 h-3.5 text-[#3a3748] shrink-0" />
              <span className="text-sm font-semibold text-[#ede8e0] truncate font-mono">{activeTicker}</span>
              <span className="text-[10px] text-[#3a3748] ml-auto hidden sm:block">Search ticker</span>
            </button>

            {searchOpen && (
              <div className="absolute top-full left-0 mt-1 rounded-md border border-[#272738] bg-[#0d0d15] shadow-2xl overflow-hidden z-50 w-64 sm:w-full sm:min-w-[260px]"
                   style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(90,158,133,0.08)" }}>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1a28]">
                  <Search className="w-3.5 h-3.5 text-[#3a3748] shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value.toUpperCase())}
                    onKeyDown={handleSearchKey}
                    placeholder="Type ticker…"
                    className="flex-1 bg-transparent text-sm font-mono text-[#ede8e0] placeholder-[#3a3748] outline-none min-w-0"
                  />
                  <button onClick={() => { setSearchOpen(false); setQuery(""); }}>
                    <X className="w-3.5 h-3.5 text-[#3a3748] hover:text-[#ede8e0] transition-colors" />
                  </button>
                </div>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {suggestions.map(t => (
                    <button
                      key={t}
                      onClick={() => selectTicker(t)}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm hover:bg-[#12121c] transition-colors flex items-center gap-2",
                        t === activeTicker ? "text-[#5a9e85]" : "text-[#ede8e0]"
                      )}
                    >
                      <span className="font-mono font-medium">{t}</span>
                      {watchlist.includes(t) && <span className="text-[9px] text-[#3a3748] ml-auto">watchlist</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center border border-[#1a1a28] rounded-md p-0.5 shrink-0 bg-[#0d0d15]">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn("px-3 py-1 rounded text-xs font-medium transition-colors tracking-wide", activeTab === "overview" ? "bg-[#5a9e8515] text-[#5a9e85] border border-[#5a9e8528]" : "text-[#7c7890] hover:text-[#ede8e0]")}
            >Overview</button>
            <button
              onClick={() => setActiveTab("discover")}
              className={cn("px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 tracking-wide", activeTab === "discover" ? "bg-[#5a9e8515] text-[#5a9e85] border border-[#5a9e8528]" : "text-[#7c7890] hover:text-[#ede8e0]")}
            >
              <Compass className="w-3 h-3" /><span className="hidden sm:inline">Discover</span>
            </button>
          </div>

          {/* Terminal button */}
          <a
            href={`/terminal/${activeTicker}`}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#5a9e8528] bg-[#5a9e8508] text-[#5a9e85] text-xs font-medium hover:bg-[#5a9e8515] hover:border-[#5a9e8544] transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:block whitespace-nowrap">Terminal</span>
          </a>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16">
          <PriceHero ticker={activeTicker} />
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            <div className="flex flex-col gap-5">
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
