"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTickerStore } from "@/store/tickerStore";
import { OHLCVBar } from "@/types/market";
import {
  Aperture, ArrowLeft, ShieldCheck, Zap, Wind,
  Sparkles, RefreshCw, TrendingUp,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   PALETTE — one colour per ticker in the drawdown chart
══════════════════════════════════════════════════════════════ */
const PALETTE = [
  "#7dd3fc", "#fbbf24", "#60a5fa", "#c084fc",
  "#fb923c", "#f472b6", "#4ade80", "#a3a3a3",
];

/* ══════════════════════════════════════════════════════════════
   MATH
══════════════════════════════════════════════════════════════ */
function dailyReturns(bars: OHLCVBar[]): number[] {
  return bars.slice(1).map((b, i) => (b.close - bars[i].close) / bars[i].close);
}
function avg(arr: number[]) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const as = a.slice(-n), bs = b.slice(-n);
  const ma = avg(as), mb = avg(bs);
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
  ret: number;
  vol: number;
  dd: number;
  sharpe: number;
  returns: number[];
}

/* ══════════════════════════════════════════════════════════════
   CORRELATION CELL COLOUR
══════════════════════════════════════════════════════════════ */
function corrBg(r: number): string {
  const c = Math.max(-1, Math.min(1, r));
  return c >= 0
    ? `rgba(125,211,252,${(c * 0.52).toFixed(2)})`
    : `rgba(248,113,113,${(-c * 0.42).toFixed(2)})`;
}

