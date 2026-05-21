"use client";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar } from "@/types/market";
import { Activity, ArrowLeft, ShieldCheck, Zap, Wind, AlertTriangle } from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   MATH HELPERS
══════════════════════════════════════════════════════════════ */
function dailyReturns(bars: OHLCVBar[]): number[] {
  return bars.slice(1).map((b, i) => (b.close - bars[i].close) / bars[i].close);
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const as = a.slice(-n), bs = b.slice(-n);
  const ma = mean(as), mb = mean(bs);
  let num = 0, da2 = 0, db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = as[i] - ma, db = bs[i] - mb;
    num += da * db; da2 += da * da; db2 += db * db;
  }
  return da2 === 0 || db2 === 0 ? 0 : num / Math.sqrt(da2 * db2);
}

function maxDrawdown(bars: OHLCVBar[]): number {
  if (bars.length < 2) return 0;
  let peak = bars[0].close, dd = 0;
  for (const b of bars) {
    if (b.close > peak) peak = b.close;
    dd = Math.max(dd, (peak - b.close) / peak);
  }
  return dd * 100;
}

/* ══════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════ */
interface TickerStats {
  ticker: string;
  ret: number;       // 1M total return %
  vol: number;       // annualised volatility %
  dd: number;        // max drawdown %
  sharpe: number;    // simplified Sharpe (ret / monthly-vol)
  returns: number[]; // daily return series
}

/* ══════════════════════════════════════════════════════════════
   CORRELATION CELL BACKGROUND
══════════════════════════════════════════════════════════════ */
function corrBg(r: number): string {
  const c = Math.max(-1, Math.min(1, r));
  if (c >= 0) return `rgba(45,212,191,${(c * 0.52).toFixed(2)})`;
  return `rgba(248,113,113,${(-c * 0.42).toFixed(2)})`;
}

