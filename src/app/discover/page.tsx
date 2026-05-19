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

// ── Technical scanner types ───────────────────────────────────────────────────

type SignalValue = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";
type FilterTab = "all" | "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";
type SortKey = "score" | "ticker" | "price" | "change";
type SortDir = "asc" | "desc";

interface SignalEntry { name: string; signal: SignalValue; value: string }
interface ScanSummary {
  signals: SignalEntry[];
  overall: SignalValue;
  strongBuys: number; buys: number; sells: number; strongSells: number; neutrals: number;
}
interface ScanResult {
  ticker: string; name?: string; price?: number;
  change?: number; changePercent?: number; summary?: ScanSummary; error?: boolean;
}

// ── Fair price types ──────────────────────────────────────────────────────────

type FPFilter   = "all" | "undervalued" | "fair" | "overvalued";
type FPSortKey  = "upside" | "ticker" | "price" | "change";
type McapFilter = "none" | "20b" | "50b" | "100b";

interface FPResult {
  ticker: string; name?: string; price: number; changePercent?: number;
  fairPrice: number; upside: number;
  lynchVal: number | null; peVal: number | null; dcfVal: number | null;
  modelsUsed: number; marketCap?: number;
}

const MCAP_FILTERS: { id: McapFilter; label: string; min: number }[] = [
  { id: "none", label: "Any",    min: 0 },
  { id: "20b",  label: "≥ 20B", min: 20e9 },
  { id: "50b",  label: "≥ 50B", min: 50e9 },
  { id: "100b", label: "≥ 100B", min: 100e9 },
];

function fpCategory(upside: number): FPFilter {
  if (upside >= 15) return "undervalued";
  if (upside >= 0)  return "fair";
  return "overvalued";
}

function fpUpsideColor(pct: number) {
  if (pct >= 15) return "#3fb950";
  if (pct >= 0)  return "#56d364";
  return "#f85149";
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function getScore(r: ScanResult): number {
  if (!r.summary) return 0;
  return (r.summary.strongBuys ?? 0) * 2 + r.summary.buys - r.summary.sells - (r.summary.strongSells ?? 0) * 2;
}

function scoreCategory(score: number): FilterTab {
  if (score >= 3) return "strong-buy";
  if (score >= 1) return "buy";
  if (score === 0) return "neutral";
  if (score >= -2) return "sell";
  return "strong-sell";
}

const TF_OPTIONS = ["1M", "3M", "6M", "1Y"];

const INDICATOR_LABELS: Record<string, string> = {
  "RSI(14)": "RSI", "MACD": "MACD", "Bollinger": "BB",
  "EMA Cross": "EMA×", "Stochastic": "STOCH", "EMA 9/21": "EMA9",
};

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" }, { id: "strong-buy", label: "Strong Buy" },
  { id: "buy", label: "Buy" }, { id: "neutral", label: "Neutral" },
  { id: "sell", label: "Sell" }, { id: "strong-sell", label: "Strong Sell" },
];

const FP_FILTER_TABS: { id: FPFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "undervalued", label: "Undervalued" },
  { id: "fair", label: "Fair" }, { id: "overvalued", label: "Overvalued" },
];

const FILTER_COLORS: Record<FilterTab, string> = {
  all: "text-white border-[#388bfd] bg-[#1f6feb22]",
  "strong-buy": "text-[#3fb950] border-[#3fb95044] bg-[#3fb95022]",
  buy: "text-[#56d364] border-[#56d36433] bg-[#56d36415]",
  neutral: "text-[#8b949e] border-[#484f58] bg-[#8b949e11]",
  sell: "text-[#f85149] border-[#f8514933] bg-[#f8514915]",
  "strong-sell": "text-[#da3633] border-[#da363344] bg-[#da363322]",
};

const FP_FILTER_COLORS: Record<FPFilter, string> = {
  all:         "text-white border-[#388bfd] bg-[#1f6feb22]",
  undervalued: "text-[#3fb950] border-[#3fb95044] bg-[#3fb95022]",
  fair:        "text-[#8b949e] border-[#484f58] bg-[#8b949e11]",
  overvalued:  "text-[#f85149] border-[#f8514933] bg-[#f8514915]",
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
  "strong-buy":  "text-[#3fb950] bg-[#3fb95020] border-[#3fb95050]",
  "buy":         "text-[#56d364] bg-[#56d36415] border-[#56d36430]",
  "neutral":     "text-[#484f58] bg-transparent border-[#21262d]",
  "sell":        "text-[#ff7b72] bg-[#ff7b7215] border-[#ff7b7230]",
  "strong-sell": "text-[#f85149] bg-[#f8514920] border-[#f8514950]",
};

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-[#388bfd]" />
    : <ChevronDown className="w-3 h-3 text-[#388bfd]" />;
}

