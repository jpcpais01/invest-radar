"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronUp, ChevronDown } from "lucide-react";

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
  "strong-buy":  "text-[#5ecce8] bg-[#5ecce80a] border-[#5ecce82a]",
  "buy":         "text-[#38b2cc] bg-[#38b2cc08] border-[#38b2cc22]",
  "neutral":     "text-[#8aa4be] bg-transparent border-[#1a2540]",
  "sell":        "text-[#cc6464] bg-[#cc64640a] border-[#cc646428]",
  "strong-sell": "text-[#b05050] bg-[#b050500a] border-[#b0505038]",
};

const FILTERS: { id: FilterTab; label: string }[] = [
  { id: "all",         label: "All" },
  { id: "strong-buy",  label: "Strong Buy" },
  { id: "buy",         label: "Buy" },
  { id: "neutral",     label: "Neutral" },
  { id: "sell",        label: "Sell" },
  { id: "strong-sell", label: "Strong Sell" },
];

const FILTER_ACTIVE: Record<FilterTab, string> = {
  all:           "text-[#edf2f8] border-[#2a3858] bg-[#0e1628]",
  "strong-buy":  "text-[#5ecce8] border-[#5ecce82a] bg-[#5ecce80a]",
  buy:           "text-[#38b2cc] border-[#38b2cc33] bg-[#38b2cc0a]",
  neutral:       "text-[#8aa4be] border-[#2a3858] bg-[#0e1628]",
  sell:          "text-[#cc6464] border-[#cc646433] bg-[#cc64640a]",
  "strong-sell": "text-[#b05050] border-[#b0505044] bg-[#b050500a]",
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
    ? <ChevronUp className="w-3 h-3 text-[#38b2cc]" />
    : <ChevronDown className="w-3 h-3 text-[#38b2cc]" />;
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
        <div className="flex items-center gap-2.5">
          <span className="text-[#38b2cc] text-[8px]">◆</span>
          <div>
            <h2 className="text-sm font-semibold text-[#edf2f8] tracking-wide">Signal Scanner</h2>
            <p className="text-[9px] text-[#4a6280] mt-0.5">
              {results.length > 0 ? `${results.length} stocks · Technical consensus` : "Technical indicator screening"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe */}
          <div className="flex items-center border border-[#1a2540] rounded-md overflow-hidden">
            {["1M","3M","6M","1Y"].map(t => (
              <button
                key={t}
                onClick={() => handleTf(t)}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-semibold tracking-wide transition-colors",
                  t === tf ? "bg-[#38b2cc0a] text-[#38b2cc]" : "text-[#8aa4be] hover:text-[#edf2f8]"
                )}
              >{t}</button>
            ))}
          </div>
          <button
            onClick={() => scan(PRESET_TICKERS, tf)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold tracking-wide rounded-md border border-[#1a2540] text-[#8aa4be] hover:text-[#edf2f8] hover:border-[#2a3858] disabled:opacity-40 transition-colors"
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
              "px-2.5 py-1 rounded-full border text-[9px] font-semibold tracking-wide transition-colors",
              filter === tab.id ? FILTER_ACTIVE[tab.id] : "text-[#4a6280] border-[#1a2540] hover:border-[#2a3858] hover:text-[#8aa4be] bg-transparent"
            )}
          >
            {tab.label}
            {!loading && <span className="ml-1.5 opacity-50">{counts[tab.id]}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#1a2540] bg-[#0a1020] overflow-hidden">
        {loading && results.length === 0 ? (
          <div className="flex flex-col animate-pulse">
            <div className="flex items-center px-4 py-2.5 border-b border-[#1a2540] bg-[#0e1628] gap-4">
              {["Ticker","Price","Chg%","Score","Signals"].map(h => (
                <div key={h} className="h-2 w-12 rounded bg-[#1a2540]" />
              ))}
            </div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center px-4 py-3 border-b border-[#0e1628] gap-4">
                <div className="h-2.5 w-12 rounded bg-[#1a2540]" />
                <div className="h-2.5 w-16 rounded bg-[#1a2540]" />
                <div className="h-2.5 w-12 rounded bg-[#1a2540]" />
                <div className="h-2.5 w-10 rounded bg-[#1a2540]" />
                <div className="h-2.5 w-20 rounded bg-[#1a2540]" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-xs text-[#4a6280]">No results for this filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1a2540] bg-[#0e1628]">
                  <th className="px-4 py-2.5 text-left">
                    <button onClick={() => handleSort("ticker")} className="flex items-center gap-1 text-[9px] font-semibold text-[#4a6280] uppercase tracking-widest hover:text-[#8aa4be] transition-colors">
                      Ticker <SortIcon col="ticker" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button onClick={() => handleSort("price")} className="flex items-center gap-1 ml-auto text-[9px] font-semibold text-[#4a6280] uppercase tracking-widest hover:text-[#8aa4be] transition-colors">
                      Price <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <button onClick={() => handleSort("change")} className="flex items-center gap-1 ml-auto text-[9px] font-semibold text-[#4a6280] uppercase tracking-widest hover:text-[#8aa4be] transition-colors">
                      Chg% <SortIcon col="change" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <button onClick={() => handleSort("score")} className="flex items-center gap-1 mx-auto text-[9px] font-semibold text-[#4a6280] uppercase tracking-widest hover:text-[#8aa4be] transition-colors">
                      Score <SortIcon col="score" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <span className="text-[9px] font-semibold text-[#4a6280] uppercase tracking-widest">Signals</span>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <span className="text-[9px] font-semibold text-[#4a6280] uppercase tracking-widest">Verdict</span>
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
                      className="border-b border-[#0e1628] hover:bg-[#0e1628] cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs font-bold text-[#edf2f8] group-hover:text-[#38b2cc] transition-colors">{r.ticker}</span>
                          {r.name && <span className="text-[8px] text-[#4a6280] truncate max-w-[130px]">{r.name}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-[#edf2f8] tabular-nums">
                        {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right font-mono text-xs tabular-nums", isUp ? "text-[#38b2cc]" : "text-[#cc6464]")}>
                        {r.changePercent != null ? `${isUp ? "+" : ""}${r.changePercent.toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full border text-xs font-bold", PILL[cat === "all" ? "neutral" : cat as SignalValue])}>
                          {score > 0 ? `+${score}` : score}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1 items-center w-20 mx-auto">
                          <div className="flex items-center gap-1 text-[8px]">
                            <span className="text-[#38b2cc] font-bold">{s.strongBuys + s.buys}B</span>
                            <span className="text-[#4a6280]">{s.neutrals}N</span>
                            <span className="text-[#cc6464] font-bold">{s.sells + s.strongSells}S</span>
                          </div>
                          <div className="flex h-1 w-full rounded-sm overflow-hidden bg-[#0e1628]">
                            <div className="bg-[#5ecce8]" style={{ width: `${pct(s.strongBuys)}%` }} />
                            <div className="bg-[#38b2cc]" style={{ width: `${pct(s.buys)}%` }} />
                            <div className="bg-[#1a2e48]" style={{ width: `${pct(s.neutrals)}%` }} />
                            <div className="bg-[#cc6464]" style={{ width: `${pct(s.sells)}%` }} />
                            <div className="bg-[#b05050]" style={{ width: `${pct(s.strongSells)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-block px-1.5 py-0.5 rounded border text-[9px] font-semibold capitalize tracking-wide", PILL[s.overall])}>
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
        <p className="text-[9px] text-[#4a6280] text-center">
          {results.length} stocks · {tf} timeframe · Scanned {new Date(scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Click row to open
        </p>
      )}
    </div>
  );
}
