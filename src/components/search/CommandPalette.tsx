"use client";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, TrendingUp } from "lucide-react";
import { useTickerStore } from "@/store/tickerStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (ticker: string) => void;
}

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export default function CommandPalette({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { watchlist } = useTickerStore();

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
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#30363d]">
            <Search className="w-4 h-4 text-[#8b949e]" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search tickers, companies..."
              className="flex-1 bg-transparent text-white placeholder-[#8b949e] text-sm outline-none"
              autoFocus
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            {loading && (
              <div className="py-4 text-center text-xs text-[#8b949e]">Searching...</div>
            )}

            {!loading && !query && (
              <Command.Group heading={<span className="text-[10px] text-[#8b949e] uppercase px-2">Watchlist</span>}>
                {watchlist.map((t) => (
                  <Command.Item
                    key={t}
                    value={t}
                    onSelect={() => { onSelect(t); setQuery(""); onClose(); }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#21262d] text-white text-sm"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-[#1f6feb]" />
                    <span className="font-medium">{t}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!loading && results.length > 0 && (
              <Command.Group heading={<span className="text-[10px] text-[#8b949e] uppercase px-2">Results</span>}>
                {results.map((r) => (
                  <Command.Item
                    key={r.symbol}
                    value={r.symbol}
                    onSelect={() => { onSelect(r.symbol); setQuery(""); onClose(); }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#21262d] text-white text-sm"
                  >
                    <div className="w-8 h-6 flex items-center justify-center bg-[#21262d] rounded text-[10px] font-bold text-[#388bfd]">
                      {r.type === "ETF" ? "ETF" : "EQ"}
                    </div>
                    <div>
                      <div className="font-medium text-white">{r.symbol}</div>
                      <div className="text-[11px] text-[#8b949e]">{r.name}</div>
                    </div>
                    <div className="ml-auto text-[10px] text-[#8b949e]">{r.exchange}</div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!loading && query && results.length === 0 && (
              <div className="py-4 text-center text-xs text-[#8b949e]">No results for &quot;{query}&quot;</div>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