function ModelDot({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn(
      "w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold border",
      active ? "bg-[#1f6feb22] text-[#388bfd] border-[#1f6feb44]" : "bg-transparent text-[#21262d] border-[#21262d]"
    )}>{label}</span>
  );
}

const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCache<T>(key: string): { results: T[]; scannedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.scannedAt < CACHE_TTL) return parsed;
    return null;
  } catch { return null; }
}

function writeCache<T>(key: string, results: T[]) {
  try { localStorage.setItem(key, JSON.stringify({ results, scannedAt: Date.now() })); }
  catch { /* quota exceeded */ }
}

function formatScannedAt(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return isToday ? `today at ${time}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

export default function DiscoverPage() {
  const router = useRouter();

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"technical" | "fairprice">("technical");

  // ── Technical state ───────────────────────────────────────────────────────
  const [tf, setTf] = useState("3M");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [customTickers, setCustomTickers] = useState<string[]>([]);
  const [addInput, setAddInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);

  // ── Fair price state ──────────────────────────────────────────────────────
  const [fpResults, setFpResults] = useState<FPResult[]>([]);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpScannedAt, setFpScannedAt] = useState<number | null>(null);
  const [fpFilter, setFpFilter] = useState<FPFilter>("all");
  const [fpSortKey, setFpSortKey] = useState<FPSortKey>("upside");
  const [fpSortDir, setFpSortDir] = useState<SortDir>("desc");
  const [mcapFilter, setMcapFilter] = useState<McapFilter>("50b");

  useEffect(() => {
    const saved = localStorage.getItem("discover-custom-tickers");
    if (saved) {
      try { setCustomTickers(JSON.parse(saved)); } catch { /* ignore */ }
    }
    setHydrated(true);
  }, []);

  const allTickers = (extra: string[] = []) =>
    [...new Set([...PRESET_TICKERS, ...customTickers, ...extra])];

  // ── Scan functions ────────────────────────────────────────────────────────

  const scan = useCallback(async (tickers: string[], timeframe: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, tf: timeframe }),
      });
      const data: ScanResult[] = await res.json();
      const valid = data.filter((r) => !r.error && r.summary);
      setResults(valid);
      setScannedAt(Date.now());
      writeCache(`discover-cache-${timeframe}`, valid);
    } finally {
      setLoading(false);
    }
  }, []);

  const scanFairPrice = useCallback(async (tickers: string[]) => {
    setFpLoading(true);
    try {
      const res = await fetch("/api/market/fair-price-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data: FPResult[] = await res.json();
      setFpResults(data);
      setFpScannedAt(Date.now());
      writeCache("terminal-discover-fp", data);
    } finally {
      setFpLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const cached = readCache<ScanResult>(`discover-cache-${tf}`);
    if (cached) { setResults(cached.results); setScannedAt(cached.scannedAt); return; }
    scan(allTickers(), tf);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModeSwitch = (next: "technical" | "fairprice") => {
    setMode(next);
    if (next === "fairprice" && fpResults.length === 0 && !fpLoading) {
      const cached = readCache<FPResult>("terminal-discover-fp");
      if (cached) { setFpResults(cached.results); setFpScannedAt(cached.scannedAt); }
      else scanFairPrice(allTickers());
    }
  };

  const addCustomTicker = () => {
    const t = addInput.trim().toUpperCase();
    if (!t) return;
    setAddInput("");
    const isPresent = results.some((r) => r.ticker === t) || fpResults.some((r) => r.ticker === t);
    if (isPresent) return;
    if (!customTickers.includes(t) && !PRESET_TICKERS.includes(t)) {
      const updated = [...customTickers, t];
      setCustomTickers(updated);
      localStorage.setItem("discover-custom-tickers", JSON.stringify(updated));
      if (mode === "technical") scan(allTickers(updated), tf);
      else scanFairPrice(allTickers(updated));
    }
  };

  const removeCustomTicker = (t: string) => {
    const updated = customTickers.filter((x) => x !== t);
    setCustomTickers(updated);
    localStorage.setItem("discover-custom-tickers", JSON.stringify(updated));
    setResults((prev) => {
      const next = prev.filter((r) => r.ticker !== t);
      writeCache(`discover-cache-${tf}`, next);
      return next;
    });
    setFpResults((prev) => {
      const next = prev.filter((r) => r.ticker !== t);
      writeCache("terminal-discover-fp", next);
      return next;
    });
  };

  const handleRescan = () => {
    if (mode === "technical") scan(allTickers(), tf);
    else scanFairPrice(allTickers());
  };

  const handleTfChange = (newTf: string) => {
    setTf(newTf);
    const cached = readCache<ScanResult>(`discover-cache-${newTf}`);
    if (cached) { setResults(cached.results); setScannedAt(cached.scannedAt); return; }
    scan(allTickers(), newTf);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  const handleFpSort = (key: FPSortKey) => {
    if (fpSortKey === key) setFpSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setFpSortKey(key); setFpSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const categoryCounts = results.reduce<Record<FilterTab, number>>(
    (acc, r) => { const cat = scoreCategory(getScore(r)); acc[cat]++; acc.all++; return acc; },
    { all: 0, "strong-buy": 0, buy: 0, neutral: 0, sell: 0, "strong-sell": 0 }
  );

  const filtered = filter === "all" ? results : results.filter((r) => scoreCategory(getScore(r)) === filter);
  const sorted = [...filtered].sort((a, b) => {
    let v = 0;
    if (sortKey === "score") v = getScore(a) - getScore(b);
    else if (sortKey === "ticker") v = a.ticker.localeCompare(b.ticker);
    else if (sortKey === "price") v = (a.price ?? 0) - (b.price ?? 0);
    else if (sortKey === "change") v = (a.changePercent ?? 0) - (b.changePercent ?? 0);
    return sortDir === "asc" ? v : -v;
  });

  const fpCounts = fpResults.reduce<Record<FPFilter, number>>(
    (acc, r) => { acc[fpCategory(r.upside)]++; acc.all++; return acc; },
    { all: 0, undervalued: 0, fair: 0, overvalued: 0 }
  );

  const mcapMin = MCAP_FILTERS.find(f => f.id === mcapFilter)?.min ?? 0;
  const fpFiltered = fpResults
    .filter(r => fpFilter === "all" || fpCategory(r.upside) === fpFilter)
    .filter(r => mcapMin === 0 || (r.marketCap != null && r.marketCap >= mcapMin));

  const fpSorted = [...fpFiltered].sort((a, b) => {
    let v = 0;
    if (fpSortKey === "upside")  v = a.upside - b.upside;
    if (fpSortKey === "ticker")  v = a.ticker.localeCompare(b.ticker);
    if (fpSortKey === "price")   v = a.price - b.price;
    if (fpSortKey === "change")  v = (a.changePercent ?? 0) - (b.changePercent ?? 0);
    return fpSortDir === "asc" ? v : -v;
  });

  const indicatorNames = results[0]?.summary?.signals.map((s) => s.name) ?? [];
  const isLoading = mode === "technical" ? loading : fpLoading;
  const currentScannedAt = mode === "technical" ? scannedAt : fpScannedAt;

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] overflow-hidden">
      <TopBar />

      <div className="flex flex-col flex-1 overflow-hidden px-5 py-4 gap-4">
        {/* Header row */}
        <div className="flex items-center justify-between shrink-0 gap-3 flex-wrap">
          <div>
            <h1 className="text-base font-semibold text-white">
              {mode === "technical" ? "Signal Scanner" : "Fair Price Scanner"}
            </h1>
            <p className="text-xs text-[#484f58] mt-0.5">
              {mode === "technical"
                ? `${results.length} stocks ranked by technical indicator consensus`
                : `${fpResults.length} stocks ranked by upside to fair price`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode toggle */}
            <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
              <button
                onClick={() => handleModeSwitch("technical")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "technical" ? "bg-[#1f6feb22] text-[#388bfd]" : "text-[#8b949e] hover:text-white"
                )}
              >Technical</button>
              <button
                onClick={() => handleModeSwitch("fairprice")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "fairprice" ? "bg-[#1f6feb22] text-[#388bfd]" : "text-[#8b949e] hover:text-white"
                )}
              >Fair Price</button>
            </div>

            {/* Timeframe — technical only */}
            {mode === "technical" && (
              <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                {TF_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleTfChange(t)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors",
                      t === tf ? "bg-[#1f6feb22] text-[#388bfd]" : "text-[#8b949e] hover:text-white"
                    )}
                  >{t}</button>
                ))}
              </div>
            )}

            {/* Market cap toggle — fair price only */}
            {mode === "fairprice" && (
              <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                {MCAP_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setMcapFilter(f.id)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors",
                      mcapFilter === f.id ? "bg-[#1f6feb22] text-[#388bfd]" : "text-[#8b949e] hover:text-white"
                    )}
                  >{f.label}</button>
                ))}
              </div>
            )}

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
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58] disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              {isLoading ? "Scanning…" : "Rescan"}
            </button>
          </div>
        </div>

        {/* Custom ticker chips */}
        {customTickers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <span className="text-[10px] text-[#484f58] self-center uppercase tracking-widest">Custom:</span>
            {customTickers.map((t) => (
              <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1f6feb15] border border-[#1f6feb33] text-[#388bfd]">
                {t}
                <button onClick={() => removeCustomTicker(t)} className="hover:text-white transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── TECHNICAL: filter tabs ─────────────────────────────────────── */}
        {mode === "technical" && (
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
                {!loading && <span className="ml-1.5 opacity-60">{categoryCounts[tab.id]}</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── FAIR PRICE: filter tabs ────────────────────────────────────── */}
        {mode === "fairprice" && (
          <div className="flex items-center gap-1.5 shrink-0">
            {FP_FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFpFilter(tab.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                  fpFilter === tab.id ? FP_FILTER_COLORS[tab.id] : FILTER_INACTIVE
                )}
              >
                {tab.label}
                {!fpLoading && <span className="ml-1.5 opacity-60">{fpCounts[tab.id]}</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto rounded-xl border border-[#21262d] bg-[#0d1117]">

          {/* ── TECHNICAL TABLE ──────────────────────────────────────────── */}
          {mode === "technical" && (
            loading && results.length === 0 ? (
              <TechSkeleton />
            ) : sorted.length === 0 ? (
              <EmptyState />
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#21262d] bg-[#161b22] sticky top-0 z-10">
                    <th className="px-4 py-2.5 text-left">
                      <button onClick={() => handleSort("ticker")} className="flex items-center gap-1 text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Ticker <SortIcon col="ticker" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <button onClick={() => handleSort("price")} className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Price <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <button onClick={() => handleSort("change")} className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Chg% <SortIcon col="change" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-center">
                      <button onClick={() => handleSort("score")} className="flex items-center gap-1 mx-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Score <SortIcon col="score" sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-center">
                      <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">Signals</span>
                    </th>
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
                    const sBuys = r.summary?.strongBuys ?? 0;
                    const sSells = r.summary?.strongSells ?? 0;
                    const totalSig = sBuys + (r.summary?.buys ?? 0) + (r.summary?.neutrals ?? 0) + (r.summary?.sells ?? 0) + sSells;
                    const pct = (n: number) => totalSig ? (n / totalSig) * 100 : 0;
                    const isCustom = customTickers.includes(r.ticker);
                    return (
                      <tr key={r.ticker} onClick={() => router.push(`/terminal/${r.ticker}`)}
                        className="border-b border-[#161b22] hover:bg-[#161b22] cursor-pointer transition-colors group">
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white group-hover:text-[#388bfd] transition-colors">{r.ticker}</span>
                              {isCustom && (
                                <span className="text-[9px] px-1 py-0.5 rounded border border-[#1f6feb33] text-[#388bfd] bg-[#1f6feb15]">custom</span>
                              )}
                            </div>
                            {r.name && <span className="text-[10px] text-[#484f58] truncate max-w-[140px] leading-tight">{r.name}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-white">
                          {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right font-mono", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
                          {r.changePercent != null ? `${isUp ? "+" : ""}${r.changePercent.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={cn("inline-block px-2 py-0.5 rounded-md border text-xs font-bold", SCORE_COLORS[cat])}>
                            {score > 0 ? `+${score}` : score}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-1 items-center w-24 mx-auto">
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-[#3fb950] font-semibold">{sBuys + (r.summary?.buys ?? 0)}B</span>
                              <span className="text-[#8b949e]">{r.summary?.neutrals ?? 0}N</span>
                              <span className="text-[#f85149] font-semibold">{(r.summary?.sells ?? 0) + sSells}S</span>
                            </div>
                            <div className="flex h-1 w-full rounded-full overflow-hidden gap-px">
                              <div className="bg-[#3fb950] rounded-l-full" style={{ width: `${pct(sBuys)}%` }} />
                              <div className="bg-[#56d364]" style={{ width: `${pct(r.summary?.buys ?? 0)}%` }} />
                              <div className="bg-[#484f58]" style={{ width: `${pct(r.summary?.neutrals ?? 0)}%` }} />
                              <div className="bg-[#ff7b72]" style={{ width: `${pct(r.summary?.sells ?? 0)}%` }} />
                              <div className="bg-[#f85149] rounded-r-full" style={{ width: `${pct(sSells)}%` }} />
                            </div>
                          </div>
                        </td>
                        {indicatorNames.map((name) => {
                          const sig = r.summary?.signals.find((s) => s.name === name);
                          return (
                            <td key={name} className="px-3 py-2.5 text-center">
                              {sig ? (
                                <span className={cn("inline-block px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide", SIGNAL_PILL[sig.signal])}>
                                  {sig.signal === "neutral" ? "—" : sig.signal === "strong-buy" ? "S.Buy" : sig.signal === "strong-sell" ? "S.Sell" : sig.signal}
                                </span>
                              ) : <span className="text-[#21262d]">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )}

          {/* ── FAIR PRICE TABLE ─────────────────────────────────────────── */}
          {mode === "fairprice" && (
            fpLoading && fpResults.length === 0 ? (
              <FPSkeleton />
            ) : fpSorted.length === 0 ? (
              <EmptyState />
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#21262d] bg-[#161b22] sticky top-0 z-10">
                    <th className="px-4 py-2.5 text-left">
                      <button onClick={() => handleFpSort("ticker")} className="flex items-center gap-1 text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Ticker <SortIcon col="ticker" sortKey={fpSortKey} sortDir={fpSortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <button onClick={() => handleFpSort("price")} className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Price <SortIcon col="price" sortKey={fpSortKey} sortDir={fpSortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <button onClick={() => handleFpSort("change")} className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Chg% <SortIcon col="change" sortKey={fpSortKey} sortDir={fpSortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <button onClick={() => handleFpSort("upside")} className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Fair Price <SortIcon col="upside" sortKey={fpSortKey} sortDir={fpSortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <button onClick={() => handleFpSort("upside")} className="flex items-center gap-1 ml-auto text-[10px] font-semibold text-[#484f58] uppercase tracking-widest hover:text-white transition-colors">
                        Upside <SortIcon col="upside" sortKey={fpSortKey} sortDir={fpSortDir} />
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-center">
                      <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">Models</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fpSorted.map((r) => {
                    const isUp = (r.changePercent ?? 0) >= 0;
                    const color = fpUpsideColor(r.upside);
                    const isCustom = customTickers.includes(r.ticker);
                    return (
                      <tr key={r.ticker} onClick={() => router.push(`/terminal/${r.ticker}`)}
                        className="border-b border-[#161b22] hover:bg-[#161b22] cursor-pointer transition-colors group">
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white group-hover:text-[#388bfd] transition-colors">{r.ticker}</span>
                              {isCustom && (
                                <span className="text-[9px] px-1 py-0.5 rounded border border-[#1f6feb33] text-[#388bfd] bg-[#1f6feb15]">custom</span>
                              )}
                            </div>
                            {r.name && <span className="text-[10px] text-[#484f58] truncate max-w-[140px] leading-tight">{r.name}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-white">
                          ${r.price.toFixed(2)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right font-mono", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
                          {r.changePercent != null ? `${isUp ? "+" : ""}${r.changePercent.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-white">
                          ${r.fairPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-mono text-xs font-semibold tabular-nums" style={{ color }}>
                            {r.upside >= 0 ? "+" : ""}{r.upside.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <ModelDot label="L" active={r.lynchVal != null} />
                            <ModelDot label="P" active={r.peVal   != null} />
                            <ModelDot label="D" active={r.dcfVal  != null} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )}
        </div>

        {/* Footer */}
        {!isLoading && currentScannedAt && (mode === "technical" ? results.length > 0 : fpResults.length > 0) && (
          <div className="text-[10px] text-[#484f58] shrink-0 text-center">
            {mode === "technical"
              ? `${results.length} stocks · ${tf} timeframe · Last scanned ${formatScannedAt(currentScannedAt)} · Click any row to open`
              : `${fpResults.length} stocks · Lynch + P/E + DCF avg · Last scanned ${formatScannedAt(currentScannedAt)} · Click any row to open`}
          </div>
        )}
      </div>
    </div>
  );
}

function TechSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[#21262d] bg-[#161b22]">
        {["Ticker", "Price", "Chg%", "Score", "Buy/Sell", "RSI", "MACD", "BB", "EMA×"].map((h) => (
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
          {Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-4 w-10 rounded bg-[#21262d]" />)}
        </div>
      ))}
    </div>
  );
}

function FPSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[#21262d] bg-[#161b22]">
        {["Ticker", "Price", "Chg%", "Fair Price", "Upside", "Models"].map((h) => (
          <div key={h} className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">{h}</div>
        ))}
      </div>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-2.5 border-b border-[#161b22] animate-pulse">
          {Array.from({ length: 6 }).map((_, j) => <div key={j} className="h-3 rounded bg-[#21262d]" style={{ width: j === 0 ? 48 : 40 }} />)}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-32">
      <p className="text-xs text-[#484f58]">No results for this filter</p>
    </div>
  );
}
