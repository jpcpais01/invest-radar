"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronUp, ChevronDown, Compass } from "lucide-react";

interface Props { onSelectTicker: (t: string) => void }

const PRESET_TICKERS = [
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","JPM","V","UNH",
  "MA","HD","PG","JNJ","COST","AVGO","MRK","CVX","ABBV","KO",
  "PEP","WMT","LLY","NFLX","AMD","QCOM","ADBE","GS","BA","NKE",
];

type SignalValue = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";
type FilterTab   = "all" | SignalValue;
type SortKey     = "score" | "ticker" | "price" | "change";
type SortDir     = "asc" | "desc";

interface ScanResult {
  ticker: string;
  name?: string;
  price?: number;
  changePercent?: number;
  summary?: { strongBuys: number; buys: number; neutrals: number; sells: number; strongSells: number; overall: SignalValue };
  error?: boolean;
}

function getScore(r: ScanResult) {
  if (!r.summary) return 0;
  return r.summary.strongBuys * 2 + r.summary.buys - r.summary.sells - r.summary.strongSells * 2;
}

function scoreCategory(score: number): FilterTab {
  if (score >= 3)  return "strong-buy";
  if (score >= 1)  return "buy";
  if (score === 0) return "neutral";
  if (score >= -2) return "sell";
  return "strong-sell";
}

const PILL: Record<SignalValue, string> = {
  "strong-buy":  "text-[#3fb950] bg-[#3fb95018] border-[#3fb95044]",
  "buy":         "text-[#56d364] bg-[#56d36412] border-[#56d36430]",
  "neutral":     "text-[#8b949e] bg-transparent border-[#30363d]",
  "sell":        "text-[#ff7b72] bg-[#ff7b7212] border-[#ff7b7230]",
  "strong-sell": "text-[#f85149] bg-[#f8514918] border-[#f8514944]",
};

const FILTERS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "strong-buy", label: "Strong Buy" },
  { id: "buy", label: "Buy" },
  { id: "neutral", label: "Neutral" },
  { id: "sell", label: "Sell" },
  { id: "strong-sell", label: "Strong Sell" },
];

const FILTER_ACTIVE: Record<FilterTab, string> = {
  all:           "text-white border-[#388bfd] bg-[#1f6feb22]",
  "strong-buy":  "text-[#3fb950] border-[#3fb95044] bg-[#3fb95022]",
  buy:           "text-[#56d364] border-[#56d36433] bg-[#56d36415]",
  neutral:       "text-[#8b949e] border-[#484f58] bg-[#8b949e11]",
  sell:          "text-[#f85149] border-[#f8514933] bg-[#f8514915]",
  "strong-sell": "text-[#da3633] border-[#da363344] bg-[#da363322]",
};

const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCache(tf: string): { results: ScanResult[]; scannedAt: number } | null {
  try {
    const raw = localStorage.getItem(`discover-cache-${tf}`);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.scannedAt < CACHE_TTL) return p;
    return null;
  } catch { return null; }
}