/* ══════════════════════════════════════════════════════════════
   SCORE RING
══════════════════════════════════════════════════════════════ */
function ScoreRing({ score, color }: { score: number; color: string }) {
  const R = 22, ST = 4;
  const circ = 2 * Math.PI * R;
  const dash = (score / 100) * circ;
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="shrink-0">
      <circle cx={28} cy={28} r={R} fill="none" stroke="#1e1e1e" strokeWidth={ST} />
      <circle
        cx={28} cy={28} r={R} fill="none"
        stroke={color} strokeWidth={ST}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
      />
      <text x={28} y={31} textAnchor="middle" fontSize="11" fontWeight="700" fill={color} fontFamily="monospace">
        {score}
      </text>
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
    <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] px-4 py-3.5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span style={{ color }} className="shrink-0">{icon}</span>
        <span className="text-[9px] font-semibold text-[#3a3a3a] uppercase tracking-widest truncate">{label}</span>
      </div>
      <div className="font-mono text-xl font-bold tabular-nums leading-none truncate" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[#3a3a3a] leading-snug line-clamp-2">{sub}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MINI BAR
══════════════════════════════════════════════════════════════ */
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (Math.abs(value) / max) * 100 : 0;
  const pos = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden shrink-0">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct.toFixed(0)}%`,
            background: pos ? "#4ade80" : "#f87171",
            boxShadow: pos ? "0 0 4px rgba(74,222,128,0.5)" : "0 0 4px rgba(248,113,113,0.5)",
          }}
        />
      </div>
      <span className="text-[11px] font-mono font-semibold tabular-nums w-14"
        style={{ color: pos ? "#4ade80" : "#f87171" }}>
        {pos ? "+" : ""}{value.toFixed(1)}%
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   RISK / RETURN SCATTER
══════════════════════════════════════════════════════════════ */
function ScatterPlot({ items }: { items: TickerStats[] }) {
  if (items.length < 2) return null;
  const VW = 680, VH = 340;
  // No external margins — axis labels live inside the plot
  const ML = 4, MR = 4, MT = 4, MB = 4;
  const PW = VW - ML - MR, PH = VH - MT - MB;

  const vols = items.map(d => d.vol), rets = items.map(d => d.ret);
  const vPad = Math.max((Math.max(...vols) - Math.min(...vols)) * 0.28, 5);
  const rPad = Math.max((Math.max(...rets) - Math.min(...rets)) * 0.28, 4);
  const vlo = Math.min(...vols) - vPad, vhi = Math.max(...vols) + vPad;
  const rlo = Math.min(...rets) - rPad, rhi = Math.max(...rets) + rPad;

  const mx = (v: number) => ML + ((v - vlo) / (vhi - vlo)) * PW;
  const my = (r: number) => MT + PH - ((r - rlo) / (rhi - rlo)) * PH;

  const avgVol = avg(vols);
  const qx = mx(avgVol);
  const qy = rlo < 0 && rhi > 0 ? my(0) : -1;
  const xTicks = 5, yTicks = 5;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ overflow: "visible" }}>
      {/* quadrant fills */}
      {qy > 0 && (
        <>
          <rect x={ML}  y={MT}  width={qx - ML}      height={qy - MT}      fill="rgba(125,211,252,0.04)" />
          <rect x={qx}  y={MT}  width={ML + PW - qx} height={qy - MT}      fill="rgba(251,191,36,0.035)" />
          <rect x={ML}  y={qy}  width={qx - ML}      height={MT + PH - qy} fill="rgba(255,255,255,0.012)" />
          <rect x={qx}  y={qy}  width={ML + PW - qx} height={MT + PH - qy} fill="rgba(248,113,113,0.04)" />
          {/* quadrant labels — inside, near corners */}
          <text x={ML+8}  y={MT+14} fontSize="7" fill="rgba(125,211,252,0.35)"  fontFamily="monospace" letterSpacing="1.5">SWEET SPOT</text>
          <text x={qx+8}  y={MT+14} fontSize="7" fill="rgba(251,191,36,0.35)"  fontFamily="monospace" letterSpacing="1.5">HIGH MOMENTUM</text>
          <text x={ML+8}  y={MT+PH-8} fontSize="7" fill="rgba(100,100,100,0.35)" fontFamily="monospace" letterSpacing="1.5">DEFENSIVE</text>
          <text x={qx+8}  y={MT+PH-8} fontSize="7" fill="rgba(248,113,113,0.35)" fontFamily="monospace" letterSpacing="1.5">RISK ZONE</text>
        </>
      )}

      {/* grid lines */}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const v = vlo + (i / xTicks) * (vhi - vlo);
        return <line key={i} x1={mx(v)} y1={MT} x2={mx(v)} y2={MT+PH} stroke="#161616" strokeWidth="1" />;
      })}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const r = rlo + (i / yTicks) * (rhi - rlo);
        return <line key={i} x1={ML} y1={my(r)} x2={ML+PW} y2={my(r)} stroke="#161616" strokeWidth="1" />;
      })}

      {/* border */}
      <rect x={ML} y={MT} width={PW} height={PH} fill="none" stroke="#2a2a2a" strokeWidth="1" rx="2" />

      {/* quadrant dividers */}
      {qy > 0 && (
        <>
          <line x1={ML} y1={qy} x2={ML+PW} y2={qy} stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4,4" />
          <line x1={qx} y1={MT} x2={qx} y2={MT+PH} stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4,4" />
        </>
      )}

      {/* ── X-axis tick labels — inside, along the bottom edge ── */}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const v = vlo + (i / xTicks) * (vhi - vlo);
        const x = mx(v);
        const label = `${v.toFixed(0)}%`;
        return (
          <g key={i}>
            <rect x={x - 12} y={MT+PH-16} width={24} height={12} rx="2" fill="rgba(8,8,8,0.72)" />
            <text x={x} y={MT+PH-7} textAnchor="middle" fontSize="8" fill="#4a4a4a" fontFamily="monospace">{label}</text>
          </g>
        );
      })}

      {/* ── Y-axis tick labels — inside, along the left edge ── */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const r = rlo + (i / yTicks) * (rhi - rlo);
        const y = my(r);
        const label = `${r >= 0 ? "+" : ""}${r.toFixed(1)}%`;
        const w = label.length * 5.6 + 6;
        return (
          <g key={i}>
            <rect x={ML+4} y={y-9} width={w} height={12} rx="2" fill="rgba(8,8,8,0.72)" />
            <text x={ML+7} y={y+2} textAnchor="start" fontSize="8" fill="#4a4a4a" fontFamily="monospace">{label}</text>
          </g>
        );
      })}

      {/* ── Axis labels — ghost text inside chart ── */}
      <text x={ML+PW/2} y={MT+PH-4} textAnchor="middle" fontSize="9" fill="rgba(74,74,74,0.55)" fontFamily="system-ui">Annualised Vol →</text>
      <text
        x={ML+14} y={MT+PH/2}
        textAnchor="middle" fontSize="9" fill="rgba(74,74,74,0.55)" fontFamily="system-ui"
        transform={`rotate(-90,${ML+14},${MT+PH/2})`}
      >1M Return →</text>

      {/* dots */}
      {items.map((d) => {
        const x = mx(d.vol), y = my(d.ret);
        const pos = d.ret >= 0;
        const col = pos ? "#4ade80" : "#f87171";
        const gRGB = pos ? "74,222,128" : "248,113,113";
        return (
          <g key={d.ticker}>
            <circle cx={x} cy={y} r={22} fill="none" stroke={col} strokeWidth="0.5" opacity="0.12" />
            <circle cx={x} cy={y} r={15}
              fill={pos ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)"}
              stroke={col} strokeWidth="1.5"
              style={{ filter: `drop-shadow(0 0 7px rgba(${gRGB},0.42))` }} />
            <text x={x} y={y+4} textAnchor="middle" fontSize="8.5" fontWeight="700"
              fill={col} fontFamily="'SF Mono','Courier New',monospace">
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
                        background: isDiag ? "rgba(125,211,252,0.13)" : corrBg(r),
                        border: isDiag ? "1px solid rgba(125,211,252,0.28)" : "1px solid rgba(255,255,255,0.04)",
                        fontSize: 10.5,
                        color: isDiag ? "#7dd3fc" : Math.abs(r) > 0.35 ? "rgba(240,240,240,0.9)" : "#767676",
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
   INLINE MARKDOWN RENDERER — handles **bold** and *italic*
══════════════════════════════════════════════════════════════ */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i} className="font-semibold text-[#e4e4ee]">{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={i} className="italic text-[#c8c8d8]">{part.slice(1, -1)}</em>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   AI ANALYSIS PANEL
══════════════════════════════════════════════════════════════ */
function AIPanel({
  text, loading, error, generatedAt, onRegenerate,
}: {
  text: string; loading: boolean; error: boolean; generatedAt: number | null; onRegenerate: () => void;
}) {
  const timeAgo = generatedAt ? (() => {
    const mins = Math.round((Date.now() - generatedAt) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  })() : null;

  // Split into paragraphs, handle ### headings
  const blocks = text.split(/\n\n+/).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {/* Loading dots */}
      {loading && !text && (
        <div className="flex items-center gap-1.5 py-2">
          <span className="text-[11px] text-[#3a3a3a]">Analyzing</span>
          {[0, 0.18, 0.36].map(d => (
            <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#7dd3fc]"
              style={{ animation: `ddBounce 1s ease-in-out ${d}s infinite alternate` }} />
          ))}
        </div>
      )}

      {/* Streamed content */}
      {blocks.length > 0 && (
        <div className="flex flex-col gap-4">
          {blocks.map((block, i) => {
            const isLast = i === blocks.length - 1;
            const cursor = loading && isLast ? (
              <span
                className="inline-block w-[2px] h-[14px] ml-[2px] align-middle rounded-sm bg-[#7dd3fc]"
                style={{ animation: "ddBounce 0.6s ease-in-out infinite alternate" }}
              />
            ) : null;

            // ### Heading
            if (block.startsWith("### ")) {
              return (
                <div key={i} className="flex items-center gap-2 pt-1">
                  <span className="text-[#7dd3fc] text-[8px]">◆</span>
                  <span className="text-[10px] font-bold text-[#f0f0f0] uppercase tracking-widest">
                    {block.slice(4)}
                  </span>
                </div>
              );
            }

            // Whole block is **bold** — treat as section label
            if (/^\*\*[^*]+\*\*[:\s]*$/.test(block.trim())) {
              return (
                <div key={i} className="flex items-center gap-2 pt-1">
                  <span className="text-[#7dd3fc] text-[8px]">◆</span>
                  <span className="text-[10px] font-bold text-[#f0f0f0] uppercase tracking-widest">
                    {block.trim().replace(/\*\*/g, "").replace(/:$/, "")}
                  </span>
                </div>
              );
            }

            // Regular paragraph
            return (
              <p key={i} className="text-[12.5px] text-[#b0b0bc] leading-[1.78] tracking-[0.01em]">
                {renderInline(block)}{cursor}
              </p>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <p className="text-[11px] text-[#f87171]">Failed to generate analysis. Try again.</p>
      )}

      {/* Footer */}
      {!loading && (text || error) && (
        <div className="flex items-center justify-between pt-2 border-t border-[#1a1a1a]">
          <span className="text-[10px] text-[#2c2c2c]">
            {timeAgo ? `Generated ${timeAgo}` : ""}
          </span>
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#242424] text-[10px] text-[#767676] hover:text-[#7dd3fc] hover:border-[#7dd3fc33] transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════ */
export default function PulsePage() {
  const { watchlist } = useTickerStore();

  /* AI state */
  const [aiText, setAiText]               = useState("");
  const [aiLoading, setAiLoading]         = useState(false);
  const [aiError, setAiError]             = useState(false);
  const [aiGeneratedAt, setAiGeneratedAt] = useState<number | null>(null);
  const aiInit = useRef(false);

  /* Data */
  const histResults = useQueries({
    queries: watchlist.map(t => ({
      queryKey: ["history-pulse", t],
      queryFn: () =>
        fetch(`/api/market/history/${t}?tf=1M`).then(r => r.json()) as Promise<{ bars: OHLCVBar[] }>,
      staleTime: 120_000,
    })),
  });

  const isLoading = histResults.some(r => r.isLoading);

  /* Stats */
  const stats: TickerStats[] = useMemo(() => {
    return watchlist.map((ticker, i) => {
      const bars = histResults[i].data?.bars ?? [];
      if (bars.length < 3) return null;
      const returns = dailyReturns(bars);
      const vol = stdDev(returns) * Math.sqrt(252) * 100;
      const ret = (bars[bars.length - 1].close - bars[0].open) / bars[0].open * 100;
      const dd  = maxDrawdown(bars);
      const sharpe = vol > 0 ? ret / (vol / Math.sqrt(12)) : 0;
      return { ticker, ret, vol, dd, sharpe, returns };
    }).filter((s): s is TickerStats => s !== null && s.vol > 0);
  }, [watchlist, histResults]);

  /* Correlation */
  const corrMatrix = useMemo(
    () => stats.map((a, i) => stats.map((b, j) => i === j ? 1 : pearson(a.returns, b.returns))),
    [stats]
  );

  /* Portfolio metrics */
  const portfolio = useMemo(() => {
    if (stats.length < 2) return null;
    let cSum = 0, cCount = 0;
    let maxR = -Infinity, minR = Infinity;
    let maxPair = ["",""], minPair = ["",""];
    for (let i = 0; i < stats.length; i++) {
      for (let j = i + 1; j < stats.length; j++) {
        const r = corrMatrix[i][j];
        cSum += r; cCount++;
        if (r > maxR) { maxR = r; maxPair = [stats[i].ticker, stats[j].ticker]; }
        if (r < minR) { minR = r; minPair = [stats[i].ticker, stats[j].ticker]; }
      }
    }
    const avgCorr = cCount > 0 ? cSum / cCount : 0;
    const divScore = Math.round((1 - avgCorr) / 2 * 100);
    const sorted = [...stats].sort((a, b) => b.sharpe - a.sharpe);
    const avgRet = avg(stats.map(s => s.ret));
    const winCount = stats.filter(s => s.ret > 0).length;
    return {
      avgCorr, divScore,
      maxCorrVal: maxR, maxPair,
      minCorrVal: minR, minPair,
      bestSharpe: sorted[0],
      worstSharpe: sorted[sorted.length - 1],
      lowestVol: [...stats].sort((a, b) => a.vol - b.vol)[0],
      bestRet: [...stats].sort((a, b) => b.ret - a.ret)[0],
      avgRet, winCount,
      maxAbsRet: Math.max(...stats.map(s => Math.abs(s.ret))),
    };
  }, [stats, corrMatrix]);

  /* Cache key */
  const cacheKey = useMemo(
    () => `pulse-ai-v3-${watchlist.slice().sort().join(",")}`,
    [watchlist]
  );

  /* AI init — load cache or auto-generate */
  useEffect(() => {
    if (isLoading || stats.length < 2 || !portfolio || aiInit.current) return;
    aiInit.current = true;

    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { text, generatedAt } = JSON.parse(cached);
        setAiText(text);
        setAiGeneratedAt(generatedAt);
      } catch { /* stale cache */ }
      return;
    }
    runGenerate(stats, portfolio, cacheKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, stats, portfolio]);

  async function runGenerate(
    s: TickerStats[],
    p: NonNullable<typeof portfolio>,
    key: string,
  ) {
    setAiLoading(true);
    setAiText("");
    setAiError(false);
    try {
      const resp = await fetch("/api/pulse/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stats: s.map(({ ticker, ret, vol, dd, sharpe }) => ({ ticker, ret, vol, dd, sharpe })),
          portfolio: {
            avgCorr: p.avgCorr,
            divScore: p.divScore,
            maxPair: p.maxPair,
            maxCorrVal: p.maxCorrVal,
            minPair: p.minPair,
            minCorrVal: p.minCorrVal,
            avgRet: p.avgRet,
            winCount: p.winCount,
            bestSharpeTicker: p.bestSharpe?.ticker,
            bestSharpeVal: p.bestSharpe?.sharpe,
            worstSharpeTicker: p.worstSharpe?.ticker,
          },
        }),
      });
      if (!resp.ok || !resp.body) { setAiError(true); return; }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setAiText(full);
      }
      const now = Date.now();
      setAiGeneratedAt(now);
      localStorage.setItem(key, JSON.stringify({ text: full, generatedAt: now }));
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  }

  function handleRegenerate() {
    if (!portfolio || aiLoading) return;
    localStorage.removeItem(cacheKey);
    runGenerate(stats, portfolio, cacheKey);
  }

  /* Derived display values */
  const divColor = !portfolio ? "#767676"
    : portfolio.divScore >= 68 ? "#4ade80"
    : portfolio.divScore >= 38 ? "#fbbf24"
    : "#f87171";

  const retColor = !portfolio ? "#767676"
    : portfolio.avgRet >= 0 ? "#4ade80" : "#f87171";

  return (
    <div
      className="h-screen overflow-y-auto text-[#f0f0f0]"
      style={{ background: "#080808", scrollbarWidth: "thin", scrollbarColor: "#1e1e1e transparent" }}
    >
      <style>{`
        @keyframes lensPageAperture {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ddBounce {
          from { opacity: 0.3; transform: translateY(0); }
          to   { opacity: 1;   transform: translateY(-3px); }
        }
      `}</style>

      {/* ── HEADER ── */}
      <header
        className="sticky top-0 z-40 border-b border-[#1e1e1e]"
        style={{ background: "rgba(8,8,8,0.95)", backdropFilter: "blur(14px)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <a href="/" className="flex items-center gap-2 text-[#767676] hover:text-[#f0f0f0] transition-colors group shrink-0">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-xs font-medium hidden sm:inline">Home</span>
          </a>
          <div className="h-4 w-px bg-[#2c2c2c]" />

          {/* Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex items-center justify-center" style={{ width: 22, height: 22 }}>
              {/* rotating aperture ring */}
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div style={{
                  position: "absolute", inset: -2,
                  background: "conic-gradient(from 0deg, transparent 0deg, rgba(125,211,252,0.55) 80deg, transparent 160deg, transparent 360deg)",
                  animation: "lensPageAperture 3s linear infinite",
                }} />
              </div>
              <Aperture className="w-3.5 h-3.5 relative z-10" style={{ color: "#7dd3fc", filter: "drop-shadow(0 0 4px rgba(125,211,252,0.7))" }} />
            </div>
            <div>
              <div className="text-sm font-bold leading-none" style={{ color: "#7dd3fc", textShadow: "0 0 14px rgba(125,211,252,0.42)" }}>
                Lens
              </div>
              <div className="text-[9px] text-[#3a3a3a] mt-0.5">Portfolio Analytics</div>
            </div>
          </div>

          {/* Header chips — performance-focused, not diversification-focused */}
          {!isLoading && portfolio && (
            <div className="ml-auto flex items-center gap-3 text-[10px] font-medium flex-wrap justify-end">
              <span className="text-[#3a3a3a]">{stats.length} tickers</span>
              <span className="w-px h-3 bg-[#2c2c2c]" />
              <span style={{ color: portfolio.winCount >= stats.length / 2 ? "#4ade80" : "#f87171" }}>
                {portfolio.winCount}/{stats.length} positive
              </span>
              <span className="w-px h-3 bg-[#2c2c2c] hidden sm:block" />
              <span className="hidden sm:block" style={{ color: retColor }}>
                Equal-weight avg: {portfolio.avgRet >= 0 ? "+" : ""}{portfolio.avgRet.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">

        {isLoading && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-[#0c0c0c] animate-pulse border border-[#1a1a1a]" />
              ))}
            </div>
            {[400, 240, 200, 320].map((h, i) => (
              <div key={i} className="rounded-xl bg-[#0c0c0c] animate-pulse border border-[#1a1a1a]" style={{ height: h }} />
            ))}
          </div>
        )}

        {!isLoading && stats.length < 2 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Aperture className="w-10 h-10 text-[#2c2c2c]" />
            <p className="text-[#3a3a3a] text-sm">Add at least 2 tickers to your watchlist to unlock Lens.</p>
          </div>
        )}

        {!isLoading && stats.length >= 2 && portfolio && (
          <div className="flex flex-col gap-6">

            {/* ── STAT CARDS — 4 columns ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

              {/* 1 — Diversification score (compact) */}
              <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] px-4 py-3.5 flex items-center gap-3 min-w-0">
                <ScoreRing score={portfolio.divScore} color={divColor} />
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 shrink-0" style={{ color: divColor }} />
                    <span className="text-[9px] font-semibold text-[#3a3a3a] uppercase tracking-widest truncate">Diversification</span>
                  </div>
                  <div className="text-[11px] font-semibold leading-snug truncate" style={{ color: divColor }}>
                    {portfolio.divScore >= 68 ? "Well spread" : portfolio.divScore >= 38 ? "Some overlap" : "Concentrated"}
                  </div>
                  <div className="text-[10px] text-[#3a3a3a]">r̄ = {portfolio.avgCorr.toFixed(2)}</div>
                </div>
              </div>

              {/* 2 — Equal-weight return (NEW) */}
              <StatCard
                label="Equal-Weight Return"
                value={`${portfolio.avgRet >= 0 ? "+" : ""}${portfolio.avgRet.toFixed(1)}%`}
                sub={`${portfolio.winCount}/${stats.length} tickers positive this month`}
                color={retColor}
                icon={<TrendingUp className="w-3 h-3" />}
              />

              {/* 3 — Best risk-adjusted */}
              <StatCard
                label="Best Risk-Adj. Return"
                value={portfolio.bestSharpe.ticker}
                sub={`Sharpe ${portfolio.bestSharpe.sharpe.toFixed(2)} · ${portfolio.bestSharpe.ret >= 0 ? "+" : ""}${portfolio.bestSharpe.ret.toFixed(1)}% 1M`}
                color="#7dd3fc"
                icon={<Zap className="w-3 h-3" />}
              />

              {/* 4 — Lowest volatility */}
              <StatCard
                label="Lowest Volatility"
                value={portfolio.lowestVol.ticker}
                sub={`${portfolio.lowestVol.vol.toFixed(1)}% ann. · Max DD −${portfolio.lowestVol.dd.toFixed(1)}%`}
                color="#c0c0cc"
                icon={<Wind className="w-3 h-3" />}
              />

            </div>

            {/* ── SCATTER + BREAKDOWN ── */}
            <div className="grid lg:grid-cols-[1fr_300px] gap-5">
              <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#7dd3fc] text-[8px]">◆</span>
                  <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Risk / Return Universe</span>
                </div>
                <p className="text-[9px] text-[#3a3a3a] mb-4 ml-3.5">
                  Ideal position: top-left (high return, low vol). Dashed lines split at avg volatility and 0% return.
                </p>
                <ScatterPlot items={stats} />
              </div>

              <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#7dd3fc] text-[8px]">◆</span>
                  <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Breakdown</span>
                </div>
                <p className="text-[9px] text-[#3a3a3a] mb-4 ml-3.5">Sorted by risk-adjusted return</p>
                <div className="flex flex-col gap-0">
                  <div className="grid grid-cols-[52px_1fr_52px_52px] px-2 pb-2 border-b border-[#181818]">
                    {["", "1M Return", "Vol", "MaxDD"].map(h => (
                      <span key={h} className="text-[9px] font-semibold uppercase tracking-widest text-[#3a3a3a]">{h}</span>
                    ))}
                  </div>
                  {[...stats].sort((a, b) => b.sharpe - a.sharpe).map((s, idx) => (
                    <div
                      key={s.ticker}
                      className="grid grid-cols-[52px_1fr_52px_52px] px-2 py-2.5 border-b border-[#111] hover:bg-white/[0.03] transition-colors cursor-pointer rounded"
                      style={{ background: idx % 2 === 1 ? "rgba(255,255,255,0.01)" : "transparent" }}
                      onClick={() => { useTickerStore.getState().setActiveTicker(s.ticker); window.location.href = "/"; }}
                    >
                      <span className="text-xs font-bold font-mono text-[#f0f0f0] self-center">{s.ticker}</span>
                      <div className="self-center"><MiniBar value={s.ret} max={portfolio.maxAbsRet} /></div>
                      <span className="text-[11px] font-mono tabular-nums text-[#c0c0cc] self-center">{s.vol.toFixed(0)}%</span>
                      <span className="text-[11px] font-mono tabular-nums text-[#f87171] self-center">−{s.dd.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── CORRELATION MATRIX ── */}
            <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[#7dd3fc] text-[8px]">◆</span>
                  <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Correlation Matrix</span>
                </div>
                <div className="flex items-center gap-3">
                  {[
                    { label: "−1 Inverse", bg: "rgba(248,113,113,0.42)" },
                    { label: "0 None",     bg: "#181818" },
                    { label: "+1 Perfect", bg: "rgba(125,211,252,0.52)" },
                  ].map(({ label, bg }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-6 h-2 rounded-sm" style={{ background: bg }} />
                      <span className="text-[9px] text-[#3a3a3a]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[9px] text-[#3a3a3a] mb-4 ml-3.5">
                Pearson correlation of 1M daily returns.
                {portfolio.minCorrVal < 0.2 && (
                  <> Best hedge: <span className="text-[#4ade80]">{portfolio.minPair[0]}/{portfolio.minPair[1]} (r={portfolio.minCorrVal.toFixed(2)})</span>.</>
                )}
              </p>
              <CorrelationMatrix tickers={stats.map(s => s.ticker)} matrix={corrMatrix} />
            </div>

            {/* ── AI ANALYSIS ── */}
            <div
              className="rounded-xl border p-5 flex flex-col gap-4"
              style={{
                background: "linear-gradient(135deg, rgba(125,211,252,0.035) 0%, rgba(0,0,0,0) 55%)",
                borderColor: "rgba(125,211,252,0.16)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#7dd3fc", filter: "drop-shadow(0 0 4px rgba(125,211,252,0.6))" }} />
                  <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Portfolio Analysis</span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full border font-semibold"
                    style={{ color: "#7dd3fc", borderColor: "rgba(125,211,252,0.28)", background: "rgba(125,211,252,0.08)" }}
                  >
                    Claude
                  </span>
                </div>
              </div>

              <AIPanel
                text={aiText}
                loading={aiLoading}
                error={aiError}
                generatedAt={aiGeneratedAt}
                onRegenerate={handleRegenerate}
              />
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
