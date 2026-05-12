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
  "strong-buy":  "text-[#00ff8a] bg-[#00ff8a0e] border-[#00ff8a33]",
  "buy":         "text-[#00e87c] bg-[#00e87c0a] border-[#00e87c28]",
  "neutral":     "text-[#5a9e7a] bg-transparent border-[#152b1e]",
  "sell":        "text-[#ff4545] bg-[#ff45450a] border-[#ff454530]",
  "strong-sell": "text-[#ff2020] bg-[#ff20200e] border-[#ff202040]",
};

const FILTERS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "strong-buy", label: "S.BUY" },
  { id: "buy", label: "BUY" },
  { id: "neutral", label: "NEUTRAL" },
  { id: "sell", label: "SELL" },
  { id: "strong-sell", label: "S.SELL" },
];

const FILTER_ACTIVE: Record<FilterTab, string> = {
  all:           "text-[#c8edd8] border-[#00e87c44] bg-[#00e87c0a]",
  "strong-buy":  "text-[#00ff8a] border-[#00ff8a44] bg-[#00ff8a0e]",
  buy:           "text-[#00e87c] border-[#00e87c33] bg-[#00e87c0a]",
  neutral:       "text-[#5a9e7a] border-[#5a9e7a44] bg-[#5a9e7a0a]",
  sell:          "text-[#ff4545] border-[#ff454533] bg-[#ff45450a]",
  "strong-sell": "text-[#ff2020] border-[#ff202044] bg-[#ff20200e]",
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
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#00e87c] tracking-widest">// </span>
              <h2 className="font-mono text-sm font-bold text-[#c8edd8] tracking-wider">SIGNAL SCANNER</h2>
            </div>
            <p className="font-mono text-[9px] text-[#2d5040] tracking-wide">
              {results.length > 0 ? `${results.length} STOCKS · TECHNICAL CONSENSUS` : "TECHNICAL INDICATOR SCREENING"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe */}
          <div className="flex items-center bg-[#0a1610] border border-[#152b1e] rounded overflow-hidden">
            {["1M","3M","6M","1Y"].map(t => (
              <button
                key={t}
                onClick={() => handleTf(t)}
                className={cn("px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider transition-colors", t === tf ? "bg-[#00e87c0a] text-[#00e87c]" : "text-[#5a9e7a] hover:text-[#c8edd8]")}
              >{t}</button>
            ))}
          </div>
          <button
            onClick={() => scan(PRESET_TICKERS, tf)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider rounded border border-[#152b1e] bg-[#0a1610] text-[#5a9e7a] hover:text-[#c8edd8] hover:border-[#1e4030] disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            {loading ? "SCANNING…" : "RESCAN"}
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
              "px-2.5 py-1 rounded border font-mono text-[9px] font-bold tracking-widest transition-colors",
              filter === tab.id ? FILTER_ACTIVE[tab.id] : "text-[#2d5040] border-[#152b1e] hover:border-[#1e4030] hover:text-[#5a9e7a] bg-transparent"
            )}
          >
            {tab.label}
            {!loading && <span className="ml-1.5 opacity-50">{counts[tab.id]}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded border border-[#152b1e] bg-[#060d09] overflow-hidden">
        {loading && results.length === 0 ? (
          <div className="flex flex-col animate-pulse">
            <div className="flex items-center px-4 py-2.5 border-b border-[#152b1e] bg-[#0a1610] gap-4">
              {["Ticker","Price","Chg%","Score","Signals"].map(h => (
                <div key={h} className="h-2 w-12 rounded bg-[#152b1e]" />
              ))}
            </div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center px-4 py-3 border-b border-[#0a1610] gap-4">
                <div className="h-2.5 w-12 rounded bg-[#152b1e]" />
                <div className="h-2.5 w-16 rounded bg-[#152b1e]" />
                <div className="h-2.5 w-12 rounded bg-[#152b1e]" />
                <div className="h-2.5 w-10 rounded bg-[#152b1e]" />
                <div className="h-2.5 w-20 rounded bg-[#152b1e]" />
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
                <tr className="border-b border-[#152b1e] bg-[#0a1610]">
                  <th className="px-4 py-2.5 text-left">
                    <button onClick={() => handleSort("ticker")} className="flex items-center gap-1 font-mono text-[9px] font-bold text-[#2d5040] uppercase tracking-widest hover:text-[#5a9e7a] transition-colors">
                      TICKER <SortIcon col="ticker" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button onClick={() => handleSort("price")} className="flex items-center gap-1 ml-auto font-mono text-[9px] font-bold text-[#2d5040] uppercase tracking-widest hover:text-[#5a9e7a] transition-colors">
                      PRICE <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button onClick={() => handleSort("change")} className="flex items-center gap-1 ml-auto font-mono text-[9px] font-bold text-[#2d5040] uppercase tracking-widest hover:text-[#5a9e7a] transition-colors">
                      CHG% <SortIcon col="change" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <button onClick={() => handleSort("score")} className="flex items-center gap-1 mx-auto font-mono text-[9px] font-bold text-[#2d5040] uppercase tracking-widest hover:text-[#5a9e7a] transition-colors">
                      SCORE <SortIcon col="score" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <span className="font-mono text-[9px] font-bold text-[#2d5040] uppercase tracking-widest">SIGNALS</span>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <span className="font-mono text-[9px] font-bold text-[#2d5040] uppercase tracking-widest">VERDICT</span>
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
                      className="border-b border-[#0a1610] hover:bg-[#0a1610] cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs font-bold text-[#c8edd8] group-hover:text-[#00e87c] transition-colors">{r.ticker}</span>
                          {r.name && <span className="font-mono text-[8px] text-[#2d5040] truncate max-w-[130px]">{r.name}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-[#c8edd8] tabular-nums">
                        {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-mono text-xs tabular-nums", isUp ? "text-[#00e87c]" : "text-[#ff4545]")}>
                        {r.changePercent != null ? `${isUp ? "+" : ""}${r.changePercent.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-block px-2 py-0.5 rounded-md border text-xs font-bold", PILL[cat === "all" ? "neutral" : cat as SignalValue])}>
                          {score > 0 ? `+${score}` : score}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1 items-center w-20 mx-auto">
                          <div className="flex items-center gap-1 font-mono text-[8px]">
                            <span className="text-[#00e87c] font-bold">{s.strongBuys + s.buys}B</span>
                            <span className="text-[#2d5040]">{s.neutrals}N</span>
                            <span className="text-[#ff4545] font-bold">{s.sells + s.strongSells}S</span>
                          </div>
                          <div className="flex h-1 w-full rounded-sm overflow-hidden" style={{ background: "#0f2218" }}>
                            <div className="bg-[#00ff8a]" style={{ width: `${pct(s.strongBuys)}%` }} />
                            <div className="bg-[#00e87c]" style={{ width: `${pct(s.buys)}%` }} />
                            <div className="bg-[#2d5040]" style={{ width: `${pct(s.neutrals)}%` }} />
                            <div className="bg-[#ff4545]" style={{ width: `${pct(s.sells)}%` }} />
                            <div className="bg-[#ff2020]" style={{ width: `${pct(s.strongSells)}%` }} />
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
        <p className="font-mono text-[8px] text-[#2d5040] text-center tracking-widest">
          {results.length} STOCKS · {tf} TIMEFRAME · SCANNED {new Date(scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · CLICK ROW TO OPEN
        </p>
      )}
    </div>
  );
}
