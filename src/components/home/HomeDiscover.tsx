"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { useTickerStore } from "@/store/tickerStore";

interface Props { onSelectTicker: (t: string) => void }

const PRESET_TICKERS = [
  // Mega-cap tech
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","AVGO","ORCL","CRM",
  "ADBE","NOW","INTU","PANW","CSCO","IBM","TXN","AMAT","LRCX","KLAC",
  "MU","INTC","QCOM","AMD","NFLX","ACN","FTNT","SNOW","PLTR","NET",
  // More tech
  "DELL","HPQ","CRWD","ZS","DDOG","MNDY","GTLB","MDB","TTD","APP",
  "MCHP","ON","SWKS","CRUS","MRVL","ARM","SMCI","KEYS","ANSS","CDNS",
  "SNPS","EPAM","OKTA","TWLO","ZM","DOCN","CFLT","HUBS","SMAR","BOX",
  // Consumer internet / fintech
  "UBER","SHOP","PYPL","COIN","SQ","ABNB","DASH","RBLX","SNAP","PINS",
  "LYFT","BKNG","EXPE","ETSY","EBAY","CHWY","W","DKNG","HOOD","SOFI",
  "AFRM","UPST","CPNG","MELI","NU","GRAB","SE","BILL","SSNC","FIS",
  // Large-cap finance
  "JPM","V","MA","GS","MS","BAC","WFC","C","AXP","BLK",
  "SCHW","COF","USB","PNC","TFC","SPGI","MCO","ICE","CME","CB",
  "AIG","PRU","MET","AFL","ALL","PGR","TRV","DFS","SYF","ALLY",
  "FITB","HBAN","KEY","RF","ZION","LNC","EQH","FNF","RJF","WRB",
  // Healthcare / biotech
  "UNH","LLY","JNJ","MRK","ABBV","TMO","ABT","BMY","AMGN","ISRG",
  "ELV","BIIB","REGN","VRTX","ZTS","DXCM","ILMN","MRNA","GILD","CVS",
  "CI","HUM","MCK","CAH","CNC","MOH","WBA","RMD","HOLX","ALGN",
  "STE","WAT","A","IQV","IDXX","EXAS","VEEV","EW","PODD","BSX",
  // Consumer staples & discretionary
  "WMT","COST","HD","PG","KO","PEP","MCD","SBUX","NKE","TGT",
  "LOW","TJX","YUM","CMG","DG","PM","MO","EL","CL","MNST",
  "LULU","ROST","BURL","ULTA","BBY","GM","F","RIVN","ANF","GPS",
  "SIG","DRI","EAT","TXRH","DINO","VFC","HBI","RL","PVH","TPR",
  // Industrials & defense
  "HON","GE","CAT","DE","MMM","RTX","LMT","NOC","GD","UPS",
  "FDX","WM","RSG","EMR","ETN","PH","ITW","ROK","CARR","OTIS",
  "BA","AXON","LDOS","BAH","CACI","KTOS","TXT","HII","ODFL","SAIA",
  "JBHT","XPO","CHRW","IR","AME","VRSK","FAST","GWW","WAB","TDG",
  // Energy
  "XOM","CVX","OXY","SLB","EOG","COP","PSX","VLO","MPC","HES",
  "HAL","BKR","DVN","FANG","MTDR","CTRA","MRO","KMI","WMB","OKE",
  // Utilities
  "NEE","DUK","SO","D","AEP","EXC","PEG","ED","AWK","WEC",
  // Real estate
  "AMT","PLD","EQIX","SPG","O","PSA","WELL","DLR","CCI","VICI",
  "EQR","AVB","UDR","CPT","ESS","INVH","SUI","ELS","NNN","GLPI",
  // International ADRs
  "TSM","ASML","SAP","NVO","AZN","BABA","JD","PDD","NIO","BIDU",
  "INFY","HDB","TTE","BP","RIO","BHP","VALE","FCX","ITUB","BBD",
  // ETFs
  "SPY","QQQ","IWM","GLD","TLT","VTI","ARKK","XLF","XLK","XLE",
  "DIA","MDY","SCHD","JEPI","VEA","EEM","GDX","SLV","BND","HYG",
];

