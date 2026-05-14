"use client";
import { useState, useEffect, useRef } from "react";
import { useTickerStore } from "@/store/tickerStore";
import { cn } from "@/lib/utils";
import { Search, Terminal, Compass, Sparkles, X } from "lucide-react";
import PriceHero from "./PriceHero";
import AIPredPanel from "./AIPredPanel";
import TechnicalsStrip from "./TechnicalsStrip";
import { SignalCard, QualityCard, NarrativeCard, ValuationCard, InsiderCard } from "./InsightCards";
import NewsPanel from "./NewsPanel";
import HomeDiscover from "./HomeDiscover";
import HomeChat from "./HomeChat";
import CommandPalette from "@/components/search/CommandPalette";

type Tab = "overview" | "discover";

export default function HomePage() {
  const { activeTicker, setActiveTicker } = useTickerStore();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatBtnRef = useRef<HTMLDivElement>(null);

  const selectTicker = (t: string) => {
    setActiveTicker(t.toUpperCase());
    setPaletteOpen(false);
    setActiveTab("overview");
  };

  // ⌘K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="h-screen overflow-y-auto text-[#f0f0f0]"
      style={{ background: "#080808", scrollbarWidth: "thin", scrollbarColor: "#1e1e1e transparent" }}
    >
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[#1e1e1e]" style={{ background: "rgba(8,8,8,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-7 h-7 rounded-md border border-[#c0c0cc33] bg-[#c0c0cc08] flex items-center justify-center group-hover:border-[#c0c0cc66] transition-colors">
              <span className="text-[#c0c0cc] text-[10px] font-bold">◆</span>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-xs font-semibold text-[#f0f0f0] tracking-wide">Open Terminal</span>
            </div>
          </a>

          {/* Ticker search */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 flex-1 min-w-0 px-3 py-1.5 rounded-md border border-[#1e1e1e] bg-[#101010] hover:border-[#2c2c2c] transition-colors text-left"
          >
            <Search className="w-3.5 h-3.5 text-[#3a3a3a] shrink-0" />
            <span className="text-sm font-semibold text-[#f0f0f0] truncate font-mono">{activeTicker}</span>
            <kbd className="ml-auto text-[10px] text-[#3a3a3a] font-mono hidden sm:block">⌘K</kbd>
          </button>

          {/* Tabs */}
          <div className="flex items-center border border-[#1e1e1e] rounded-md p-0.5 shrink-0 bg-[#101010]">
            <button
              onClick={() => setActiveTab("overview")}
              className={cn("px-3 py-1 rounded text-xs font-medium transition-colors tracking-wide", activeTab === "overview" ? "bg-[#c0c0cc15] text-[#c0c0cc] border border-[#c0c0cc28]" : "text-[#767676] hover:text-[#f0f0f0]")}
            >Overview</button>
            <button
              onClick={() => setActiveTab("discover")}
              className={cn("px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 tracking-wide", activeTab === "discover" ? "bg-[#c0c0cc15] text-[#c0c0cc] border border-[#c0c0cc28]" : "text-[#767676] hover:text-[#f0f0f0]")}
            >
              <Compass className="w-3 h-3" /><span className="hidden sm:inline">Discover</span>
            </button>
          </div>

          {/* AI Chat button */}
          <div ref={chatBtnRef} className="relative shrink-0">
            <button
              onClick={() => setChatOpen(v => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all",
                chatOpen
                  ? "bg-[#c0c0cc18] border-[#c0c0cc55] text-[#f0f0f0]"
                  : "bg-[#c0c0cc08] border-[#c0c0cc28] text-[#c0c0cc] hover:bg-[#c0c0cc15] hover:border-[#c0c0cc44]"
              )}
            >
              <Sparkles className={cn("w-3.5 h-3.5 transition-all", chatOpen ? "text-[#c0c0cc]" : "text-[#c0c0cc]")} />
              <span className="hidden sm:block whitespace-nowrap">Ask AI</span>
              {chatOpen && <X className="w-3 h-3 ml-0.5 opacity-60" />}
            </button>

            {/* Chat dropdown */}
            {chatOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setChatOpen(false)} />
                <div className="absolute top-[calc(100%+10px)] right-0 z-50 w-[min(440px,calc(100vw-32px))]">
                  {/* Arrow */}
                  <div className="absolute -top-1.5 right-4 w-3 h-3 rotate-45 bg-[#101010] border-l border-t border-[#2c2c2c]" />
                  <div className="rounded-xl border border-[#2c2c2c] overflow-hidden shadow-2xl"
                    style={{ background: "#101010", boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(192,192,204,0.06)" }}>
                    <HomeChat ticker={activeTicker} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Terminal button */}
          <a
            href={`/terminal/${activeTicker}`}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#c0c0cc28] bg-[#c0c0cc08] text-[#c0c0cc] text-xs font-medium hover:bg-[#c0c0cc15] hover:border-[#c0c0cc44] transition-colors"
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={selectTicker}
        variant="home"
      />
    </div>
  );
}