function writeCache(tf: string, results: ScanResult[]) {
  try { localStorage.setItem(`discover-cache-${tf}`, JSON.stringify({ results, scannedAt: Date.now() })); } catch { /* quota */ }
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-[#388bfd]" />
    : <ChevronDown className="w-3 h-3 text-[#388bfd]" />;
}

export default function HomeDiscover({ onSelectTicker }: Props) {
  const [tf, setTf] = useState("3M");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hydrated, setHydrated] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);

  const scan = useCallback(async (tickers: string[], timeframe: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, tf: timeframe }),
      });
      const data: ScanResult[] = await res.json();
      const valid = data.filter(r => !r.error && r.summary);
      setResults(valid);
      setScannedAt(Date.now());
      writeCache(timeframe, valid);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (!hydrated) return;
    const cached = readCache(tf);
    if (cached) { setResults(cached.results); setScannedAt(cached.scannedAt); return; }
    scan(PRESET_TICKERS, tf);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTf = (newTf: string) => {
    setTf(newTf);
    const cached = readCache(newTf);
    if (cached) { setResults(cached.results); setScannedAt(cached.scannedAt); return; }
    scan(PRESET_TICKERS, newTf);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  const counts = results.reduce<Record<FilterTab, number>>(
    (acc, r) => { const cat = scoreCategory(getScore(r)); acc[cat]++; acc.all++; return acc; },
    { all: 0, "strong-buy": 0, buy: 0, neutral: 0, sell: 0, "strong-sell": 0 }
  );

  const filtered = filter === "all" ? results : results.filter(r => scoreCategory(getScore(r)) === filter);
  const sorted = [...filtered].sort((a, b) => {
    let v = 0;
    if (sortKey === "score")  v = getScore(a) - getScore(b);
    if (sortKey === "ticker") v = a.ticker.localeCompare(b.ticker);
    if (sortKey === "price")  v = (a.price ?? 0) - (b.price ?? 0);
    if (sortKey === "change") v = (a.changePercent ?? 0) - (b.changePercent ?? 0);
    return sortDir === "asc" ? v : -v;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#388bfd] to-[#a78bfa] flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Compass className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Signal Scanner</h2>
            <p className="text-[10px] text-[#484f58]">
              {results.length > 0 ? `${results.length} stocks ranked by consensus` : "Technical indicator screening"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe */}
          <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
            {["1M","3M","6M","1Y"].map(t => (
              <button
                key={t}
                onClick={() => handleTf(t)}
                className={cn("px-3 py-1.5 text-xs font-medium transition-colors", t === tf ? "bg-[#1f6feb22] text-[#388bfd]" : "text-[#8b949e] hover:text-white")}
              >{t}</button>
            ))}
          </div>
          <button
            onClick={() => scan(PRESET_TICKERS, tf)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            {loading ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
              filter === tab.id ? FILTER_ACTIVE[tab.id] : "text-[#8b949e] border-[#21262d] hover:border-[#30363d] hover:text-white bg-transparent"
            )}
          >
            {tab.label}
            {!loading && <span className="ml-1.5 opacity-60">{counts[tab.id]}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#21262d] bg-[#0d1117] overflow-hidden">
        {loading && results.length === 0 ? (
          <div className="flex flex-col animate-pulse">
            <div className="flex items-center px-4 py-2.5 border-b border-[#21262d] bg-[#161b22] gap-4">
              {["Ticker","Price","Chg%","Score","Signals"].map(h => (
                <div key={h} className="h-2.5 w-12 rounded bg-[#21262d]" />
              ))}
            </div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center px-4 py-3 border-b border-[#161b22] gap-4">
                <div className="h-3 w-12 rounded bg-[#21262d]" />
                <div className="h-3 w-16 rounded bg-[#21262d]" />
                <div className="h-3 w-12 rounded bg-[#21262d]" />
                <div className="h-3 w-10 rounded bg-[#21262d]" />
                <div className="h-3 w-20 rounded bg-[#21262d]" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-xs text-[#484f58]">No results for this filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#21262d] bg-[#161b22]">
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
                  <th className="px-3 py-2.5 text-center">
                    <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">Signal</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const score   = getScore(r);
                  const cat     = scoreCategory(score);
                  const isUp    = (r.changePercent ?? 0) >= 0;
                  const s       = r.summary!;
                  const total   = s.strongBuys + s.buys + s.neutrals + s.sells + s.strongSells;
                  const pct     = (n: number) => total ? (n / total) * 100 : 0;

                  return (
                    <tr
                      key={r.ticker}
                      onClick={() => onSelectTicker(r.ticker)}
                      className="border-b border-[#161b22] hover:bg-[#161b22] cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-white group-hover:text-[#388bfd] transition-colors">{r.ticker}</span>
                          {r.name && <span className="text-[9px] text-[#484f58] truncate max-w-[130px]">{r.name}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">
                        {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-mono", isUp ? "text-[#3fb950]" : "text-[#f85149]")}>
                        {r.changePercent != null ? `${isUp ? "+" : ""}${r.changePercent.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-block px-2 py-0.5 rounded-md border text-xs font-bold", PILL[cat === "all" ? "neutral" : cat as SignalValue])}>
                          {score > 0 ? `+${score}` : score}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1 items-center w-20 mx-auto">
                          <div className="flex items-center gap-1 text-[9px]">
                            <span className="text-[#3fb950] font-semibold">{s.strongBuys + s.buys}B</span>
                            <span className="text-[#484f58]">{s.neutrals}N</span>
                            <span className="text-[#f85149] font-semibold">{s.sells + s.strongSells}S</span>
                          </div>
                          <div className="flex h-1 w-full rounded-full overflow-hidden">
                            <div className="bg-[#3fb950]" style={{ width: `${pct(s.strongBuys)}%` }} />
                            <div className="bg-[#56d364]" style={{ width: `${pct(s.buys)}%` }} />
                            <div className="bg-[#484f58]" style={{ width: `${pct(s.neutrals)}%` }} />
                            <div className="bg-[#ff7b72]" style={{ width: `${pct(s.sells)}%` }} />
                            <div className="bg-[#f85149]" style={{ width: `${pct(s.strongSells)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide", PILL[s.overall])}>
                          {s.overall === "strong-buy" ? "S.Buy" : s.overall === "strong-sell" ? "S.Sell" : s.overall}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && results.length > 0 && scannedAt && (
        <p className="text-[10px] text-[#484f58] text-center">
          {results.length} stocks · {tf} timeframe · Last scanned {new Date(scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Click any row to open analysis
        </p>
      )}
    </div>
  );
}