// ── Technical scanner types ───────────────────────────────────────────────────

type SignalValue  = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";
type TechFilter   = "all" | SignalValue;
type TechSortKey  = "score" | "ticker" | "price" | "change";
type SortDir      = "asc" | "desc";

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

function scoreCategory(score: number): TechFilter {
  if (score >= 3)  return "strong-buy";
  if (score >= 1)  return "buy";
  if (score === 0) return "neutral";
  if (score >= -2) return "sell";
  return "strong-sell";
}

const PILL: Record<SignalValue, string> = {
  "strong-buy":  "text-[#d8d8e4] bg-[#d8d8e40a] border-[#d8d8e42a]",
  "buy":         "text-[#c0c0cc] bg-[#c0c0cc08] border-[#c0c0cc22]",
  "neutral":     "text-[#767676] bg-transparent border-[#1e1e1e]",
  "sell":        "text-[#ef4444] bg-[#ef44440a] border-[#ef444428]",
  "strong-sell": "text-[#dc2626] bg-[#dc26260a] border-[#dc262638]",
};

const TECH_FILTERS: { id: TechFilter; label: string }[] = [
  { id: "all",         label: "All" },
  { id: "strong-buy",  label: "Strong Buy" },
  { id: "buy",         label: "Buy" },
  { id: "neutral",     label: "Neutral" },
  { id: "sell",        label: "Sell" },
  { id: "strong-sell", label: "Strong Sell" },
];

const FILTER_ACTIVE: Record<TechFilter, string> = {
  all:           "text-[#f0f0f0] border-[#2c2c2c] bg-[#161616]",
  "strong-buy":  "text-[#d8d8e4] border-[#d8d8e42a] bg-[#d8d8e40a]",
  buy:           "text-[#c0c0cc] border-[#c0c0cc33] bg-[#c0c0cc0a]",
  neutral:       "text-[#767676] border-[#2c2c2c] bg-[#161616]",
  sell:          "text-[#ef4444] border-[#ef444433] bg-[#ef44440a]",
  "strong-sell": "text-[#dc2626] border-[#dc262644] bg-[#dc26260a]",
};

// ── Fair price scanner types ───────────────────────────────────────────────────

type FPFilter   = "all" | "undervalued" | "fair" | "overvalued";
type FPSortKey  = "upside" | "ticker" | "price" | "change";

interface FPResult {
  ticker: string;
  name?: string;
  price: number;
  changePercent?: number;
  fairPrice: number;
  upside: number;
  lynchVal: number | null;
  peVal: number | null;
  dcfVal: number | null;
  modelsUsed: number;
}

function fpCategory(upside: number): FPFilter {
  if (upside >= 15) return "undervalued";
  if (upside >= 0)  return "fair";
  return "overvalued";
}

function upsideColor(pct: number) {
  if (pct >= 15) return "#c0c0cc";
  if (pct >= 0)  return "#767676";
  return "#ef4444";
}

const FP_FILTERS: { id: FPFilter; label: string }[] = [
  { id: "all",         label: "All" },
  { id: "undervalued", label: "Undervalued" },
  { id: "fair",        label: "Fair" },
  { id: "overvalued",  label: "Overvalued" },
];

const FP_FILTER_ACTIVE: Record<FPFilter, string> = {
  all:         "text-[#f0f0f0] border-[#2c2c2c] bg-[#161616]",
  undervalued: "text-[#c0c0cc] border-[#c0c0cc33] bg-[#c0c0cc0a]",
  fair:        "text-[#767676] border-[#2c2c2c] bg-[#161616]",
  overvalued:  "text-[#ef4444] border-[#ef444433] bg-[#ef44440a]",
};

// ── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCache<T>(key: string): { results: T[]; scannedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.scannedAt < CACHE_TTL) return p;
    return null;
  } catch { return null; }
}

