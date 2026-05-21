"use client";
import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTickerStore } from "@/store/tickerStore";
import { Quote, OHLCVBar } from "@/types/market";
import { ScanSearch, ArrowLeft, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── types ─────────────────────────────────────────────────── */
type SortKey = "ticker" | "price" | "day" | "week" | "month";
type SortDir = "asc" | "desc";

interface RowData {
  ticker: string;
  name?: string;
  price: number;
  day: number;      // daily % change
  week: number;     // 7-day % change
  month: number;    // 1-month % change
  sparkline: number[]; // 1M close prices for sparkline
  isLoading: boolean;
}

/* ─── sparkline SVG ─────────────────────────────────────────── */
function Sparkline({ values, change }: { values: number[]; change: number }) {
  if (!values || values.length < 2) {
    return <div className="w-[88px] h-[32px] flex items-center justify-center"><span className="text-[#3a3a3a] text-[9px]">—</span></div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 88, H = 32, pad = 2;

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = pts.join(" ");
  const color = change >= 0 ? "#4ade80" : "#f87171";
  const fillColor = change >= 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)";

  // Close path for fill
  const lastPt = pts[pts.length - 1];
  const firstX = pad;
  const lastX = (pad + ((values.length - 1) / (values.length - 1)) * (W - pad * 2)).toFixed(1);
  const fillPts = `${firstX},${H} ${polyline} ${lastX},${H}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polygon points={fillPts} fill={fillColor} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* last dot */}
      <circle
        cx={parseFloat(pts[pts.length - 1].split(",")[0])}
        cy={parseFloat(pts[pts.length - 1].split(",")[1])}
        r="2.5"
        fill={color}
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  );
}

/* ─── pct badge ─────────────────────────────────────────────── */
function PctBadge({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const isPos = value > 0;
  const isNeg = value < 0;
  const color = isPos ? "#4ade80" : isNeg ? "#f87171" : "#767676";
  const bg    = isPos ? "rgba(74,222,128,0.08)" : isNeg ? "rgba(248,113,113,0.08)" : "transparent";
  const border= isPos ? "rgba(74,222,128,0.20)" : isNeg ? "rgba(248,113,113,0.20)" : "#2c2c2c";
  const Icon  = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const text  = `${isPos ? "+" : ""}${value.toFixed(2)}%`;

  return (
    <span
      className={cn("inline-flex items-center gap-1 font-mono font-semibold rounded-md px-2 py-0.5 border whitespace-nowrap", size === "sm" ? "text-[10px]" : "text-xs")}
      style={{ color, background: bg, borderColor: border }}
    >
      <Icon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {text}
    </span>
  );
}

/* ─── sort header cell ──────────────────────────────────────── */
function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-4 py-3 text-left cursor-pointer select-none group"
    >
      <div className="flex items-center gap-1">
        <span className={cn("text-[10px] font-semibold uppercase tracking-widest transition-colors",
          active ? "text-[#fbbf24]" : "text-[#3a3a3a] group-hover:text-[#767676]")}
        >{label}</span>
        {active
          ? sortDir === "desc"
            ? <ArrowDown className="w-3 h-3 text-[#fbbf24]" />
            : <ArrowUp className="w-3 h-3 text-[#fbbf24]" />
          : <ArrowUp className="w-3 h-3 text-[#2c2c2c] group-hover:text-[#3a3a3a]" />
        }
      </div>
    </th>
  );
}

/* ─── skeleton row ──────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <tr className="border-b border-[#161616]">
      {[44, 80, 64, 64, 64, 88].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 rounded animate-pulse bg-[#1a1a1a]" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

/* ─── main page ─────────────────────────────────────────────── */
export default function ScreenerPage() {
  const { watchlist } = useTickerStore();
  const [sortKey, setSortKey] = useState<SortKey>("day");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* parallel fetch: quote + 1M history for each ticker */
  const quoteResults = useQueries({
    queries: watchlist.map((t) => ({
      queryKey: ["quote", t],
      queryFn: () => fetch(`/api/market/quote/${t}`).then((r) => r.json()) as Promise<Quote>,
      staleTime: 30_000,
    })),
  });

  const histResults = useQueries({
    queries: watchlist.map((t) => ({
      queryKey: ["history-screener", t],
      queryFn: () =>
        fetch(`/api/market/history/${t}?tf=1M`).then((r) => r.json()) as Promise<{ bars: OHLCVBar[] }>,
      staleTime: 60_000,
    })),
  });

  /* assemble rows */
  const rows: RowData[] = useMemo(() => {
    return watchlist.map((ticker, i) => {
      const q = quoteResults[i];
      const h = histResults[i];

      const isLoading = q.isLoading || h.isLoading;
      const quote: Quote | undefined = q.data;
      const bars: OHLCVBar[] = h.data?.bars ?? [];

      // sparkline: every bar's close
      const closes = bars.map((b) => b.close);

      // 7D: last 5 trading days vs now
      const weekBars = bars.slice(-5);
      const weekChange =
        weekBars.length >= 2
          ? ((weekBars[weekBars.length - 1].close - weekBars[0].open) / weekBars[0].open) * 100
          : 0;

      // 1M: first bar open vs last bar close
      const monthChange =
        bars.length >= 2
          ? ((bars[bars.length - 1].close - bars[0].open) / bars[0].open) * 100
          : 0;

      return {
        ticker,
        name: quote?.name,
        price: quote?.price ?? 0,
        day: quote?.changePercent ?? 0,
        week: weekChange,
        month: monthChange,
        sparkline: closes,
        isLoading,
      };
    });
  }, [watchlist, quoteResults, histResults]);

  /* sort */
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "ticker": diff = a.ticker.localeCompare(b.ticker); break;
        case "price":  diff = a.price - b.price; break;
        case "day":    diff = a.day - b.day; break;
        case "week":   diff = a.week - b.week; break;
        case "month":  diff = a.month - b.month; break;
      }
      return sortDir === "desc" ? -diff : diff;
    });
  }, [rows, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  /* summary stats */
  const loadedRows = rows.filter((r) => !r.isLoading && r.price > 0);
  const gainers = loadedRows.filter((r) => r.day > 0).length;
  const losers  = loadedRows.filter((r) => r.day < 0).length;
  const avgDay  = loadedRows.length ? loadedRows.reduce((s, r) => s + r.day, 0) / loadedRows.length : 0;

  const isAllLoaded = rows.every((r) => !r.isLoading);

  return (
    <div
      className="min-h-screen text-[#f0f0f0]"
      style={{ background: "#080808", scrollbarWidth: "thin", scrollbarColor: "#1e1e1e transparent" }}
    >
      {/* ── header ── */}
      <header
        className="sticky top-0 z-40 border-b border-[#1e1e1e]"
        style={{ background: "rgba(8,8,8,0.94)", backdropFilter: "blur(12px)" }}
      >
        {/* scan beam keyframes */}
        <style>{`
          @keyframes scanSweepPage {
            0%   { transform: translateX(-120%); opacity: 0; }
            12%  { opacity: 1; }
            88%  { opacity: 1; }
            100% { transform: translateX(2400%); opacity: 0; }
          }
          @keyframes amberPulse {
            0%, 100% { opacity: 0.5; }
            50%       { opacity: 1.0; }
          }
        `}</style>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 text-[#767676] hover:text-[#f0f0f0] transition-colors shrink-0 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-medium hidden sm:inline">Home</span>
          </a>

          <div className="h-4 w-px bg-[#2c2c2c]" />

          {/* title badge */}
          <div
            className="relative overflow-hidden flex items-center gap-2 px-3 py-1.5 rounded-md border shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(120,80,0,0.18) 0%, rgba(90,58,0,0.12) 50%, rgba(120,80,0,0.10) 100%)",
              border: "1px solid rgba(251,191,36,0.30)",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(251,191,36,0.04) 1px, transparent 1px), " +
                  "linear-gradient(90deg, rgba(251,191,36,0.04) 1px, transparent 1px)",
                backgroundSize: "7px 7px",
              }}
            />
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                width: "28%",
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.18) 40%, rgba(251,191,36,0.32) 50%, rgba(251,191,36,0.18) 60%, transparent 100%)",
                animation: "scanSweepPage 3s ease-in-out infinite",
                animationDelay: "0.6s",
              }}
            />
            <ScanSearch
              className="w-4 h-4 relative z-10 shrink-0"
              style={{ filter: "drop-shadow(0 0 5px rgba(251,191,36,0.65))", color: "#fbbf24" }}
            />
            <span
              className="relative z-10 text-sm font-semibold"
              style={{ color: "#fbbf24", textShadow: "0 0 12px rgba(251,191,36,0.35)" }}
            >
              Screener
            </span>
          </div>

          {/* summary chips */}
          {isAllLoaded && loadedRows.length > 0 && (
            <div className="flex items-center gap-2 ml-auto text-[10px] font-semibold flex-wrap justify-end">
              <span className="text-[#3a3a3a]">{watchlist.length} tickers</span>
              <span className="w-px h-3 bg-[#2c2c2c]" />
              <span className="text-[#4ade80]">▲ {gainers} up</span>
              <span className="text-[#f87171]">▼ {losers} down</span>
              <span className="w-px h-3 bg-[#2c2c2c]" />
              <span className={avgDay >= 0 ? "text-[#4ade80]" : "text-[#f87171]"}>
                Avg {avgDay >= 0 ? "+" : ""}{avgDay.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── main ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16">

        {/* ── market heatmap strip ── */}
        {isAllLoaded && loadedRows.length > 0 && (
          <div className="mb-6 flex gap-2 flex-wrap">
            {sorted.map((row) => {
              const abs = Math.abs(row.day);
              const intensity = Math.min(abs / 5, 1); // 5% = max intensity
              const bg = row.day > 0
                ? `rgba(74,222,128,${0.06 + intensity * 0.18})`
                : row.day < 0
                ? `rgba(248,113,113,${0.06 + intensity * 0.18})`
                : "rgba(255,255,255,0.03)";
              const border = row.day > 0
                ? `rgba(74,222,128,${0.15 + intensity * 0.3})`
                : row.day < 0
                ? `rgba(248,113,113,${0.15 + intensity * 0.3})`
                : "#2c2c2c";
              const color = row.day > 0 ? "#4ade80" : row.day < 0 ? "#f87171" : "#767676";

              return (
                <div
                  key={row.ticker}
                  className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border cursor-pointer hover:scale-105 transition-transform"
                  style={{ background: bg, borderColor: border, minWidth: 64 }}
                  onClick={() => {
                    useTickerStore.getState().setActiveTicker(row.ticker);
                    window.location.href = "/";
                  }}
                >
                  <span className="text-[10px] font-bold text-[#f0f0f0] tracking-wide">{row.ticker}</span>
                  <span className="text-[10px] font-semibold font-mono" style={{ color }}>
                    {row.day >= 0 ? "+" : ""}{row.day.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── table ── */}
        <div className="rounded-xl border border-[#1e1e1e] overflow-hidden" style={{ background: "#0c0c0c" }}>

          {/* amber top border glow */}
          <div className="h-px" style={{ background: "linear-gradient(90deg, transparent 5%, rgba(251,191,36,0.35) 50%, transparent 95%)" }} />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#161616]" style={{ background: "#0a0a0a" }}>
                  <SortTh label="Ticker" col="ticker" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Price"  col="price"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Day %"  col="day"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="7D %"   col="week"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="1M %"   col="month"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3a3a3a]">1M Chart</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!isAllLoaded && watchlist.map((t) => <SkeletonRow key={t} />)}

                {isAllLoaded && sorted.map((row, idx) => (
                  <tr
                    key={row.ticker}
                    className="border-b border-[#111] hover:bg-[#ffffff04] transition-colors cursor-pointer group"
                    style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)" }}
                    onClick={() => {
                      useTickerStore.getState().setActiveTicker(row.ticker);
                      window.location.href = "/";
                    }}
                  >
                    {/* ticker + name */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-[#f0f0f0] font-mono group-hover:text-[#fbbf24] transition-colors">
                          {row.ticker}
                        </span>
                        {row.name && (
                          <span className="text-[10px] text-[#3a3a3a] truncate max-w-[120px]">{row.name}</span>
                        )}
                      </div>
                    </td>

                    {/* price */}
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-sm font-semibold text-[#f0f0f0] tabular-nums">
                        ${row.price.toFixed(row.price < 10 ? 3 : 2)}
                      </span>
                    </td>

                    {/* day % */}
                    <td className="px-4 py-3.5">
                      <PctBadge value={row.day} />
                    </td>

                    {/* 7D % */}
                    <td className="px-4 py-3.5">
                      <PctBadge value={row.week} />
                    </td>

                    {/* 1M % */}
                    <td className="px-4 py-3.5">
                      <PctBadge value={row.month} />
                    </td>

                    {/* sparkline */}
                    <td className="px-4 py-3.5">
                      <Sparkline values={row.sparkline} change={row.month} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* bottom amber accent */}
          <div className="h-px" style={{ background: "linear-gradient(90deg, transparent 5%, rgba(251,191,36,0.15) 50%, transparent 95%)" }} />
        </div>

        {/* footer note */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[10px] text-[#2c2c2c]">
            Click any row to open the ticker · Data refreshes every 30s
          </p>
          <p className="text-[10px] text-[#2c2c2c]">
            7D & 1M changes calculated from last trading session closes
          </p>
        </div>
      </main>
    </div>
  );
}
