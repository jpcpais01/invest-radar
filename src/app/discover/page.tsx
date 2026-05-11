"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";
import { RefreshCw, Plus, X, ChevronUp, ChevronDown } from "lucide-react";

const PRESET_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "UNH",
  "MA", "HD", "PG", "JNJ", "COST", "AVGO", "MRK", "CVX", "ABBV", "KO",
  "PEP", "WMT", "LLY", "TMO", "MCD", "CSCO", "ACN", "ABT", "BAC", "NEE",
  "DIS", "VZ", "ORCL", "PM", "INTC", "AMGN", "RTX", "HON", "IBM", "CAT",
  "GS", "BA", "NKE", "ADBE", "PYPL", "NFLX", "AMD", "QCOM", "SBUX", "GE",
];

type SignalValue = "buy" | "sell" | "neutral";

interface SignalEntry {
  name: string;
  signal: SignalValue;
  value: string;
}

interface ScanSummary {
  signals: SignalEntry[];
  overall: SignalValue;
  buys: number;
  sells: number;
  neutrals: number;
}

interface ScanResult {
  ticker: string;
  name?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  summary?: ScanSummary;
  error?: boolean;
}

type FilterTab = "all" | "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";
type SortKey = "score" | "ticker" | "price" | "change";
type SortDir = "asc" | "desc";

const TF_OPTIONS = ["1M", "3M", "6M", "1Y"];

// Map verbose signal names to short display labels
const INDICATOR_LABELS: Record<string, string> = {
  "RSI(14)": "RSI",
  "MACD": "MACD",
  "Bollinger": "BB",
  "EMA Cross": "EMA×",
  "Stochastic": "STOCH",
  "EMA 9/21": "EMA9",
};

function getScore(r: ScanResult): number {
  if (!r.summary) return 0;
  return r.summary.buys - r.summary.sells;
}

function scoreCategory(score: number): FilterTab {
  if (score >= 3) return "strong-buy";
  if (score >= 1) return "buy";
  if (score === 0) return "neutral";
  if (score >= -2) return "sell";
  return "strong-sell";
}

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "strong-buy", label: "Strong Buy" },
  { id: "buy", label: "Buy" },
  { id: "neutral", label: "Neutral" },
  { id: "sell", label: "Sell" },
  { id: "strong-sell", label: "Strong Sell" },
];

const FILTER_COLORS: Record<FilterTab, string> = {
  all: "text-white border-[#388bfd] bg-[#1f6feb22]",
  "strong-buy": "text-[#3fb950] border-[#3fb95044] bg-[#3fb95022]",
  buy: "text-[#56d364] border-[#56d36433] bg-[#56d36415]",
  neutral: "text-[#8b949e] border-[#484f58] bg-[#8b949e11]",
  sell: "text-[#f85149] border-[#f8514933] bg-[#f8514915]",
  "strong-sell": "text-[#da3633] border-[#da363344] bg-[#da363322]",
};

const FILTER_INACTIVE = "text-[#8b949e] border-[#21262d] hover:border-[#30363d] hover:text-white bg-transparent";

const SCORE_COLORS: Record<FilterTab, string> = {
  all: "text-white bg-transparent border-transparent",
  "strong-buy": "text-[#3fb950] bg-[#3fb95022] border-[#3fb95044]",
  buy: "text-[#56d364] bg-[#56d36415] border-[#56d36433]",
  neutral: "text-[#8b949e] bg-[#8b949e11] border-[#30363d]",
  sell: "text-[#f85149] bg-[#f8514915] border-[#f8514933]",
  "strong-sell": "text-[#da3633] bg-[#da363322] border-[#da363344]",
};