function writeCache<T>(key: string, results: T[]) {
  try { localStorage.setItem(key, JSON.stringify({ results, scannedAt: Date.now() })); } catch { /* quota */ }
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon<K extends string>({ col, sortKey, sortDir }: { col: K; sortKey: K; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-[#c0c0cc]" />
    : <ChevronDown className="w-3 h-3 text-[#c0c0cc]" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeDiscover({ onSelectTicker }: Props) {
  const { watchlist } = useTickerStore();
  const allTickers = useMemo(
    () => [...new Set([...watchlist, ...PRESET_TICKERS])],
    [watchlist]
  );

  const [mode, setMode] = useState<"technical" | "fairprice">("technical");

  // ── Technical state ──────────────────────────────────────────────────────
  const [tf, setTf]               = useState("3M");
  const [techResults, setTechResults] = useState<ScanResult[]>([]);
  const [techLoading, setTechLoading] = useState(false);
  const [techScannedAt, setTechScannedAt] = useState<number | null>(null);
  const [techFilter, setTechFilter] = useState<TechFilter>("all");
  const [techSortKey, setTechSortKey] = useState<TechSortKey>("score");
  const [techSortDir, setTechSortDir] = useState<SortDir>("desc");

  // ── Fair price state ─────────────────────────────────────────────────────
  const [fpResults, setFpResults]   = useState<FPResult[]>([]);
  const [fpLoading, setFpLoading]   = useState(false);
  const [fpScannedAt, setFpScannedAt] = useState<number | null>(null);
  const [fpFilter, setFpFilter]     = useState<FPFilter>("all");
  const [fpSortKey, setFpSortKey]   = useState<FPSortKey>("upside");
  const [fpSortDir, setFpSortDir]   = useState<SortDir>("desc");

  const [hydrated, setHydrated] = useState(false);

  // ── Scan functions ────────────────────────────────────────────────────────

  const scanTech = useCallback(async (tickers: string[], timeframe: string) => {
    setTechLoading(true);
    try {
      const res  = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers, tf: timeframe }),
      });
      const data: ScanResult[] = await res.json();
      const valid = data.filter(r => !r.error && r.summary);
      setTechResults(valid);
      setTechScannedAt(Date.now());
      writeCache(`discover-tech-${timeframe}`, valid);
    } finally {
      setTechLoading(false);
    }
  }, []);

  const scanFairPrice = useCallback(async (tickers: string[]) => {
    setFpLoading(true);
    try {
      const res  = await fetch("/api/market/fair-price-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data: FPResult[] = await res.json();
      setFpResults(data);
      setFpScannedAt(Date.now());
      writeCache("discover-fp", data);
    } finally {
      setFpLoading(false);
    }
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (!hydrated) return;
    const cached = readCache<ScanResult>(`discover-tech-${tf}`);
    if (cached) { setTechResults(cached.results); setTechScannedAt(cached.scannedAt); }
    else scanTech(allTickers, tf);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModeSwitch = (next: "technical" | "fairprice") => {
    setMode(next);
    if (next === "fairprice" && fpResults.length === 0 && !fpLoading) {
      const cached = readCache<FPResult>("discover-fp");
      if (cached) { setFpResults(cached.results); setFpScannedAt(cached.scannedAt); }
      else scanFairPrice(allTickers);
    }
  };

  const handleTf = (newTf: string) => {
    setTf(newTf);
    const cached = readCache<ScanResult>(`discover-tech-${newTf}`);
    if (cached) { setTechResults(cached.results); setTechScannedAt(cached.scannedAt); }
    else scanTech(allTickers, newTf);
  };

  const handleTechSort = (key: TechSortKey) => {
    if (techSortKey === key) setTechSortDir(d => d === "asc" ? "desc" : "asc");
    else { setTechSortKey(key); setTechSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  const handleFpSort = (key: FPSortKey) => {
    if (fpSortKey === key) setFpSortDir(d => d === "asc" ? "desc" : "asc");
    else { setFpSortKey(key); setFpSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const techCounts = techResults.reduce<Record<TechFilter, number>>(
    (acc, r) => { const cat = scoreCategory(getScore(r)); acc[cat]++; acc.all++; return acc; },
    { all: 0, "strong-buy": 0, buy: 0, neutral: 0, sell: 0, "strong-sell": 0 }
  );

  const techFiltered = techFilter === "all"
    ? techResults
    : techResults.filter(r => scoreCategory(getScore(r)) === techFilter);

  const techSorted = [...techFiltered].sort((a, b) => {
    let v = 0;
    if (techSortKey === "score")  v = getScore(a) - getScore(b);
    if (techSortKey === "ticker") v = a.ticker.localeCompare(b.ticker);
    if (techSortKey === "price")  v = (a.price ?? 0) - (b.price ?? 0);
    if (techSortKey === "change") v = (a.changePercent ?? 0) - (b.changePercent ?? 0);
    return techSortDir === "asc" ? v : -v;
  });

  const fpCounts = fpResults.reduce<Record<FPFilter, number>>(
    (acc, r) => { acc[fpCategory(r.upside)]++; acc.all++; return acc; },
    { all: 0, undervalued: 0, fair: 0, overvalued: 0 }
  );

  const fpFiltered = fpFilter === "all"
    ? fpResults
    : fpResults.filter(r => fpCategory(r.upside) === fpFilter);

  const fpSorted = [...fpFiltered].sort((a, b) => {
    let v = 0;
    if (fpSortKey === "upside")  v = a.upside - b.upside;
    if (fpSortKey === "ticker")  v = a.ticker.localeCompare(b.ticker);
    if (fpSortKey === "price")   v = a.price - b.price;
    if (fpSortKey === "change")  v = (a.changePercent ?? 0) - (b.changePercent ?? 0);
    return fpSortDir === "asc" ? v : -v;
  });

  const loading    = mode === "technical" ? techLoading : fpLoading;
  const scannedAt  = mode === "technical" ? techScannedAt : fpScannedAt;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-[#c0c0cc] text-[8px]">◆</span>
          <div>
            <h2 className="text-sm font-semibold text-[#f0f0f0] tracking-wide">
              {mode === "technical" ? "Signal Scanner" : "Fair Price Scanner"}
            </h2>
            <p className="text-[9px] text-[#3a3a3a] mt-0.5">
              {mode === "technical"
                ? techResults.length > 0 ? `${techResults.length} stocks · Technical consensus` : "Technical indicator screening"
                : fpResults.length > 0  ? `${fpResults.length} stocks · Ranked by upside to fair price` : "Valuation screening"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode toggle */}
          <div className="flex items-center border border-[#1e1e1e] rounded-md overflow-hidden">
            <button
              onClick={() => handleModeSwitch("technical")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-semibold tracking-wide transition-colors",
                mode === "technical" ? "bg-[#c0c0cc0a] text-[#c0c0cc]" : "text-[#767676] hover:text-[#f0f0f0]"
              )}
            >Technical</button>
            <button
              onClick={() => handleModeSwitch("fairprice")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-semibold tracking-wide transition-colors",
                mode === "fairprice" ? "bg-[#c0c0cc0a] text-[#c0c0cc]" : "text-[#767676] hover:text-[#f0f0f0]"
              )}
            >Fair Price</button>
          </div>

          {/* Timeframe — only for technical */}
          {mode === "technical" && (
            <div className="flex items-center border border-[#1e1e1e] rounded-md overflow-hidden">
              {["1M","3M","6M","1Y"].map(t => (
                <button
                  key={t}
                  onClick={() => handleTf(t)}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-semibold tracking-wide transition-colors",
                    t === tf ? "bg-[#c0c0cc0a] text-[#c0c0cc]" : "text-[#767676] hover:text-[#f0f0f0]"
                  )}
                >{t}</button>
              ))}
            </div>
          )}

          {/* Rescan */}
          <button
            onClick={() => mode === "technical" ? scanTech(allTickers, tf) : scanFairPrice(allTickers)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold tracking-wide rounded-md border border-[#1e1e1e] text-[#767676] hover:text-[#f0f0f0] hover:border-[#2c2c2c] disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            {loading ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      {/* ── TECHNICAL MODE ──────────────────────────────────────────────────── */}
      {mode === "technical" && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {TECH_FILTERS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setTechFilter(tab.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full border text-[9px] font-semibold tracking-wide transition-colors",
                  techFilter === tab.id
                    ? FILTER_ACTIVE[tab.id]
                    : "text-[#3a3a3a] border-[#1e1e1e] hover:border-[#2c2c2c] hover:text-[#767676] bg-transparent"
                )}
              >
                {tab.label}
                {!techLoading && <span className="ml-1.5 opacity-50">{techCounts[tab.id]}</span>}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-[#1e1e1e] bg-[#101010] overflow-hidden">
            {techLoading && techResults.length === 0 ? (
              <SkeletonRows cols={5} />
            ) : techSorted.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e1e1e] bg-[#161616]">
                      <Th onClick={() => handleTechSort("ticker")}>Ticker <SortIcon col="ticker" sortKey={techSortKey} sortDir={techSortDir} /></Th>
                      <Th right onClick={() => handleTechSort("price")}>Price <SortIcon col="price" sortKey={techSortKey} sortDir={techSortDir} /></Th>
                      <Th right onClick={() => handleTechSort("change")}>Chg% <SortIcon col="change" sortKey={techSortKey} sortDir={techSortDir} /></Th>
                      <Th center onClick={() => handleTechSort("score")}>Score <SortIcon col="score" sortKey={techSortKey} sortDir={techSortDir} /></Th>
                      <Th center>Signals</Th>
                      <Th center>Verdict</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {techSorted.map(r => {
                      const score = getScore(r);
                      const cat   = scoreCategory(score);
                      const isUp  = (r.changePercent ?? 0) >= 0;
                      const s     = r.summary!;
                      const total = s.strongBuys + s.buys + s.neutrals + s.sells + s.strongSells;
                      const pct   = (n: number) => total ? (n / total) * 100 : 0;
                      return (
                        <tr key={r.ticker} onClick={() => onSelectTicker(r.ticker)}
                          className="border-b border-[#161616] hover:bg-[#161616] cursor-pointer transition-colors group">
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-bold text-[#f0f0f0] group-hover:text-[#c0c0cc] transition-colors">{r.ticker}</span>
                              {r.name && <span className="text-[8px] text-[#3a3a3a] truncate max-w-[130px]">{r.name}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-[#f0f0f0] tabular-nums">
                            {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                          </td>
                          <td className={cn("px-3 py-2.5 text-right font-mono text-xs tabular-nums", isUp ? "text-[#c0c0cc]" : "text-[#ef4444]")}>
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
                                <span className="text-[#c0c0cc] font-bold">{s.strongBuys + s.buys}B</span>
                                <span className="text-[#3a3a3a]">{s.neutrals}N</span>
                                <span className="text-[#ef4444] font-bold">{s.sells + s.strongSells}S</span>
                              </div>
                              <div className="flex h-1 w-full rounded-sm overflow-hidden bg-[#161616]">
                                <div className="bg-[#d8d8e4]" style={{ width: `${pct(s.strongBuys)}%` }} />
                                <div className="bg-[#c0c0cc]"  style={{ width: `${pct(s.buys)}%` }} />
                                <div className="bg-[#252525]"  style={{ width: `${pct(s.neutrals)}%` }} />
                                <div className="bg-[#ef4444]"  style={{ width: `${pct(s.sells)}%` }} />
                                <div className="bg-[#dc2626]"  style={{ width: `${pct(s.strongSells)}%` }} />
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
        </>
      )}

      {/* ── FAIR PRICE MODE ─────────────────────────────────────────────────── */}
      {mode === "fairprice" && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FP_FILTERS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFpFilter(tab.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full border text-[9px] font-semibold tracking-wide transition-colors",
                  fpFilter === tab.id
                    ? FP_FILTER_ACTIVE[tab.id]
                    : "text-[#3a3a3a] border-[#1e1e1e] hover:border-[#2c2c2c] hover:text-[#767676] bg-transparent"
                )}
              >
                {tab.label}
                {!fpLoading && <span className="ml-1.5 opacity-50">{fpCounts[tab.id]}</span>}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-[#1e1e1e] bg-[#101010] overflow-hidden">
            {fpLoading && fpResults.length === 0 ? (
              <SkeletonRows cols={6} />
            ) : fpSorted.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1e1e1e] bg-[#161616]">
                      <Th onClick={() => handleFpSort("ticker")}>Ticker <SortIcon col="ticker" sortKey={fpSortKey} sortDir={fpSortDir} /></Th>
                      <Th right onClick={() => handleFpSort("price")}>Price <SortIcon col="price" sortKey={fpSortKey} sortDir={fpSortDir} /></Th>
                      <Th right onClick={() => handleFpSort("change")}>Chg% <SortIcon col="change" sortKey={fpSortKey} sortDir={fpSortDir} /></Th>
                      <Th right onClick={() => handleFpSort("upside")}>Fair Price <SortIcon col="upside" sortKey={fpSortKey} sortDir={fpSortDir} /></Th>
                      <Th right onClick={() => handleFpSort("upside")}>Upside <SortIcon col="upside" sortKey={fpSortKey} sortDir={fpSortDir} /></Th>
                      <Th center>Models</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {fpSorted.map(r => {
                      const isUp  = (r.changePercent ?? 0) >= 0;
                      const color = upsideColor(r.upside);
                      return (
                        <tr key={r.ticker} onClick={() => onSelectTicker(r.ticker)}
                          className="border-b border-[#161616] hover:bg-[#161616] cursor-pointer transition-colors group">
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-bold text-[#f0f0f0] group-hover:text-[#c0c0cc] transition-colors">{r.ticker}</span>
                              {r.name && <span className="text-[8px] text-[#3a3a3a] truncate max-w-[130px]">{r.name}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-[#f0f0f0] tabular-nums">
                            ${r.price.toFixed(2)}
                          </td>
                          <td className={cn("px-3 py-2.5 text-right font-mono text-xs tabular-nums", isUp ? "text-[#c0c0cc]" : "text-[#ef4444]")}>
                            {r.changePercent != null ? `${isUp ? "+" : ""}${r.changePercent.toFixed(2)}%` : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-[#f0f0f0] tabular-nums">
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
              </div>
            )}
          </div>
        </>
      )}

      {!loading && (techResults.length > 0 || fpResults.length > 0) && scannedAt && (
        <p className="text-[9px] text-[#3a3a3a] text-center">
          {mode === "technical"
            ? `${techResults.length} stocks · ${tf} timeframe · Scanned ${new Date(scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Click row to open`
            : `${fpResults.length} stocks · Lynch + P/E + DCF avg · Scanned ${new Date(scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Click row to open`
          }
        </p>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Th({ children, right, center, onClick }: {
  children: React.ReactNode; right?: boolean; center?: boolean; onClick?: () => void
}) {
  const cls = cn(
    "px-3 py-2.5 text-[9px] font-semibold text-[#3a3a3a] uppercase tracking-widest",
    right ? "text-right" : center ? "text-center" : "text-left"
  );
  return onClick ? (
    <th className={cls}>
      <button onClick={onClick} className={cn("flex items-center gap-1 hover:text-[#767676] transition-colors", right ? "ml-auto" : center ? "mx-auto" : "")}>
        {children}
      </button>
    </th>
  ) : (
    <th className={cls}>{children}</th>
  );
}

function ModelDot({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn(
      "w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold",
      active ? "bg-[#c0c0cc15] text-[#c0c0cc] border border-[#c0c0cc30]" : "bg-transparent text-[#2c2c2c] border border-[#1e1e1e]"
    )}>{label}</span>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="flex items-center px-4 py-2.5 border-b border-[#1e1e1e] bg-[#161616] gap-4">
        {Array.from({ length: cols }).map((_, i) => <div key={i} className="h-2 w-12 rounded bg-[#1e1e1e]" />)}
      </div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center px-4 py-3 border-b border-[#161616] gap-4">
          {Array.from({ length: cols }).map((_, j) => <div key={j} className="h-2.5 rounded bg-[#1e1e1e]" style={{ width: j === 0 ? 48 : 40 }} />)}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-xs text-[#3a3a3a]">No results for this filter</p>
    </div>
  );
}