/* ══════════════════════════════════════════════════════════════
   RISK / RETURN SCATTER PLOT
══════════════════════════════════════════════════════════════ */
function ScatterPlot({ items }: { items: TickerStats[] }) {
  if (items.length < 2) return null;

  const VW = 680, VH = 360;
  const ML = 66, MR = 20, MT = 28, MB = 44;
  const PW = VW - ML - MR, PH = VH - MT - MB;

  const vols = items.map(d => d.vol);
  const rets = items.map(d => d.ret);

  const vPad = Math.max((Math.max(...vols) - Math.min(...vols)) * 0.28, 5);
  const rPad = Math.max((Math.max(...rets) - Math.min(...rets)) * 0.28, 4);

  const vlo = Math.min(...vols) - vPad, vhi = Math.max(...vols) + vPad;
  const rlo = Math.min(...rets) - rPad, rhi = Math.max(...rets) + rPad;

  const mx = (v: number) => ML + ((v - vlo) / (vhi - vlo)) * PW;
  const my = (r: number) => MT + PH - ((r - rlo) / (rhi - rlo)) * PH;

  const avgVol = mean(vols);
  const qx = mx(avgVol);
  const qy = rlo < 0 && rhi > 0 ? my(0) : -1;

  const xTicks = 5, yTicks = 5;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ overflow: "visible" }}>
      {/* Quadrant fills */}
      {qy > 0 && (
        <>
          {/* Sweet Spot — top-left: high return, low vol */}
          <rect x={ML}  y={MT}  width={qx - ML}       height={qy - MT}       fill="rgba(45,212,191,0.04)"  />
          {/* Momentum — top-right: high return, high vol */}
          <rect x={qx}  y={MT}  width={ML + PW - qx}  height={qy - MT}       fill="rgba(251,191,36,0.035)" />
          {/* Defensive — bottom-left: low return, low vol */}
          <rect x={ML}  y={qy}  width={qx - ML}       height={MT + PH - qy}  fill="rgba(255,255,255,0.012)" />
          {/* Risk Zone — bottom-right: low return, high vol */}
          <rect x={qx}  y={qy}  width={ML + PW - qx}  height={MT + PH - qy}  fill="rgba(248,113,113,0.04)" />

          {/* Quadrant labels */}
          <text x={ML + 8} y={MT + 14} fontSize="7" fill="rgba(45,212,191,0.38)" fontFamily="monospace" letterSpacing="1.5">SWEET SPOT</text>
          <text x={qx + 8} y={MT + 14} fontSize="7" fill="rgba(251,191,36,0.38)"  fontFamily="monospace" letterSpacing="1.5">HIGH MOMENTUM</text>
          <text x={ML + 8} y={MT + PH - 8} fontSize="7" fill="rgba(100,100,100,0.38)" fontFamily="monospace" letterSpacing="1.5">DEFENSIVE</text>
          <text x={qx + 8} y={MT + PH - 8} fontSize="7" fill="rgba(248,113,113,0.38)" fontFamily="monospace" letterSpacing="1.5">RISK ZONE</text>
        </>
      )}

      {/* Grid lines */}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const v = vlo + (i / xTicks) * (vhi - vlo);
        return <line key={i} x1={mx(v)} y1={MT} x2={mx(v)} y2={MT + PH} stroke="#161616" strokeWidth="1" />;
      })}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const r = rlo + (i / yTicks) * (rhi - rlo);
        return <line key={i} x1={ML} y1={my(r)} x2={ML + PW} y2={my(r)} stroke="#161616" strokeWidth="1" />;
      })}

      {/* Plot border */}
      <rect x={ML} y={MT} width={PW} height={PH} fill="none" stroke="#2a2a2a" strokeWidth="1" rx="2" />

      {/* Y = 0 break-even line */}
      {qy > 0 && (
        <line x1={ML} y1={qy} x2={ML + PW} y2={qy} stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4,4" />
      )}
      {/* X = avgVol reference line */}
      <line x1={qx} y1={MT} x2={qx} y2={MT + PH} stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4,4" />
      {qy > 0 && (
        <text x={qx + 3} y={MT + 9} fontSize="7" fill="#3a3a3a" fontFamily="monospace">avg vol</text>
      )}

      {/* X-axis tick labels */}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const v = vlo + (i / xTicks) * (vhi - vlo);
        return (
          <text key={i} x={mx(v)} y={MT + PH + 17} textAnchor="middle" fontSize="9" fill="#3a3a3a" fontFamily="monospace">
            {v.toFixed(0)}%
          </text>
        );
      })}
      {/* Y-axis tick labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const r = rlo + (i / yTicks) * (rhi - rlo);
        return (
          <text key={i} x={ML - 6} y={my(r) + 3.5} textAnchor="end" fontSize="9" fill="#3a3a3a" fontFamily="monospace">
            {r >= 0 ? "+" : ""}{r.toFixed(1)}%
          </text>
        );
      })}

      {/* Axis titles */}
      <text x={ML + PW / 2} y={VH - 2} textAnchor="middle" fontSize="10" fill="#4a4a4a" fontFamily="system-ui">
        Annualized Volatility →
      </text>
      <text
        x={11} y={MT + PH / 2}
        textAnchor="middle" fontSize="10" fill="#4a4a4a" fontFamily="system-ui"
        transform={`rotate(-90, 11, ${MT + PH / 2})`}
      >
        1M Return →
      </text>

      {/* Data bubbles */}
      {items.map((d) => {
        const x = mx(d.vol), y = my(d.ret);
        const pos = d.ret >= 0;
        const col = pos ? "#4ade80" : "#f87171";
        const glowRGB = pos ? "74,222,128" : "248,113,113";

        return (
          <g key={d.ticker}>
            {/* outer ambient ring */}
            <circle cx={x} cy={y} r={22} fill="none" stroke={col} strokeWidth="0.5" opacity="0.12" />
            {/* main bubble */}
            <circle
              cx={x} cy={y} r={15}
              fill={pos ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)"}
              stroke={col} strokeWidth="1.5"
              style={{ filter: `drop-shadow(0 0 7px rgba(${glowRGB},0.45))` }}
            />
            {/* ticker label inside */}
            <text
              x={x} y={y + 4}
              textAnchor="middle" fontSize="8.5" fontWeight="700"
              fill={col} fontFamily="'SF Mono','Courier New',monospace"
            >
              {d.ticker.length > 4 ? d.ticker.slice(0, 4) : d.ticker}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════
   CORRELATION MATRIX
══════════════════════════════════════════════════════════════ */
function CorrelationMatrix({ tickers, matrix }: { tickers: string[]; matrix: number[][] }) {
  const CELL = 54;
  return (
    <div className="overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#2c2c2c transparent" }}>
      <table className="border-collapse" style={{ minWidth: tickers.length * CELL + 80 }}>
        <thead>
          <tr>
            <th style={{ width: 68 }} />
            {tickers.map(t => (
              <th key={t} style={{ width: CELL }} className="pb-2.5 text-center">
                <span className="text-[9px] font-bold text-[#767676] font-mono tracking-widest">{t}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((ti, i) => (
            <tr key={ti}>
              <td className="pr-3 py-0.5 text-right whitespace-nowrap">
                <span className="text-[9px] font-bold text-[#767676] font-mono tracking-widest">{ti}</span>
              </td>
              {tickers.map((_, j) => {
                const r = matrix[i][j];
                const isDiag = i === j;
                return (
                  <td key={j} className="p-[3px]">
                    <div
                      className="flex items-center justify-center rounded font-mono font-bold"
                      style={{
                        width: CELL - 6, height: 40,
                        background: isDiag ? "rgba(45,212,191,0.13)" : corrBg(r),
                        border: isDiag
                          ? "1px solid rgba(45,212,191,0.28)"
                          : "1px solid rgba(255,255,255,0.04)",
                        fontSize: 10.5,
                        color: isDiag
                          ? "#2dd4bf"
                          : Math.abs(r) > 0.35
                          ? "rgba(240,240,240,0.90)"
                          : "#767676",
                      }}
                    >
                      {r.toFixed(2)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   DIVERSIFICATION SCORE RING
══════════════════════════════════════════════════════════════ */
function ScoreRing({ score }: { score: number }) {
  const R = 32, STROKE = 5;
  const circ = 2 * Math.PI * R;
  const dash = (score / 100) * circ;
  const color = score >= 68 ? "#4ade80" : score >= 38 ? "#fbbf24" : "#f87171";

  return (
    <svg width={80} height={80} viewBox="0 0 80 80">
      {/* Track */}
      <circle cx={40} cy={40} r={R} fill="none" stroke="#1e1e1e" strokeWidth={STROKE} />
      {/* Progress */}
      <circle
        cx={40} cy={40} r={R} fill="none"
        stroke={color} strokeWidth={STROKE}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
        style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}
      />
      {/* Label */}
      <text x={40} y={37} textAnchor="middle" fontSize="14" fontWeight="700" fill={color} fontFamily="monospace">{score}</text>
      <text x={40} y={50} textAnchor="middle" fontSize="8"  fill="#3a3a3a"  fontFamily="monospace">/100</text>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════
   STAT CARD
══════════════════════════════════════════════════════════════ */
function StatCard({ label, value, sub, color = "#f0f0f0", icon }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] px-4 py-3.5 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-[9px] font-semibold text-[#3a3a3a] uppercase tracking-widest">{label}</span>
      </div>
      <div className="font-mono text-[22px] font-bold tabular-nums leading-none" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[#3a3a3a] leading-snug">{sub}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MINI RETURN BAR (for per-ticker table)
══════════════════════════════════════════════════════════════ */
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.abs(value) / max : 0;
  const pos = value >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(pct * 100).toFixed(0)}%`,
            background: pos ? "#4ade80" : "#f87171",
            boxShadow: pos ? "0 0 4px rgba(74,222,128,0.5)" : "0 0 4px rgba(248,113,113,0.5)",
          }}
        />
      </div>
      <span
        className="text-[11px] font-mono font-semibold tabular-nums w-12"
        style={{ color: pos ? "#4ade80" : "#f87171" }}
      >
        {pos ? "+" : ""}{value.toFixed(1)}%
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function PulsePage() {
  const { watchlist } = useTickerStore();

  const histResults = useQueries({
    queries: watchlist.map(t => ({
      queryKey: ["history-pulse", t],
      queryFn: () =>
        fetch(`/api/market/history/${t}?tf=1M`).then(r => r.json()) as Promise<{ bars: OHLCVBar[] }>,
      staleTime: 120_000,
    })),
  });

  const isLoading = histResults.some(r => r.isLoading);

  /* Build per-ticker stats */
  const stats: TickerStats[] = useMemo(() => {
    return watchlist
      .map((ticker, i) => {
        const bars = histResults[i].data?.bars ?? [];
        if (bars.length < 3) return null;
        const returns = dailyReturns(bars);
        const vol = stdDev(returns) * Math.sqrt(252) * 100;
        const ret = (bars[bars.length - 1].close - bars[0].open) / bars[0].open * 100;
        const dd  = maxDrawdown(bars);
        // Simplified monthly Sharpe: ret / (vol/sqrt(12))
        const sharpe = vol > 0 ? ret / (vol / Math.sqrt(12)) : 0;
        return { ticker, ret, vol, dd, sharpe, returns };
      })
      .filter((s): s is TickerStats => s !== null && s.vol > 0);
  }, [watchlist, histResults]);

  /* N×N correlation matrix */
  const corrMatrix: number[][] = useMemo(
    () => stats.map((a, i) => stats.map((b, j) => i === j ? 1 : pearson(a.returns, b.returns))),
    [stats]
  );

  /* Portfolio-level metrics */
  const portfolio = useMemo(() => {
    if (stats.length < 2) return null;

    // Average off-diagonal correlation
    let corrSum = 0, corrCount = 0;
    for (let i = 0; i < stats.length; i++)
      for (let j = i + 1; j < stats.length; j++) {
        corrSum += corrMatrix[i][j]; corrCount++;
      }
    const avgCorr = corrCount > 0 ? corrSum / corrCount : 0;
    const divScore = Math.round((1 - avgCorr) / 2 * 100);

    // Most / least correlated pair
    let maxCorrVal = -Infinity, minCorrVal = Infinity;
    let maxPair = ["", ""], minPair = ["", ""];
    for (let i = 0; i < stats.length; i++)
      for (let j = i + 1; j < stats.length; j++) {
        const r = corrMatrix[i][j];
        if (r > maxCorrVal) { maxCorrVal = r; maxPair = [stats[i].ticker, stats[j].ticker]; }
        if (r < minCorrVal) { minCorrVal = r; minPair = [stats[i].ticker, stats[j].ticker]; }
      }

    const sorted = [...stats].sort((a, b) => b.sharpe - a.sharpe);
    const bestSharpe  = sorted[0];
    const worstSharpe = sorted[sorted.length - 1];
    const lowestVol   = [...stats].sort((a, b) => a.vol - b.vol)[0];
    const lowestDD    = [...stats].sort((a, b) => a.dd  - b.dd)[0];
    const maxRet      = Math.max(...stats.map(s => Math.abs(s.ret)));

    return { avgCorr, divScore, maxCorrVal, maxPair, minCorrVal, minPair, bestSharpe, worstSharpe, lowestVol, lowestDD, maxRet };
  }, [stats, corrMatrix]);

  const divColor = !portfolio ? "#767676"
    : portfolio.divScore >= 68 ? "#4ade80"
    : portfolio.divScore >= 38 ? "#fbbf24"
    : "#f87171";

  const divLabel = !portfolio ? ""
    : portfolio.divScore >= 68 ? "Well diversified"
    : portfolio.divScore >= 38 ? "Moderate overlap"
    : "High concentration risk";

  return (
    <div
      className="h-screen overflow-y-auto text-[#f0f0f0]"
      style={{ background: "#080808", scrollbarWidth: "thin", scrollbarColor: "#1e1e1e transparent" }}
    >
      <style>{`
        @keyframes sonarRingPage {
          0%   { transform: scale(0.5); opacity: 0.9; }
          100% { transform: scale(5);   opacity: 0;   }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 1.00; }
        }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b border-[#1e1e1e]"
        style={{ background: "rgba(8,8,8,0.95)", backdropFilter: "blur(14px)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 text-[#767676] hover:text-[#f0f0f0] transition-colors shrink-0 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-medium hidden sm:inline">Home</span>
          </a>
          <div className="h-4 w-px bg-[#2c2c2c]" />

          {/* Badge with sonar rings */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex items-center justify-center" style={{ width: 24, height: 24 }}>
              {[0, 0.75, 1.5].map(d => (
                <div
                  key={d}
                  className="absolute rounded-full"
                  style={{
                    width: 8, height: 8,
                    border: "1.5px solid rgba(45,212,191,0.7)",
                    animation: `sonarRingPage 2.2s ease-out ${d}s infinite`,
                    transformOrigin: "center",
                  }}
                />
              ))}
              <div className="w-2 h-2 rounded-full" style={{ background: "#2dd4bf", boxShadow: "0 0 6px #2dd4bf" }} />
            </div>
            <div>
              <div
                className="text-sm font-bold leading-none"
                style={{ color: "#2dd4bf", textShadow: "0 0 14px rgba(45,212,191,0.42)" }}
              >
                Pulse
              </div>
              <div className="text-[9px] text-[#3a3a3a] mt-0.5 tracking-wide">Portfolio Analytics</div>
            </div>
          </div>

          {/* Right: summary chips */}
          {!isLoading && portfolio && (
            <div className="ml-auto flex items-center gap-3 text-[10px] font-medium flex-wrap justify-end">
              <span className="text-[#3a3a3a]">{stats.length} tickers</span>
              <span className="w-px h-3 bg-[#2c2c2c]" />
              <span style={{ color: divColor }}>{divLabel}</span>
              <span className="w-px h-3 bg-[#2c2c2c] hidden sm:block" />
              <span className="text-[#767676] hidden sm:block">
                Avg correlation: <span style={{ color: portfolio.avgCorr < 0.4 ? "#4ade80" : portfolio.avgCorr < 0.65 ? "#fbbf24" : "#f87171" }}>
                  {portfolio.avgCorr.toFixed(2)}
                </span>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN ─────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">

        {/* Loading skeleton */}
        {isLoading && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-[#0c0c0c] animate-pulse border border-[#1a1a1a]" />
              ))}
            </div>
            <div className="h-[400px] rounded-xl bg-[#0c0c0c] animate-pulse border border-[#1a1a1a]" />
            <div className="h-56 rounded-xl bg-[#0c0c0c] animate-pulse border border-[#1a1a1a]" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && stats.length < 2 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Activity className="w-10 h-10 text-[#2c2c2c]" />
            <p className="text-[#3a3a3a] text-sm text-center">Add at least 2 tickers to your watchlist to unlock Pulse analytics.</p>
          </div>
        )}

        {/* Full analytics */}
        {!isLoading && stats.length >= 2 && portfolio && (
          <div className="flex flex-col gap-6">

            {/* ── STAT CARDS ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

              {/* Diversification score with ring */}
              <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] px-4 py-3.5 flex items-center gap-4 col-span-2 lg:col-span-1">
                <ScoreRing score={portfolio.divScore} />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" style={{ color: divColor }} />
                    <span className="text-[9px] font-semibold text-[#3a3a3a] uppercase tracking-widest">Diversification</span>
                  </div>
                  <div className="text-sm font-semibold leading-snug" style={{ color: divColor }}>{divLabel}</div>
                  <div className="text-[10px] text-[#3a3a3a]">Avg corr: {portfolio.avgCorr.toFixed(2)}</div>
                </div>
              </div>

              <StatCard
                label="Best Risk-Adj. Return"
                value={portfolio.bestSharpe.ticker}
                sub={`Sharpe ${portfolio.bestSharpe.sharpe.toFixed(2)} · ${portfolio.bestSharpe.ret >= 0 ? "+" : ""}${portfolio.bestSharpe.ret.toFixed(1)}% 1M`}
                color="#2dd4bf"
                icon={<Zap className="w-3 h-3" />}
              />

              <StatCard
                label="Lowest Volatility"
                value={portfolio.lowestVol.ticker}
                sub={`${portfolio.lowestVol.vol.toFixed(1)}% ann. vol · Max DD −${portfolio.lowestVol.dd.toFixed(1)}%`}
                color="#c0c0cc"
                icon={<Wind className="w-3 h-3" />}
              />

              <StatCard
                label="Highest Concentration Risk"
                value={`${portfolio.maxPair[0]} / ${portfolio.maxPair[1]}`}
                sub={`Correlation ${portfolio.maxCorrVal.toFixed(2)} — these move together`}
                color="#f87171"
                icon={<AlertTriangle className="w-3 h-3" />}
              />
            </div>

            {/* ── SCATTER + BREAKDOWN ──────────────────────────────── */}
            <div className="grid lg:grid-cols-[1fr_300px] gap-5">

              {/* Scatter plot */}
              <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#2dd4bf] text-[8px]">◆</span>
                  <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Risk / Return Universe</span>
                </div>
                <p className="text-[9px] text-[#3a3a3a] mb-4 ml-3.5">
                  Each bubble is a ticker — ideal position is top-left (high return, low volatility).
                  Dashed lines split at avg volatility and 0% return.
                </p>
                <ScatterPlot items={stats} />
              </div>

              {/* Per-ticker breakdown table */}
              <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#2dd4bf] text-[8px]">◆</span>
                  <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Breakdown</span>
                </div>
                <p className="text-[9px] text-[#3a3a3a] mb-4 ml-3.5">Sorted by risk-adjusted return</p>

                <div className="flex flex-col gap-0 flex-1">
                  {/* Column headers */}
                  <div className="grid grid-cols-[52px_1fr_56px_52px] px-2 pb-2 border-b border-[#181818]">
                    {["Ticker", "1M Return", "Vol", "Max DD"].map(h => (
                      <span key={h} className="text-[9px] font-semibold uppercase tracking-widest text-[#3a3a3a]">{h}</span>
                    ))}
                  </div>

                  {[...stats].sort((a, b) => b.sharpe - a.sharpe).map((s, idx) => (
                    <div
                      key={s.ticker}
                      className="grid grid-cols-[52px_1fr_56px_52px] px-2 py-2.5 border-b border-[#111] hover:bg-white/[0.03] transition-colors cursor-pointer rounded"
                      style={{ background: idx % 2 === 1 ? "rgba(255,255,255,0.01)" : "transparent" }}
                      onClick={() => { useTickerStore.getState().setActiveTicker(s.ticker); window.location.href = "/"; }}
                    >
                      <span className="text-xs font-bold font-mono text-[#f0f0f0] self-center">{s.ticker}</span>
                      <div className="self-center">
                        <MiniBar value={s.ret} max={portfolio.maxRet} />
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-[#c0c0cc] self-center">
                        {s.vol.toFixed(1)}%
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-[#f87171] self-center">
                        −{s.dd.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── CORRELATION MATRIX ───────────────────────────────── */}
            <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[#2dd4bf] text-[8px]">◆</span>
                  <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Correlation Matrix</span>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-3">
                  {[
                    { label: "−1.0 Inverse", bg: "rgba(248,113,113,0.42)" },
                    { label: "0 None",       bg: "#181818" },
                    { label: "+1.0 Perfect", bg: "rgba(45,212,191,0.52)" },
                  ].map(({ label, bg }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-7 h-2.5 rounded-sm" style={{ background: bg }} />
                      <span className="text-[9px] text-[#3a3a3a]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[9px] text-[#3a3a3a] mb-4 ml-3.5">
                Pearson correlation of daily returns over 1 month.
                Lower off-diagonal values = better diversification.
                {portfolio.minCorrVal < 0 && (
                  <> Lowest pair: <span className="text-[#4ade80]">{portfolio.minPair[0]}/{portfolio.minPair[1]} ({portfolio.minCorrVal.toFixed(2)})</span> — natural hedge.</>
                )}
              </p>

              <CorrelationMatrix tickers={stats.map(s => s.ticker)} matrix={corrMatrix} />
            </div>

            {/* ── INTERPRETATION CARD ──────────────────────────────── */}
            <div
              className="rounded-xl border p-5 flex flex-col gap-3"
              style={{
                background: "linear-gradient(135deg, rgba(45,212,191,0.04) 0%, rgba(0,0,0,0) 60%)",
                borderColor: "rgba(45,212,191,0.14)",
              }}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" style={{ color: "#2dd4bf" }} />
                <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">What This Means For Your Portfolio</span>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    title: "Concentration Risk",
                    body: portfolio.avgCorr > 0.65
                      ? `Your watchlist tickers move very similarly (avg r=${portfolio.avgCorr.toFixed(2)}). In a downturn, most positions will fall together — consider adding uncorrelated assets.`
                      : portfolio.avgCorr > 0.35
                      ? `Moderate correlation (avg r=${portfolio.avgCorr.toFixed(2)}). You have some diversification but there is still meaningful overlap between positions.`
                      : `Low average correlation (avg r=${portfolio.avgCorr.toFixed(2)}). Your watchlist covers diverse return drivers — good for risk management.`,
                    color: portfolio.avgCorr > 0.65 ? "#f87171" : portfolio.avgCorr > 0.35 ? "#fbbf24" : "#4ade80",
                  },
                  {
                    title: "Volatility Spread",
                    body: (() => {
                      const hi = [...stats].sort((a, b) => b.vol - a.vol)[0];
                      const lo = portfolio.lowestVol;
                      return `${hi.ticker} is ${(hi.vol / lo.vol).toFixed(1)}× more volatile than ${lo.ticker} (${hi.vol.toFixed(0)}% vs ${lo.vol.toFixed(0)}% ann.). Use lower-vol names to anchor your portfolio in uncertain markets.`;
                    })(),
                    color: "#c0c0cc",
                  },
                  {
                    title: "Risk-Adjusted Leadership",
                    body: `${portfolio.bestSharpe.ticker} leads on risk-adjusted return (Sharpe ${portfolio.bestSharpe.sharpe.toFixed(2)}), meaning it delivered the most return per unit of volatility taken. ${portfolio.worstSharpe.ticker} has the lowest ratio — higher risk relative to reward.`,
                    color: "#2dd4bf",
                  },
                ].map(({ title, body, color }) => (
                  <div key={title} className="flex flex-col gap-1.5">
                    <div className="text-[9px] font-semibold uppercase tracking-widest" style={{ color }}>{title}</div>
                    <p className="text-[11px] text-[#767676] leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