const SIGNAL_PILL: Record<SignalValue, string> = {
  buy: "text-[#3fb950] bg-[#3fb95015] border-[#3fb95033]",
  sell: "text-[#f85149] bg-[#f8514915] border-[#f8514933]",
  neutral: "text-[#484f58] bg-transparent border-[#21262d]",
};

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-[#388bfd]" />
    : <ChevronDown className="w-3 h-3 text-[#388bfd]" />;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [tf, setTf] = useState("3M");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [customTickers, setCustomTickers] = useState<string[]>([]);
  const [addInput, setAddInput] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("discover-custom-tickers");
    if (saved) {
      try { setCustomTickers(JSON.parse(saved)); } catch { /* ignore */ }
    }
    setHydrated(true);
  }, []);

  const scan = useCallback(async (tickers: string[], timeframe: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, tf: timeframe }),
      });
      const data: ScanResult[] = await res.json();
      setResults(data.filter((r) => !r.error && r.summary));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-scan once localStorage is ready
  useEffect(() => {
    if (!hydrated) return;
    const all = [...new Set([...PRESET_TICKERS, ...customTickers])];
    scan(all, tf);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const addCustomTicker = () => {
    const t = addInput.trim().toUpperCase();
    if (!t) return;
    setAddInput("");
    if (customTickers.includes(t) || PRESET_TICKERS.includes(t)) {
      // already in list — just rescan so the ticker shows up if missing
      const all = [...new Set([...PRESET_TICKERS, ...customTickers])];
      scan(all, tf);
      return;
    }
    const updated = [...customTickers, t];
    setCustomTickers(updated);
    localStorage.setItem("discover-custom-tickers", JSON.stringify(updated));
    const all = [...new Set([...PRESET_TICKERS, ...updated])];
    scan(all, tf);
  };

  const removeCustomTicker = (t: string) => {
    const updated = customTickers.filter((x) => x !== t);
    setCustomTickers(updated);
    localStorage.setItem("discover-custom-tickers", JSON.stringify(updated));
    setResults((prev) => prev.filter((r) => r.ticker !== t));
  };

  const handleRescan = () => {
    const all = [...new Set([...PRESET_TICKERS, ...customTickers])];
    scan(all, tf);
  };

  const handleTfChange = (newTf: string) => {
    setTf(newTf);
    const all = [...new Set([...PRESET_TICKERS, ...customTickers])];
    scan(all, newTf);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" ? "asc" : "desc");
    }
  };

  // Count per category for tab badges
  const categoryCounts = results.reduce<Record<FilterTab, number>>(
    (acc, r) => {
      const cat = scoreCategory(getScore(r));
      acc[cat]++;
      acc.all++;
      return acc;
    },
    { all: 0, "strong-buy": 0, buy: 0, neutral: 0, sell: 0, "strong-sell": 0 }
  );

  const filtered = filter === "all"
    ? results
    : results.filter((r) => scoreCategory(getScore(r)) === filter);

  const sorted = [...filtered].sort((a, b) => {
    let v = 0;
    if (sortKey === "score") v = getScore(a) - getScore(b);
    else if (sortKey === "ticker") v = a.ticker.localeCompare(b.ticker);
    else if (sortKey === "price") v = (a.price ?? 0) - (b.price ?? 0);
    else if (sortKey === "change") v = (a.changePercent ?? 0) - (b.changePercent ?? 0);
    return sortDir === "asc" ? v : -v;
  });

  // Collect all unique indicator names in order from first result
  const indicatorNames = results[0]?.summary?.signals.map((s) => s.name) ?? [];

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] overflow-hidden">
      <TopBar />

      <div className="flex flex-col flex-1 overflow-hidden px-5 py-4 gap-4">
        {/* Header row */}
        <div className="flex items-center justify-between shrink-0 gap-3">
          <div>
            <h1 className="text-base font-semibold text-white">Signal Scanner</h1>
            <p className="text-xs text-[#484f58] mt-0.5">
              {results.length} stocks ranked by technical indicator consensus
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Timeframe */}
            <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
              {TF_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleTfChange(t)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    t === tf
                      ? "bg-[#1f6feb22] text-[#388bfd]"
                      : "text-[#8b949e] hover:text-white"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Add ticker */}
            <div className="flex items-center gap-1">
              <input
                value={addInput}
                onChange={(e) => setAddInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && addCustomTicker()}
                placeholder="Add ticker…"
                className="w-28 px-2.5 py-1.5 text-xs rounded-lg bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#388bfd] transition-colors"
              />
              <button
                onClick={addCustomTicker}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#1f6feb22] border border-[#1f6feb44] text-[#388bfd] hover:bg-[#1f6feb33] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Rescan */}
            <button
              onClick={handleRescan}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58] disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
              {loading ? "Scanning…" : "Rescan"}
            </button>
          </div>
        </div>

        {/* Custom ticker chips */}
        {customTickers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <span className="text-[10px] text-[#484f58] self-center uppercase tracking-widest">Custom:</span>
            {customTickers.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1f6feb15] border border-[#1f6feb33] text-[#388bfd]"
              >
                {t}
                <button onClick={() => removeCustomTicker(t)} className="hover:text-white transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 shrink-0">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                filter === tab.id ? FILTER_COLORS[tab.id] : FILTER_INACTIVE
              )}
            >
              {tab.label}
              {!loading && (
                <span className="ml-1.5 opacity-60">{categoryCounts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-xl border border-[#21262d] bg-[#0d1117]">
          {loading && results.length === 0 ? (
            // Skeleton
            <div className="flex flex-col">
              <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[#21262d] bg-[#161b22]">
                {["Ticker", "Price", "Chg%", "Score", "Buy/Sell", "RSI", "MACD", "BB", "EMA×", "STOCH", "EMA9"].map((h) => (
                  <div key={h} className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">{h}</div>
                ))}
              </div>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-2.5 border-b border-[#161b22] animate-pulse">
                  <div className="h-3 w-12 rounded bg-[#21262d]" />
                  <div className="h-3 w-16 rounded bg-[#21262d]" />
                  <div className="h-3 w-12 rounded bg-[#21262d]" />
                  <div className="h-3 w-10 rounded bg-[#21262d]" />
                  <div className="h-3 w-16 rounded bg-[#21262d]" />
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} className="h-4 w-10 rounded bg-[#21262d]" />
                  ))}
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-[#484f58]">No results for this filter</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#21262d] bg-[#161b22] sticky top-0 z-10">
                  {/* Ticker */}
                  <th className="px-4 py-2.5 text-left">
                    <button
                      onClick={() => handleSort("ticker")}
                      className="flex items-center gap-1 text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors"
                    >
                      Ticker <SortIcon col="ticker" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  {/* Price */}
                  <th className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleSort("price")}
                      className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors"
                    >
                      Price <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  {/* Change */}
                  <th className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleSort("change")}
                      className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors"
                    >
                      Chg% <SortIcon col="change" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  {/* Score */}
                  <th className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => handleSort("score")}
                      className="flex items-center gap-1 mx-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors"
                    >
                      Score <SortIcon col="score" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  {/* Buy/Sell bar */}
                  <th className="px-3 py-2.5 text-center">
                    <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">Signals</span>
                  </th>
                  {/* Individual indicators */}
                  {indicatorNames.map((name) => (
                    <th key={name} className="px-3 py-2.5 text-center">
                      <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">
                        {INDICATOR_LABELS[name] ?? name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const score = getScore(r);
                  const cat = scoreCategory(score);
                  const isUp = (r.changePercent ?? 0) >= 0;
                  const totalSig = (r.summary?.buys ?? 0) + (r.summary?.sells ?? 0) + (r.summary?.neutrals ?? 0);
                  const buyPct = totalSig ? ((r.summary?.buys ?? 0) / totalSig) * 100 : 0;
                  const sellPct = totalSig ? ((r.summary?.sells ?? 0) / totalSig) * 100 : 0;
                  const neutralPct = totalSig ? ((r.summary?.neutrals ?? 0) / totalSig) * 100 : 0;
                  const isCustom = customTickers.includes(r.ticker);

                  return (
                    <tr
                      key={r.ticker}
                      onClick={() => router.push(`/${r.ticker}`)}
                      className="border-b border-[#161b22] hover:bg-[#161b22] cursor-pointer transition-colors group"
                    >
                      {/* Ticker */}
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white group-hover:text-[#388bfd] transition-colors">
                              {r.ticker}
                            </span>
                            {isCustom && (
                              <span className="text-[9px] px-1 py-0.5 rounded border border-[#1f6feb33] text-[#388bfd] bg-[#1f6feb15]">
                                custom
                              </span>
                            )}
                          </div>
                          {r.name && (
                            <span className="text-[10px] text-[#484f58] truncate max-w-[140px] leading-tight">
                              {r.name}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Price */}
                      <td className="px-3 py-2.5 text-right font-mono text-white">
                        {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                      </td>
                      {/* Change */}
                      <td className={cn("px-3 py-2.5 text-right font-mono", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
                        {r.changePercent != null
                          ? `${isUp ? "+" : ""}${r.changePercent.toFixed(2)}%`
                          : "—"}
                      </td>
                      {/* Score badge */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-block px-2 py-0.5 rounded-md border text-xs font-bold", SCORE_COLORS[cat])}>
                          {score > 0 ? `+${score}` : score}
                        </span>
                      </td>
                      {/* Signal bar + counts */}
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1 items-center w-24 mx-auto">
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-[#3fb950] font-semibold">{r.summary?.buys ?? 0}B</span>
                            <span className="text-[#8b949e]">{r.summary?.neutrals ?? 0}N</span>
                            <span className="text-[#f85149] font-semibold">{r.summary?.sells ?? 0}S</span>
                          </div>
                          <div className="flex h-1 w-full rounded-full overflow-hidden gap-px">
                            <div className="bg-[#3fb950] rounded-l-full" style={{ width: `${buyPct}%` }} />
                            <div className="bg-[#8b949e]" style={{ width: `${neutralPct}%` }} />
                            <div className="bg-[#f85149] rounded-r-full" style={{ width: `${sellPct}%` }} />
                          </div>
                        </div>
                      </td>
                      {/* Individual indicator pills */}
                      {indicatorNames.map((name) => {
                        const sig = r.summary?.signals.find((s) => s.name === name);
                        return (
                          <td key={name} className="px-3 py-2.5 text-center">
                            {sig ? (
                              <span className={cn("inline-block px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide", SIGNAL_PILL[sig.signal])}>
                                {sig.signal === "neutral" ? "—" : sig.signal}
                              </span>
                            ) : (
                              <span className="text-[#21262d]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && results.length > 0 && (
          <div className="text-[10px] text-[#484f58] shrink-0 text-center">
            {results.length} stocks scanned · {tf} timeframe · Click any row to open full analysis
          </div>
        )}
      </div>
    </div>
  );
}
