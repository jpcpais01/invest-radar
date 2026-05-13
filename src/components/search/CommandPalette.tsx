"use client";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, TrendingUp } from "lucide-react";
import { useTickerStore } from "@/store/tickerStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (ticker: string) => void;
  variant?: "terminal" | "home";
}

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export default function CommandPalette({ open, onClose, onSelect, variant = "terminal" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { watchlist } = useTickerStore();

  const s = variant === "home" ? {
    backdrop:    "bg-black/70",
    container:   "bg-[#101010] border-[#2c2c2c]",
    inputBorder: "border-[#1e1e1e]",
    inputText:   "text-[#f0f0f0] placeholder-[#3a3a3a]",
    icon:        "text-[#3a3a3a]",
    heading:     "text-[#3a3a3a]",
    item:        "hover:bg-[#161616] text-[#f0f0f0]",
    badge:       "bg-[#161616] text-[#c0c0cc]",
    accent:      "text-[#c0c0cc]",
    muted:       "text-[#3a3a3a]",
    watchIcon:   "text-[#c0c0cc]",
  } : {
    backdrop:    "bg-black/60",
    container:   "bg-[#161b22] border-[#30363d]",
    inputBorder: "border-[#30363d]",
    inputText:   "text-white placeholder-[#8b949e]",
    icon:        "text-[#8b949e]",
    heading:     "text-[#8b949e]",
    item:        "hover:bg-[#21262d] text-white",
    badge:       "bg-[#21262d] text-[#388bfd]",
    accent:      "text-[#388bfd]",
    muted:       "text-[#8b949e]",
    watchIcon:   "text-[#1f6feb]",
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!open) onClose(); // toggle — handled by parent
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center pt-20 ${s.backdrop}`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg border rounded-xl shadow-2xl overflow-hidden ${s.container}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <div className={`flex items-center gap-3 px-4 py-3 border-b ${s.inputBorder}`}>
            <Search className={`w-4 h-4 shrink-0 ${s.icon}`} />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search tickers, companies..."
              className={`flex-1 bg-transparent text-sm outline-none ${s.inputText}`}
              autoFocus
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            {loading && (
              <div className={`py-4 text-center text-xs ${s.muted}`}>Searching…</div>
            )}

            {!loading && !query && watchlist.length > 0 && (
              <Command.Group heading={<span className={`text-[10px] uppercase px-2 ${s.heading}`}>Watchlist</span>}>
                {watchlist.map((t) => (
                  <Command.Item
                    key={t}
                    value={t}
                    onSelect={() => { onSelect(t); setQuery(""); onClose(); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${s.item}`}
                  >
                    <TrendingUp className={`w-3.5 h-3.5 ${s.watchIcon}`} />
                    <span className="font-medium">{t}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!loading && results.length > 0 && (
              <Command.Group heading={<span className={`text-[10px] uppercase px-2 ${s.heading}`}>Results</span>}>
                {results.map((r) => (
                  <Command.Item
                    key={r.symbol}
                    value={r.symbol}
                    onSelect={() => { onSelect(r.symbol); setQuery(""); onClose(); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${s.item}`}
                  >
                    <div className={`w-8 h-6 flex items-center justify-center rounded text-[10px] font-bold ${s.badge}`}>
                      {r.type === "ETF" ? "ETF" : "EQ"}
                    </div>
                    <div>
                      <div className="font-medium">{r.symbol}</div>
                      <div className={`text-[11px] ${s.muted}`}>{r.name}</div>
                    </div>
                    <div className={`ml-auto text-[10px] ${s.muted}`}>{r.exchange}</div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!loading && query && results.length === 0 && (
              <div className={`py-4 text-center text-xs ${s.muted}`}>No results for &quot;{query}&quot;</div>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
