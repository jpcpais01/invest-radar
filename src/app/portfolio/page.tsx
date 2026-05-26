"use client";
import {
  useState, useEffect, useRef, useCallback, useMemo, useId,
} from "react";
import { useQueries } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  usePortfolioStore, Position,
} from "@/store/portfolioStore";
import {
  Plus, X, Pencil, Trash2, Briefcase, ArrowLeft,
  TrendingUp, TrendingDown, Activity, AlertTriangle, Shield,
} from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number }

// ─── palette ──────────────────────────────────────────────────────────────────
const PALETTE = [
  "#34d399", "#60a5fa", "#f59e0b", "#f87171",
  "#a78bfa", "#fb7185", "#38bdf8", "#facc15",
  "#c084fc", "#4ade80", "#e879f9", "#2dd4bf",
];

// ─── chart time-frames ────────────────────────────────────────────────────────
const CHART_TFS = ["1W", "1M", "3M", "6M", "1Y"] as const;
type ChartTF = (typeof CHART_TFS)[number];
const TF_DAYS: Record<ChartTF, number> = {
  "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365,
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt$(v: number, digits = 2): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)
    return `${sign}$${abs.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  return `${sign}$${abs.toFixed(digits)}`;
}

function fmtPct(v: number, showPlus = true): string {
  return `${v >= 0 && showPlus ? "+" : ""}${v.toFixed(2)}%`;
}

function col(v: number): string {
  return v >= 0 ? "#4ade80" : "#f87171";
}

function evenIdxs(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  const out = new Set([0, total - 1]);
  const step = (total - 1) / (n - 1);
  for (let i = 1; i < n - 1; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
//  P&L Chart
// ─────────────────────────────────────────────────────────────────────────────
const MG = { top: 18, right: 10, bottom: 30, left: 10 };
const CH = 270;

interface PLPoint { time: number; value: number }
interface SPYPoint { time: number; norm: number }

function PLChart({
  series, spySeries, costBasis, tf, mode,
}: {
  series: PLPoint[];
  spySeries: SPYPoint[];
  costBasis: number;
  tf: ChartTF;
  mode: "$" | "%";
}) {
  const uid     = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize]   = useState<{ w: number; h: number } | null>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size ?? { w: 0, h: 0 };
  const cW = Math.max(1, w - MG.left - MG.right);
  const cH = Math.max(1, h - MG.top - MG.bottom);
  const n  = series.length;

  const [minV, maxV] = useMemo(() => {
    if (!n) return [0, 1];
    const vals = [...series.map((s) => s.value), costBasis];
    if (spySeries.length) vals.push(...spySeries.map((s) => s.norm));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.09 || Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad];
  }, [series, spySeries, costBasis, n]);

  const xS = useCallback(
    (i: number) => MG.left + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW),
    [n, cW]
  );
  const yS = useCallback(
    (v: number) => MG.top + cH - ((v - minV) / (maxV - minV)) * cH,
    [cH, minV, maxV]
  );

  const lastVal  = series.at(-1)?.value ?? 0;
  const firstVal = series[0]?.value ?? costBasis;
  const isUp     = lastVal >= costBasis;
  const lineCol  = isUp ? "#34d399" : "#f87171";
  const fmtV     = (v: number) => mode === "%" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : fmt$(v);

  const priceLine = useMemo(() => {
    if (n < 2) return "";
    return "M" + series.map((s, i) => `${xS(i).toFixed(1)},${yS(s.value).toFixed(1)}`).join(" L");
  }, [series, xS, yS, n]);

  const areaPath = useMemo(() => {
    if (!priceLine || !n) return "";
    return `${priceLine} L${xS(n - 1).toFixed(1)},${(MG.top + cH).toFixed(1)} L${MG.left},${(MG.top + cH).toFixed(1)} Z`;
  }, [priceLine, xS, n, cH]);

  const spyPath = useMemo(() => {
    if (spySeries.length < 2) return "";
    return "M" + spySeries.map((s, i) => {
      const x = MG.left + (i / (spySeries.length - 1)) * cW;
      return `${x.toFixed(1)},${yS(s.norm).toFixed(1)}`;
    }).join(" L");
  }, [spySeries, cW, yS]);

  const costY = useMemo(() => yS(costBasis), [yS, costBasis]);

  const xTicks = useMemo(() => evenIdxs(n, 5), [n]);

  const crosshair = useMemo(() => {
    if (mouseX === null || !n || cW <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (mouseX - MG.left) / cW));
    const idx   = Math.round(ratio * (n - 1));
    const pt    = series[idx];
    if (!pt) return null;
    const si = Math.min(
      Math.round(ratio * (spySeries.length - 1)),
      spySeries.length - 1
    );
    return {
      idx, pt, spyPt: spySeries[si] ?? null,
      cx: xS(idx), cy: yS(pt.value),
    };
  }, [mouseX, series, n, cW, xS, yS, spySeries]);

  if (!size || cW <= 0 || cH <= 0) {
    return (
      <div ref={wrapRef} style={{ height: CH }}
        className="flex items-center justify-center text-[10px] text-[#5a5a6a]">
        {!n ? "Fetching price history…" : ""}
      </div>
    );
  }

  const fmtTick = (ts: number) => {
    const d = new Date(ts * 1000);
    if (tf === "1W") return d.toLocaleDateString("en-US", { weekday: "short" });
    if (tf === "1M") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const tipW  = 152;
  const tipH  = mode === "%" ? (spySeries.length ? 68 : 52) : (spySeries.length ? 92 : 78);

  return (
    <div ref={wrapRef} style={{ height: CH }}>
      <svg width={w} height={h} style={{ display: "block", userSelect: "none" }}
        onMouseMove={(e) => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          setMouseX(x >= MG.left && x <= w - MG.right ? x : null);
        }}
        onMouseLeave={() => setMouseX(null)}
      >
        <defs>
          <linearGradient id={`${uid}ag`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineCol} stopOpacity="0.24" />
            <stop offset="75%"  stopColor={lineCol} stopOpacity="0.05" />
            <stop offset="100%" stopColor={lineCol} stopOpacity="0"    />
          </linearGradient>
          <filter id={`${uid}gf`} x="-30%" y="-100%" width="160%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <clipPath id={`${uid}cp`}>
            <rect x={MG.left} y={MG.top} width={cW} height={cH} />
          </clipPath>
        </defs>

        {/* grid */}
        {[0.25, 0.5, 0.75].map((t, i) => (
          <line key={i}
            x1={MG.left} y1={(MG.top + cH * (1 - t)).toFixed(1)}
            x2={w - MG.right} y2={(MG.top + cH * (1 - t)).toFixed(1)}
            stroke="rgba(255,255,255,0.025)" strokeWidth="1"
          />
        ))}

        {/* cost-basis / break-even reference */}
        {(costBasis > 0 || mode === "%") && (
          <>
            <line
              x1={MG.left} y1={costY.toFixed(1)}
              x2={w - MG.right} y2={costY.toFixed(1)}
              stroke="rgba(255,255,255,0.14)" strokeWidth="1" strokeDasharray="5,6"
            />
            <text x={MG.left + 5} y={costY - 5}
              fill="rgba(255,255,255,0.42)" fontSize="7.5"
              fontFamily="ui-monospace,monospace">
              {mode === "%" ? "Break-even" : `Cost basis · ${fmt$(costBasis)}`}
            </text>
          </>
        )}

        {/* area */}
        {areaPath && (
          <path d={areaPath} fill={`url(#${uid}ag)`} clipPath={`url(#${uid}cp)`} />
        )}

        {/* glow */}
        <path d={priceLine} fill="none"
          stroke={lineCol} strokeOpacity="0.20" strokeWidth="9"
          filter={`url(#${uid}gf)`} clipPath={`url(#${uid}cp)`}
        />

        {/* SPY comparison */}
        {spyPath && (
          <path d={spyPath} fill="none"
            stroke="rgba(148,163,184,0.32)" strokeWidth="1.3" strokeDasharray="4,5"
            clipPath={`url(#${uid}cp)`}
          />
        )}

        {/* portfolio line */}
        <path d={priceLine} fill="none"
          stroke={lineCol} strokeWidth="1.9" strokeLinecap="round"
          clipPath={`url(#${uid}cp)`}
        />

        {/* x-axis labels */}
        {xTicks.map((i) => (
          <text key={i}
            x={xS(i).toFixed(1)} y={MG.top + cH + 18}
            fill="rgba(255,255,255,0.40)" fontSize="8.5"
            fontFamily="ui-sans-serif,sans-serif" textAnchor="middle"
          >{fmtTick(series[i]?.time ?? 0)}</text>
        ))}

        {/* SPY label at end */}
        {spyPath && spySeries.length > 0 && (() => {
          const last = spySeries.at(-1)!;
          const x = MG.left + cW;
          const y = yS(last.norm);
          return (
            <text x={x - 24} y={y - 5}
              fill="rgba(148,163,184,0.45)" fontSize="7.5"
              fontFamily="ui-monospace,monospace">SPY</text>
          );
        })()}

        {/* crosshair */}
        {crosshair && (() => {
          const { cx, cy, pt, spyPt } = crosshair;
          const tipX = cx + tipW + 14 > w - MG.right ? cx - tipW - 8 : cx + 8;
          const tipY = MG.top + 4;
          const d    = new Date(pt.time * 1000);
          const ds   = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

          // rows differ by mode
          let tipRows: [string, string, string][];
          let spyLabel: string | null = null;
          if (mode === "%") {
            tipRows = [
              ["Return", fmtV(pt.value), col(pt.value)],
            ];
            if (spyPt != null) spyLabel = fmtV(spyPt.norm);
          } else {
            const pnl     = pt.value - costBasis;
            const portRet = firstVal > 0 ? ((pt.value - firstVal) / firstVal) * 100 : 0;
            const spyRet  = spyPt && firstVal > 0
              ? ((spyPt.norm - firstVal) / firstVal) * 100 : null;
            tipRows = [
              ["Value", fmt$(pt.value), "#e0e0f0"],
              ["P&L",  `${pnl >= 0 ? "+" : ""}${fmt$(pnl)}`, col(pnl)],
              ["Ret",  fmtPct(portRet), col(portRet)],
            ];
            if (spyRet !== null) spyLabel = fmtPct(spyRet);
          }

          return (
            <>
              <line x1={cx.toFixed(1)} y1={MG.top} x2={cx.toFixed(1)} y2={MG.top + cH}
                stroke="rgba(255,255,255,0.07)" strokeWidth="1"
              />
              <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="5.5"
                fill={lineCol} fillOpacity="0.15"
              />
              <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="2.5"
                fill={lineCol} fillOpacity="0.92"
              />
              <g transform={`translate(${tipX.toFixed(1)},${tipY})`}>
                <rect rx="8" width={tipW} height={tipH}
                  fill="rgba(4,5,14,0.96)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"
                />
                <text x="10" y="14" fill="rgba(255,255,255,0.48)" fontSize="8"
                  fontFamily="ui-sans-serif,sans-serif">{ds}</text>
                <line x1="10" y1="19" x2={tipW - 10} y2="19"
                  stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                />
                {tipRows.map(([label, val, color], i) => (
                  <text key={label} x="10" y={31 + i * 14}
                    fontSize="9.5" fontFamily="ui-monospace,monospace">
                    <tspan fill="rgba(255,255,255,0.44)">{label.padEnd(7)}</tspan>
                    <tspan fill={color}>{val}</tspan>
                  </text>
                ))}
                {spyLabel !== null && (
                  <text x="10" y={31 + tipRows.length * 14} fontSize="9.5" fontFamily="ui-monospace,monospace">
                    <tspan fill="rgba(255,255,255,0.44)">{"SPY    "}</tspan>
                    <tspan fill="rgba(148,163,184,0.75)">{spyLabel}</tspan>
                  </text>
                )}
              </g>
            </>
          );
        })()}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Allocation Donut
// ─────────────────────────────────────────────────────────────────────────────
interface Slice { ticker: string; value: number; color: string; pct: number }

function AllocationDonut({ slices }: { slices: Slice[] }) {
  const [hov, setHov] = useState<string | null>(null);
  const R  = 68;
  const ir = 46;
  const cx = 88;
  const cy = 88;

  const paths = useMemo(() => {
    let cur = -Math.PI / 2;
    return slices.map((sl) => {
      const sweep = (sl.pct / 100) * Math.PI * 2;
      const sa = cur;
      const ea = cur + sweep;
      cur = ea;
      const la = sweep > Math.PI ? 1 : 0;
      const cos = (a: number, r: number) => cx + r * Math.cos(a);
      const sin = (a: number, r: number) => cy + r * Math.sin(a);
      const d = [
        `M${cos(sa, R).toFixed(2)} ${sin(sa, R).toFixed(2)}`,
        `A${R} ${R} 0 ${la} 1 ${cos(ea, R).toFixed(2)} ${sin(ea, R).toFixed(2)}`,
        `L${cos(ea, ir).toFixed(2)} ${sin(ea, ir).toFixed(2)}`,
        `A${ir} ${ir} 0 ${la} 0 ${cos(sa, ir).toFixed(2)} ${sin(sa, ir).toFixed(2)}`,
        "Z",
      ].join(" ");
      return { ...sl, d, mid: (sa + ea) / 2 };
    });
  }, [slices]);

  return (
    <svg width={176} height={176} style={{ overflow: "visible", display: "block", margin: "0 auto" }}>
      {paths.map((p) => {
        const isH  = hov === p.ticker;
        const fade = hov && !isH;
        return (
          <path key={p.ticker} d={p.d}
            fill={p.color}
            fillOpacity={fade ? 0.30 : 0.88}
            stroke="#0c0c10" strokeWidth="2.5"
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              transform: isH ? "scale(1.05)" : "scale(1)",
              transition: "all 0.14s ease",
              cursor: "pointer",
            }}
            onMouseEnter={() => setHov(p.ticker)}
            onMouseLeave={() => setHov(null)}
          />
        );
      })}
      {/* center */}
      <text x={cx} y={cy - 8} textAnchor="middle"
        fill={hov ? PALETTE[slices.findIndex((s) => s.ticker === hov) % PALETTE.length] : "#e0e0f0"}
        fontSize="13" fontWeight="700" fontFamily="ui-monospace,monospace">
        {hov ?? slices.length}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle"
        fill="#3a3a4a" fontSize="8" fontFamily="ui-sans-serif,sans-serif">
        {hov
          ? `${slices.find((s) => s.ticker === hov)?.pct.toFixed(1)}%`
          : (slices.length === 1 ? "position" : "positions")}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Analytics mini-stat card
// ─────────────────────────────────────────────────────────────────────────────
function AnalyticsStat({
  label, value, sub, valueColor,
}: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="rounded-xl border border-[#161620] px-3.5 py-3" style={{ background: "#090910" }}>
      <div className="text-[7.5px] uppercase tracking-widest text-[#5a5a6a] font-semibold mb-2">
        {label}
      </div>
      <div className="text-[15px] font-bold font-mono tabular-nums leading-none"
        style={{ color: valueColor ?? "#c0c0cc" }}>
        {value}
      </div>
      {sub && (
        <div className="mt-1.5 text-[8.5px] text-[#5a5a6a] font-mono">{sub}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Position P&L diverging bars
// ─────────────────────────────────────────────────────────────────────────────
function PnLBars({ rows }: {
  rows: { id: string; ticker: string; pnlPct: number; pnl: number }[];
}) {
  const sorted = [...rows].sort((a, b) => b.pnlPct - a.pnlPct);
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnlPct)), 1);
  return (
    <div className="flex flex-col gap-3.5">
      {sorted.map((r) => {
        const barW  = (Math.abs(r.pnlPct) / maxAbs) * 100;
        const isPos = r.pnlPct >= 0;
        return (
          <div key={r.id} className="flex items-center gap-3 group">
            <span className="text-[10px] font-mono font-semibold text-[#555568] w-12 shrink-0 group-hover:text-[#c0c0cc] transition-colors">
              {r.ticker}
            </span>
            <div className="flex-1 relative h-5 flex items-center">
              <div className="absolute left-1/2 top-1.5 bottom-1.5 w-px bg-[#1e1e2a]" />
              <div
                className="absolute h-3 rounded-sm transition-all duration-500"
                style={{
                  width: `${barW / 2}%`,
                  background: isPos
                    ? "linear-gradient(90deg,rgba(52,211,153,0.45),rgba(74,222,128,0.85))"
                    : "linear-gradient(270deg,rgba(248,113,113,0.45),rgba(248,113,113,0.85))",
                  ...(isPos ? { left: "50%" } : { right: "50%" }),
                }}
              />
            </div>
            <span className="text-[10px] font-mono w-14 text-right shrink-0 tabular-nums"
              style={{ color: col(r.pnlPct) }}>
              {fmtPct(r.pnlPct)}
            </span>
            <span className="text-[9px] font-mono w-20 text-right shrink-0 text-[#5a5a6a] tabular-nums">
              {r.pnl >= 0 ? "+" : ""}{fmt$(r.pnl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mini sparkline (30-day) — shown per position in the table
// ─────────────────────────────────────────────────────────────────────────────
function MiniSparkline({ bars }: { bars: Bar[] }) {
  if (bars.length < 3) return (
    <div className="w-16 h-5 rounded-sm bg-[#111118] opacity-30" />
  );
  const prices = bars.map((b) => b.close);
  const lo  = Math.min(...prices);
  const hi  = Math.max(...prices);
  const rng = hi - lo || lo * 0.01 || 1;
  const W = 64, H = 20, PAD = 2;
  const isUp = prices.at(-1)! >= prices[0];
  const stroke = isUp ? "#4ade80" : "#f87171";
  const d = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = PAD + (H - PAD * 2) * (1 - (p - lo) / rng);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const dotY = (PAD + (H - PAD * 2) * (1 - (prices.at(-1)! - lo) / rng)).toFixed(1);
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`sp${isUp ? "u" : "d"}${Math.random().toString(36).slice(2, 6)}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.3"
        strokeOpacity="0.70" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={W} cy={dotY} r="1.8" fill={stroke} fillOpacity="0.9" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reusable labelled input — defined at MODULE level so React never remounts it
// ─────────────────────────────────────────────────────────────────────────────
const INP = "w-full bg-[#080810] border border-[#1a1a26] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[#f0f0f0] placeholder-[#252535] outline-none focus:border-[#34d39960] transition-colors disabled:opacity-40";
const LBL = "block text-[9px] uppercase tracking-widest text-[#5a5a6a] font-semibold mb-1.5";

function ModalField({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      {label && <label className={LBL}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INP}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Add / Edit Position Modal
// ─────────────────────────────────────────────────────────────────────────────
function PositionModal({
  initial, onSave, onClose,
}: {
  initial?: Position;
  onSave: (p: Omit<Position, "id">) => void;
  onClose: () => void;
}) {
  const [ticker,    setTicker]    = useState(initial?.ticker ?? "");
  const [shares,    setShares]    = useState(initial ? String(initial.shares) : "");
  const [costMode,  setCostMode]  = useState<"per-share" | "total">("per-share");
  const [perShare,  setPerShare]  = useState(initial ? String(initial.avgBuyPrice) : "");
  const [totalInv,  setTotalInv]  = useState(
    initial ? String((initial.avgBuyPrice * initial.shares).toFixed(2)) : ""
  );
  const [selName,   setSelName]   = useState(initial?.name ?? "");
  const [results,   setResults]   = useState<{ symbol: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropOpen,  setDropOpen]  = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = (v: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/market/search?q=${encodeURIComponent(v)}`);
        const d = await r.json();
        setResults(d.results ?? []);
        setDropOpen(true);
      } finally { setSearching(false); }
    }, 280);
  };

  const pick = (r: { symbol: string; name: string }) => {
    setTicker(r.symbol);
    setSelName(r.name);
    setResults([]);
    setDropOpen(false);
  };

  const sharesNum = Number(shares);
  const avgBuyPrice = costMode === "per-share"
    ? Number(perShare)
    : (sharesNum > 0 ? Number(totalInv) / sharesNum : 0);
  const totalInvested = costMode === "per-share"
    ? sharesNum * Number(perShare)
    : Number(totalInv);
  const valid = ticker.length > 0 && sharesNum > 0 && avgBuyPrice > 0;

  const switchMode = (next: "per-share" | "total") => {
    if (next === "total" && Number(perShare) > 0 && sharesNum > 0) {
      setTotalInv((Number(perShare) * sharesNum).toFixed(2));
    } else if (next === "per-share" && Number(totalInv) > 0 && sharesNum > 0) {
      setPerShare((Number(totalInv) / sharesNum).toFixed(4).replace(/\.?0+$/, ""));
    }
    setCostMode(next);
  };

  const save = () => {
    if (!valid) return;
    onSave({
      ticker:  ticker.toUpperCase(),
      shares:  sharesNum,
      avgBuyPrice,
      name:    selName || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}>
      <div className="w-full max-w-sm rounded-2xl border border-[#1a1a26] overflow-hidden shadow-2xl"
        style={{ background: "#0b0b12" }}>

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#141420]">
          <span className="text-[13px] font-semibold text-[#e0e0f0]">
            {initial ? "Edit Position" : "Add Position"}
          </span>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#5a5a6a] hover:text-[#767676] hover:bg-[#161620] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* body */}
        <div className="p-5 flex flex-col gap-4">

          {/* ticker with autocomplete */}
          <div>
            <label className={LBL}>Ticker Symbol</label>
            <div className="relative">
              <input
                value={ticker}
                disabled={!!initial}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setTicker(v);
                  setSelName("");
                  doSearch(v);
                }}
                onBlur={() => setTimeout(() => setDropOpen(false), 160)}
                onFocus={() => results.length && setDropOpen(true)}
                placeholder="AAPL"
                className={INP}
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-[#34d399] border-t-transparent animate-spin" />
              )}
              {dropOpen && results.length > 0 && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 rounded-xl border border-[#1a1a26] overflow-hidden shadow-2xl"
                  style={{ background: "#0d0d16" }}>
                  {results.slice(0, 6).map((r) => (
                    <button key={r.symbol}
                      onMouseDown={() => pick(r)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#13131e] transition-colors text-left">
                      <span className="text-[11px] font-mono font-bold text-[#34d399] w-16 shrink-0">
                        {r.symbol}
                      </span>
                      <span className="text-[10px] text-[#767676] truncate">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selName && (
              <p className="mt-1.5 text-[10px] text-[#34d399] font-medium truncate">{selName}</p>
            )}
          </div>

          {/* shares */}
          <ModalField label="Shares" value={shares} onChange={setShares} placeholder="100" type="number" />

          {/* cost input with per-share / total toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className={LBL} style={{ margin: 0 }}>Avg Buy Price</span>
              <div className="flex items-center gap-0.5 rounded-md border border-[#141420] p-0.5"
                style={{ background: "#080810" }}>
                <button type="button" onClick={() => switchMode("per-share")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[8px] font-semibold tracking-wide transition-colors",
                    costMode === "per-share" ? "bg-[#1a1a26] text-[#c0c0cc]" : "text-[#5a5a6a] hover:text-[#767676]"
                  )}>
                  Per share
                </button>
                <button type="button" onClick={() => switchMode("total")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[8px] font-semibold tracking-wide transition-colors",
                    costMode === "total" ? "bg-[#1a1a26] text-[#c0c0cc]" : "text-[#5a5a6a] hover:text-[#767676]"
                  )}>
                  Total invested
                </button>
              </div>
            </div>
            {costMode === "per-share" ? (
              <ModalField label="" value={perShare} onChange={setPerShare} placeholder="150.00" type="number" />
            ) : (
              <ModalField label="" value={totalInv} onChange={setTotalInv} placeholder="15000.00" type="number" />
            )}
          </div>

          {/* computed summary row */}
          {totalInvested > 0 && (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#141420]"
              style={{ background: "#080810" }}>
              {costMode === "per-share" ? (
                <>
                  <span className="text-[9px] uppercase tracking-widest text-[#5a5a6a] font-semibold">Total invested</span>
                  <span className="text-[12px] font-mono font-semibold text-[#c0c0cc]">{fmt$(totalInvested)}</span>
                </>
              ) : (
                <>
                  <span className="text-[9px] uppercase tracking-widest text-[#5a5a6a] font-semibold">Avg buy price / share</span>
                  <span className="text-[12px] font-mono font-semibold text-[#c0c0cc]">
                    {avgBuyPrice > 0 ? fmt$(avgBuyPrice) : "—"}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#1a1a26] text-[11px] font-medium text-[#5a5a6a] hover:text-[#767676] hover:border-[#252535] transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={!valid}
            className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            style={{
              background: valid
                ? "linear-gradient(135deg, rgba(52,211,153,0.22), rgba(16,185,129,0.13))"
                : undefined,
              border: valid ? "1px solid rgba(52,211,153,0.40)" : "1px solid #1a1a26",
              color: valid ? "#34d399" : "#2a2a3a",
            }}>
            {initial ? "Save Changes" : "Add Position"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Hero stat card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({
  label, main, sub, trend,
}: {
  label: string;
  main: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  const mainColor =
    trend === "up"   ? "#4ade80" :
    trend === "down" ? "#f87171" : "#e0e0f0";
  const subColor =
    trend === "up"   ? "rgba(74,222,128,0.55)" :
    trend === "down" ? "rgba(248,113,113,0.55)" : "#3a3a4a";

  return (
    <div className="rounded-xl border border-[#1a1a22] px-4 py-4"
      style={{ background: "#0c0c10" }}>
      <div className="text-[8px] uppercase tracking-widest text-[#5a5a6a] font-semibold mb-2">
        {label}
      </div>
      <div className="text-[19px] font-bold font-mono tabular-nums leading-none"
        style={{ color: mainColor }}>
        {main}
      </div>
      {sub && (
        <div className="mt-1 text-[10px] font-mono tabular-nums"
          style={{ color: subColor }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Page header
// ─────────────────────────────────────────────────────────────────────────────
function PageHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#141414]"
      style={{ background: "rgba(8,8,8,0.94)", backdropFilter: "blur(14px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        <a href="/"
          className="flex items-center gap-1.5 text-[#5a5a6a] hover:text-[#767676] transition-colors shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium hidden sm:block">Home</span>
        </a>
        <div className="w-px h-4 bg-[#1e1e1e] shrink-0" />
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-[#34d399]"
            style={{ filter: "drop-shadow(0 0 5px rgba(52,211,153,0.45))" }} />
          <span className="text-[13px] font-semibold text-[#e0e0f0] tracking-wide">Portfolio</span>
        </div>
        <div className="flex-1" />
        <button onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(52,211,153,0.18), rgba(16,185,129,0.10))",
            border: "1px solid rgba(52,211,153,0.35)",
            color: "#34d399",
          }}>
          <Plus className="w-3.5 h-3.5" />
          <span>Add Position</span>
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { positions, addPosition, updatePosition, removePosition } =
    usePortfolioStore();

  const [chartTf,   setChartTf]   = useState<ChartTF>("3M");
  const [chartMode, setChartMode] = useState<"$" | "%">("$");
  const [showModal, setShowModal] = useState(false);
  const [editPos, setEditPos]     = useState<Position | null>(null);

  // ── live quotes ─────────────────────────────────────────────────────────────
  const quoteResults = useQueries({
    queries: positions.map((p) => ({
      queryKey:        ["pf-quote", p.ticker],
      queryFn:         () =>
        fetch(`/api/market/quote/${encodeURIComponent(p.ticker)}`).then((r) => r.json()),
      staleTime:       30_000,
      refetchInterval: 30_000,
    })),
  });

  // ── price history (all positions + SPY) ─────────────────────────────────────
  const allTickers = useMemo(
    () => [...new Set([...positions.map((p) => p.ticker), "SPY"])],
    [positions]
  );

  const histResults = useQueries({
    queries: allTickers.map((ticker) => ({
      queryKey:  ["pf-hist", ticker],
      queryFn:   () =>
        fetch(`/api/market/history/${encodeURIComponent(ticker)}?tf=1Y`).then(
          (r) => r.json()
        ) as Promise<{ bars: Bar[] }>,
      staleTime: 5 * 60_000,
      enabled:   positions.length > 0,
    })),
  });

  // ── portfolio metrics ────────────────────────────────────────────────────────
  const quotesLoading = quoteResults.some((q) => q.isLoading);

  const metrics = useMemo(() => {
    // Build ticker → quote map keyed by ticker symbol (not by array index) so
    // add/remove operations can never point to the wrong ticker's data.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quoteMap = new Map<string, any>();
    positions.forEach((p, i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = quoteResults[i]?.data as any;
      if (d?.price != null && !quoteMap.has(p.ticker)) quoteMap.set(p.ticker, d);
    });

    const rows = positions.map((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q        = quoteMap.get(p.ticker) as any;
      const price    = q?.price    ?? p.avgBuyPrice;  // fallback while loading
      const mktVal   = price * p.shares;
      const buyVal   = p.avgBuyPrice * p.shares;
      const pnl      = mktVal - buyVal;
      const pnlPct   = buyVal > 0 ? (pnl / buyVal) * 100 : 0;
      // q.change is absolute $ change per share; multiply by shares for position change
      const dayChg    = (q?.change ?? 0) * p.shares;
      // q.changePercent is already a percentage (e.g. 1.5 means +1.5%)
      const dayChgPct = q?.changePercent ?? 0;
      const name      = q?.name ?? p.name ?? p.ticker;
      return {
        id: p.id, ticker: p.ticker, shares: p.shares, avgBuyPrice: p.avgBuyPrice,
        name, price, mktVal, buyVal, pnl, pnlPct, dayChg, dayChgPct,
        weight: 0,
      };
    });

    const totalValue   = rows.reduce((s, r) => s + r.mktVal, 0);
    const totalInvested = rows.reduce((s, r) => s + r.buyVal, 0);
    const totalPnl      = totalValue - totalInvested;
    const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const dayPnl       = rows.reduce((s, r) => s + r.dayChg, 0);
    // Yesterday's value = today's value minus today's gain/loss
    const prevValue    = totalValue - dayPnl;
    const dayPnlPct    = prevValue > 0 ? (dayPnl / prevValue) * 100 : 0;

    const finalRows = rows.map((r) => ({
      ...r,
      weight: totalValue > 0 ? (r.mktVal / totalValue) * 100 : 0,
    }));

    const sorted = [...finalRows].sort((a, b) => b.pnlPct - a.pnlPct);
    const best   = sorted[0] ?? null;
    const worst  = sorted.at(-1) ?? null;

    return {
      rows: finalRows, totalValue, totalInvested,
      totalPnl, totalPnlPct, dayPnl, dayPnlPct,
      best, worst,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, quoteResults]);

  // ── P&L time series ──────────────────────────────────────────────────────────
  const { portfolioSeries, spySeries } = useMemo(() => {
    if (!positions.length) return { portfolioSeries: [], spySeries: [] };

    const daysBack = TF_DAYS[chartTf];
    const cutoff   = Date.now() / 1000 - daysBack * 86400;

    // Build ticker → index in allTickers
    const tickerIdx: Record<string, number> = {};
    allTickers.forEach((t, i) => { tickerIdx[t] = i; });

    // Sorted bars per position ticker
    const positionBars: Bar[][] = positions.map(
      (p) => (histResults[tickerIdx[p.ticker]]?.data?.bars ?? [])
        .filter((b) => b.time >= cutoff)
        .sort((a, b) => a.time - b.time)
    );

    // Collect all unique timestamps from position tickers
    const allTimes = new Set<number>();
    positionBars.forEach((bars) => bars.forEach((b) => allTimes.add(b.time)));
    if (!allTimes.size) return { portfolioSeries: [], spySeries: [] };
    const times = [...allTimes].sort((a, b) => a - b);

    // For a given ticker index + time, find the last close ≤ time
    const getPrice = (tiIdx: number, time: number): number | null => {
      const bars: Bar[] = histResults[tiIdx]?.data?.bars ?? [];
      let best: number | null = null;
      for (const b of bars) {
        if (b.time <= time) best = b.close;
        else break;
      }
      return best;
    };

    const portfolioSeries: PLPoint[] = [];
    for (const time of times) {
      let value = 0;
      let ok    = true;
      for (const p of positions) {
        const price = getPrice(tickerIdx[p.ticker], time);
        if (price == null) { ok = false; break; }
        value += price * p.shares;
      }
      if (ok) portfolioSeries.push({ time, value });
    }

    // SPY normalised to portfolio's first value
    const spyIdx     = tickerIdx["SPY"];
    const spyRawBars: Bar[] = (histResults[spyIdx]?.data?.bars ?? [])
      .filter((b) => b.time >= cutoff)
      .sort((a, b) => a.time - b.time);
    const startPort = portfolioSeries[0]?.value ?? 1;
    const startSpy  = spyRawBars[0]?.close ?? 1;
    const spySeries: SPYPoint[] = spyRawBars.map((b) => ({
      time: b.time,
      norm: startPort * (b.close / startSpy),
    }));

    return { portfolioSeries, spySeries };
  }, [positions, histResults, allTickers, chartTf]);

  // ── allocation slices ────────────────────────────────────────────────────────
  const slices = useMemo<Slice[]>(() =>
    metrics.rows
      .filter((r) => r.mktVal > 0)
      .sort((a, b) => b.mktVal - a.mktVal)
      .map((r, i) => ({
        ticker: r.ticker,
        value:  r.mktVal,
        color:  PALETTE[i % PALETTE.length],
        pct:    r.weight,
      })),
    [metrics.rows]
  );

  // ── 30-day price history map (for sparklines) ───────────────────────────────
  const histMap = useMemo(() => {
    const map = new Map<string, Bar[]>();
    const cutoff = Date.now() / 1000 - 30 * 86400;
    allTickers.forEach((t, i) => {
      const bars = (histResults[i]?.data?.bars ?? [])
        .filter((b) => b.time >= cutoff)
        .sort((a, b) => a.time - b.time);
      map.set(t, bars);
    });
    return map;
  }, [allTickers, histResults]);

  // ── chart display series ($ vs % mode) ──────────────────────────────────────
  const displaySeries = useMemo<PLPoint[]>(() => {
    if (chartMode === "%" && portfolioSeries.length > 0) {
      const first = portfolioSeries[0].value;
      if (first <= 0) return portfolioSeries;
      return portfolioSeries.map((pt) => ({
        time: pt.time,
        value: ((pt.value - first) / first) * 100,
      }));
    }
    return portfolioSeries;
  }, [portfolioSeries, chartMode]);

  const displaySpySeries = useMemo<SPYPoint[]>(() => {
    if (chartMode === "%" && spySeries.length > 0 && portfolioSeries.length > 0) {
      const firstPort = portfolioSeries[0].value;
      if (firstPort <= 0) return spySeries;
      return spySeries.map((pt) => ({
        time: pt.time,
        norm: ((pt.norm - firstPort) / firstPort) * 100,
      }));
    }
    return spySeries;
  }, [spySeries, portfolioSeries, chartMode]);

  // ── monthly returns heatmap ──────────────────────────────────────────────────
  const monthlyReturns = useMemo(() => {
    if (portfolioSeries.length < 5) return [];
    const byMonth = new Map<string, { first: number; last: number; year: number; month: number }>();
    for (const pt of portfolioSeries) {
      const d    = new Date(pt.time * 1000);
      const key  = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const ex   = byMonth.get(key);
      if (!ex) byMonth.set(key, { first: pt.value, last: pt.value, year: d.getFullYear(), month: d.getMonth() });
      else ex.last = pt.value;
    }
    return [...byMonth.values()]
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map(({ first, last, year, month }) => ({
        key: `${year}-${month}`,
        label: new Date(year, month).toLocaleDateString("en-US", { month: "short" }),
        year,
        ret: first > 0 ? ((last - first) / first) * 100 : 0,
      }));
  }, [portfolioSeries]);

  // ── performance analytics ────────────────────────────────────────────────────
  const analysis = useMemo(() => {
    if (portfolioSeries.length < 5) return null;

    const portRets: number[] = [];
    for (let i = 1; i < portfolioSeries.length; i++) {
      portRets.push(
        (portfolioSeries[i].value - portfolioSeries[i - 1].value) / portfolioSeries[i - 1].value
      );
    }
    const mean     = portRets.reduce((s, r) => s + r, 0) / portRets.length;
    const variance = portRets.reduce((s, r) => s + (r - mean) ** 2, 0) / portRets.length;
    const dailyVol  = Math.sqrt(variance);
    const annualVol = dailyVol * Math.sqrt(252) * 100;

    let peak = portfolioSeries[0].value;
    let maxDD = 0;
    for (const pt of portfolioSeries) {
      if (pt.value > peak) peak = pt.value;
      const dd = (pt.value - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }

    const portReturn =
      ((portfolioSeries.at(-1)!.value - portfolioSeries[0].value) / portfolioSeries[0].value) * 100;

    let spyReturn: number | null = null;
    let spyVol: number | null    = null;
    if (spySeries.length >= 5) {
      spyReturn = ((spySeries.at(-1)!.norm - spySeries[0].norm) / spySeries[0].norm) * 100;
      const spyRets: number[] = [];
      for (let i = 1; i < spySeries.length; i++) {
        spyRets.push((spySeries[i].norm - spySeries[i - 1].norm) / spySeries[i - 1].norm);
      }
      const sM = spyRets.reduce((s, r) => s + r, 0) / spyRets.length;
      const sV = spyRets.reduce((s, r) => s + (r - sM) ** 2, 0) / spyRets.length;
      spyVol = Math.sqrt(sV) * Math.sqrt(252) * 100;
    }

    const alpha    = spyReturn != null ? portReturn - spyReturn : null;
    const sharpe   = dailyVol > 0 ? (mean / dailyVol) * Math.sqrt(252) : 0;
    const bestDay  = Math.max(...portRets) * 100;
    const worstDay = Math.min(...portRets) * 100;

    return { annualVol, maxDD: maxDD * 100, portReturn, spyReturn, spyVol, alpha, sharpe, bestDay, worstDay };
  }, [portfolioSeries, spySeries]);

  // ── auto insights ─────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const list: { type: "good" | "warn" | "info"; text: string }[] = [];

    // Alpha vs SPY
    if (analysis?.alpha != null) {
      if (analysis.alpha > 1) {
        list.push({ type: "good", text: `Beating SPY by +${analysis.alpha.toFixed(1)}% over ${chartTf}` });
      } else if (analysis.alpha < -2) {
        list.push({ type: "warn", text: `Trailing SPY by ${Math.abs(analysis.alpha).toFixed(1)}% over ${chartTf}` });
      } else {
        list.push({ type: "info", text: `Tracking close to SPY (${analysis.alpha >= 0 ? "+" : ""}${analysis.alpha.toFixed(1)}% vs benchmark) over ${chartTf}` });
      }
    }

    // Win rate
    const profitable = metrics.rows.filter((r) => r.pnl > 0).length;
    const total = metrics.rows.length;
    if (total > 0) {
      const rate = (profitable / total) * 100;
      list.push({
        type: rate >= 60 ? "good" : rate >= 40 ? "info" : "warn",
        text: `${profitable} of ${total} position${total !== 1 ? "s" : ""} in the green — ${rate.toFixed(0)}% win rate`,
      });
    }

    // Top performer
    if (metrics.best && metrics.best.pnlPct > 15) {
      list.push({
        type: "good",
        text: `${metrics.best.name ?? metrics.best.ticker} is your top performer at ${fmtPct(metrics.best.pnlPct)}`,
      });
    }

    // Biggest drag
    if (metrics.worst && metrics.worst.pnlPct < -10) {
      list.push({
        type: "warn",
        text: `${metrics.worst.ticker} is dragging at ${fmtPct(metrics.worst.pnlPct)} — worth reviewing this position`,
      });
    }

    // Concentration risk
    const topByWeight = [...metrics.rows].sort((a, b) => b.weight - a.weight)[0];
    if (topByWeight && topByWeight.weight > 40) {
      list.push({
        type: "warn",
        text: `Concentration risk: ${topByWeight.ticker} accounts for ${topByWeight.weight.toFixed(0)}% of your portfolio`,
      });
    }

    // Volatility vs SPY
    if (analysis?.annualVol != null && analysis.spyVol != null) {
      const ratio = analysis.annualVol / analysis.spyVol;
      if (ratio > 1.4) {
        list.push({
          type: "warn",
          text: `Portfolio volatility (${analysis.annualVol.toFixed(1)}%) is ${((ratio - 1) * 100).toFixed(0)}% higher than SPY — consider diversifying`,
        });
      } else if (ratio < 0.8) {
        list.push({
          type: "good",
          text: `Low volatility: ${analysis.annualVol.toFixed(1)}% vs SPY ${analysis.spyVol.toFixed(1)}% — well-diversified portfolio`,
        });
      }
    }

    // Sharpe callout
    if (analysis?.sharpe != null) {
      if (analysis.sharpe >= 1.5) {
        list.push({ type: "good", text: `Strong risk-adjusted returns: Sharpe ratio of ${analysis.sharpe.toFixed(2)}` });
      } else if (analysis.sharpe < 0) {
        list.push({ type: "warn", text: `Negative Sharpe ratio (${analysis.sharpe.toFixed(2)}) — returns aren't compensating for risk taken` });
      }
    }

    return list.slice(0, 6);
  }, [metrics, analysis, chartTf]);

  // ── portfolio health grade ───────────────────────────────────────────────────
  const portfolioGrade = useMemo(() => {
    let score = 50;
    const total = metrics.rows.length;
    const profitable = metrics.rows.filter((r) => r.pnl > 0).length;

    // Win rate: ±20 pts
    if (total > 0) score += ((profitable / total) - 0.5) * 40;

    // Sharpe: ±25 pts
    if (analysis?.sharpe != null) {
      score += Math.max(-15, Math.min(25, analysis.sharpe * 12));
    }

    // Concentration risk: penalty up to -15 pts
    const topW = [...metrics.rows].sort((a, b) => b.weight - a.weight)[0]?.weight ?? 0;
    score -= Math.max(0, (topW - 30) / 70 * 15);

    // Alpha: ±15 pts
    if (analysis?.alpha != null) {
      score += Math.max(-15, Math.min(15, analysis.alpha * 1.5));
    }

    // Diversification bonus: +5 per tier
    if (total >= 5) score += 5;
    if (total >= 10) score += 5;

    score = Math.max(0, Math.min(100, score));
    const grade =
      score >= 90 ? "A+" : score >= 82 ? "A" :
      score >= 74 ? "B+" : score >= 66 ? "B" :
      score >= 58 ? "C+" : score >= 50 ? "C" :
      score >= 40 ? "D" : "F";

    const gradeColor =
      grade.startsWith("A") ? "#4ade80" :
      grade.startsWith("B") ? "#a3e635" :
      grade.startsWith("C") ? "#f59e0b" : "#f87171";

    return { score: Math.round(score), grade, gradeColor };
  }, [metrics, analysis]);

  // ── empty state ──────────────────────────────────────────────────────────────
  if (!positions.length) {
    return (
      <div className="min-h-screen" style={{ background: "#080808" }}>
        <PageHeader onAdd={() => setShowModal(true)} />
        <div className="flex items-center justify-center"
          style={{ minHeight: "calc(100vh - 56px)" }}>
          <div className="flex flex-col items-center gap-6 text-center max-w-xs px-6">
            <div className="w-16 h-16 rounded-2xl border border-[#1a1a26] flex items-center justify-center"
              style={{
                background: "rgba(52,211,153,0.04)",
                boxShadow:  "0 0 40px rgba(52,211,153,0.06)",
              }}>
              <Briefcase className="w-7 h-7 text-[#34d399]"
                style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.45))" }} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[#e0e0f0] mb-2">
                Your portfolio is empty
              </p>
              <p className="text-[12px] text-[#68687a] leading-relaxed">
                Add your positions to track P&amp;L, allocation, and performance
                vs the market in real time.
              </p>
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-semibold transition-all hover:scale-105"
              style={{
                background: "linear-gradient(135deg, rgba(52,211,153,0.22), rgba(16,185,129,0.12))",
                border:     "1px solid rgba(52,211,153,0.38)",
                color:      "#34d399",
              }}>
              <Plus className="w-4 h-4" />
              Add your first position
            </button>
          </div>
        </div>
        {showModal && (
          <PositionModal
            onSave={(p) => addPosition(p)}
            onClose={() => setShowModal(false)}
          />
        )}
      </div>
    );
  }

  // ── main render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-y-auto"
      style={{ background: "#080808", scrollbarWidth: "thin", scrollbarColor: "#1e1e1e transparent" }}>
      <PageHeader onAdd={() => setShowModal(true)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24">

        {/* ── hero stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatCard
            label="Portfolio Value"
            main={quotesLoading ? "—" : fmt$(metrics.totalValue)}
          />
          <StatCard
            label="Total P&L"
            main={quotesLoading ? "—" : `${metrics.totalPnl >= 0 ? "+" : ""}${fmt$(metrics.totalPnl)}`}
            sub={quotesLoading ? "loading…" : fmtPct(metrics.totalPnlPct)}
            trend={quotesLoading ? "neutral" : metrics.totalPnl >= 0 ? "up" : "down"}
          />
          <StatCard
            label="Today's Change"
            main={quotesLoading ? "—" : `${metrics.dayPnl >= 0 ? "+" : ""}${fmt$(metrics.dayPnl)}`}
            sub={quotesLoading ? "loading…" : fmtPct(metrics.dayPnlPct)}
            trend={quotesLoading ? "neutral" : metrics.dayPnl >= 0 ? "up" : "down"}
          />
          <StatCard
            label="Total Invested"
            main={fmt$(metrics.totalInvested)}
            trend="neutral"
          />
        </div>

        {/* ── P&L chart + allocation ── */}
        <div className="grid lg:grid-cols-[1fr_296px] gap-4 mb-4">

          {/* chart card */}
          <div className="rounded-xl border border-[#1a1a22] overflow-hidden"
            style={{ background: "#0c0c10" }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[#181820]">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-[#e0e0f0] tracking-wide">
                  Portfolio P&amp;L
                </span>
                {/* best / worst pills */}
                {!quotesLoading && metrics.best && metrics.best.ticker !== metrics.worst?.ticker && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[8.5px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.18)" }}>
                      <TrendingUp className="w-2.5 h-2.5" />
                      {metrics.best.ticker} {fmtPct(metrics.best.pnlPct)}
                    </span>
                    {metrics.worst && (
                      <span className="flex items-center gap-1 text-[8.5px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(248,113,113,0.08)", color: "#f87171", border: "1px solid rgba(248,113,113,0.18)" }}>
                        <TrendingDown className="w-2.5 h-2.5" />
                        {metrics.worst.ticker} {fmtPct(metrics.worst.pnlPct)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* $ / % mode toggle */}
                <div className="flex items-center border border-[#1e1e2a] rounded-md p-0.5 bg-[#090910]">
                  {(["$", "%"] as const).map((m) => (
                    <button key={m} onClick={() => setChartMode(m)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[9.5px] font-mono font-semibold transition-all",
                        chartMode === m
                          ? "bg-[#1a1a26] text-[#c0c0cc]"
                          : "text-[#5a5a6a] hover:text-[#585870]"
                      )}>{m}</button>
                  ))}
                </div>
                {/* time-frame selector */}
                <div className="flex items-center gap-0.5">
                  {CHART_TFS.map((t) => (
                    <button key={t} onClick={() => setChartTf(t)}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                        chartTf === t
                          ? "text-[#ddddf0] bg-[#ffffff0d] border border-[#ffffff18]"
                          : "text-[#5a5a6a] hover:text-[#585870]"
                      )}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* SPY legend */}
            <div className="flex items-center gap-4 px-4 pt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 rounded"
                  style={{ background: portfolioSeries.length && portfolioSeries.at(-1)!.value >= metrics.totalInvested ? "#34d399" : "#f87171" }} />
                <span className="text-[8px] text-[#68687a]">Portfolio</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0 border-t border-dashed border-[#4a5568]" />
                <span className="text-[8px] text-[#68687a]">SPY</span>
              </div>
            </div>

            <PLChart
              series={displaySeries}
              spySeries={displaySpySeries}
              costBasis={chartMode === "%" ? 0 : metrics.totalInvested}
              tf={chartTf}
              mode={chartMode}
            />
          </div>

          {/* allocation card */}
          <div className="rounded-xl border border-[#1a1a22] overflow-hidden"
            style={{ background: "#0c0c10" }}>
            <div className="px-4 pt-3 pb-2.5 border-b border-[#181820]">
              <span className="text-[11px] font-semibold text-[#e0e0f0] tracking-wide">
                Allocation
              </span>
            </div>
            <div className="p-4 flex flex-col items-center gap-4">
              {slices.length > 0 && <AllocationDonut slices={slices} />}
              {/* legend */}
              <div className="w-full flex flex-col gap-2.5">
                {slices.map((s) => (
                  <div key={s.ticker} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="text-[10px] font-mono text-[#767676] w-10 shrink-0">
                      {s.ticker}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-[#111118] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${s.pct}%`, background: s.color, opacity: 0.65 }} />
                    </div>
                    <span className="text-[9px] font-mono text-[#5a5a6a] w-14 text-right shrink-0 tabular-nums">
                      {fmt$(s.value)}
                    </span>
                    <span className="text-[9px] font-mono text-[#68687a] w-9 text-right shrink-0 tabular-nums">
                      {s.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── analytics strip ── */}
        {analysis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <AnalyticsStat
              label={`${chartTf} Return`}
              value={`${analysis.portReturn >= 0 ? "+" : ""}${analysis.portReturn.toFixed(2)}%`}
              sub={analysis.spyReturn != null
                ? `SPY ${analysis.spyReturn >= 0 ? "+" : ""}${analysis.spyReturn.toFixed(1)}%`
                : undefined}
              valueColor={col(analysis.portReturn)}
            />
            <AnalyticsStat
              label="Alpha"
              value={analysis.alpha != null
                ? `${analysis.alpha >= 0 ? "+" : ""}${analysis.alpha.toFixed(2)}%`
                : "—"}
              sub="vs S&P 500"
              valueColor={analysis.alpha != null ? col(analysis.alpha) : "#c0c0cc"}
            />
            <AnalyticsStat
              label="Ann. Volatility"
              value={`${analysis.annualVol.toFixed(1)}%`}
              sub={analysis.spyVol != null ? `SPY ${analysis.spyVol.toFixed(1)}%` : undefined}
              valueColor={
                analysis.spyVol != null && analysis.annualVol > analysis.spyVol * 1.3
                  ? "#f59e0b" : "#c0c0cc"
              }
            />
            <AnalyticsStat
              label="Max Drawdown"
              value={`${analysis.maxDD.toFixed(1)}%`}
              valueColor={analysis.maxDD < -20 ? "#f87171" : analysis.maxDD < -10 ? "#f59e0b" : "#c0c0cc"}
            />
            <AnalyticsStat
              label="Sharpe Ratio"
              value={analysis.sharpe.toFixed(2)}
              sub={
                analysis.sharpe >= 1.5 ? "excellent"
                  : analysis.sharpe >= 1 ? "good"
                  : analysis.sharpe >= 0.5 ? "fair" : "poor"
              }
              valueColor={
                analysis.sharpe >= 1.5 ? "#4ade80"
                  : analysis.sharpe >= 1 ? "#a3e635"
                  : analysis.sharpe >= 0 ? "#f59e0b" : "#f87171"
              }
            />
            <AnalyticsStat
              label="Win Rate"
              value={`${((metrics.rows.filter((r) => r.pnl > 0).length /
                Math.max(metrics.rows.length, 1)) * 100).toFixed(0)}%`}
              sub={`${metrics.rows.filter((r) => r.pnl > 0).length} / ${metrics.rows.length} positions`}
              valueColor={
                metrics.rows.filter((r) => r.pnl > 0).length /
                  Math.max(metrics.rows.length, 1) >= 0.5
                  ? "#4ade80" : "#f87171"
              }
            />
            <AnalyticsStat
              label="Best Day"
              value={`+${analysis.bestDay.toFixed(2)}%`}
              sub={`over ${chartTf}`}
              valueColor="#4ade80"
            />
            <AnalyticsStat
              label="Worst Day"
              value={`${analysis.worstDay.toFixed(2)}%`}
              sub={`over ${chartTf}`}
              valueColor={analysis.worstDay < -3 ? "#f87171" : "#f59e0b"}
            />
          </div>
        )}

        {/* ── monthly returns heatmap ── */}
        {monthlyReturns.length > 1 && (
          <div className="rounded-xl border border-[#1a1a22] overflow-hidden mb-4"
            style={{ background: "#0c0c10" }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[#181820]">
              <span className="text-[11px] font-semibold text-[#e0e0f0] tracking-wide">
                Monthly Returns
              </span>
              <span className="text-[8.5px] text-[#5a5a6a] font-mono uppercase tracking-wider">
                Portfolio performance by month
              </span>
            </div>
            <div className="px-4 py-4 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {monthlyReturns.map(({ key, label, year, ret }) => {
                  const intensity = Math.min(Math.abs(ret) / 8, 1);
                  const isPos     = ret >= 0;
                  const bg        = isPos
                    ? `rgba(74,222,128,${0.07 + intensity * 0.35})`
                    : `rgba(248,113,113,${0.07 + intensity * 0.35})`;
                  const border    = isPos
                    ? `rgba(74,222,128,${0.12 + intensity * 0.32})`
                    : `rgba(248,113,113,${0.12 + intensity * 0.32})`;
                  const textCol   = isPos
                    ? `rgba(74,222,128,${0.55 + intensity * 0.45})`
                    : `rgba(248,113,113,${0.55 + intensity * 0.45})`;
                  return (
                    <div key={key}
                      className="flex flex-col items-center gap-1.5 group cursor-default select-none"
                      title={`${label} ${year}: ${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`}>
                      <div className="w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-transform duration-150 group-hover:scale-110"
                        style={{ background: bg, border: `1px solid ${border}` }}>
                        <span className="text-[9.5px] font-mono font-bold tabular-nums leading-none"
                          style={{ color: textCol }}>
                          {ret >= 0 ? "+" : ""}{ret.toFixed(1)}
                        </span>
                        <span className="text-[7px] font-mono leading-none mt-0.5"
                          style={{ color: textCol, opacity: 0.65 }}>%</span>
                      </div>
                      <span className="text-[7.5px] font-mono text-[#5a5a6a] uppercase tracking-wide">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── position returns + insights ── */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-4">

          {/* position P&L bars */}
          <div className="rounded-xl border border-[#1a1a22] overflow-hidden" style={{ background: "#0c0c10" }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[#181820]">
              <span className="text-[11px] font-semibold text-[#e0e0f0] tracking-wide">
                Position Returns
              </span>
              <span className="text-[8.5px] text-[#5a5a6a] font-mono uppercase tracking-wider">
                Unrealized P&amp;L
              </span>
            </div>
            <div className="p-4 sm:p-5">
              {quotesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="text-[10px] text-[#5a5a6a]">Loading prices…</span>
                </div>
              ) : (
                <PnLBars rows={metrics.rows} />
              )}
            </div>
          </div>

          {/* insights */}
          <div className="rounded-xl border border-[#1a1a22] overflow-hidden" style={{ background: "#0c0c10" }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[#181820]">
              <span className="text-[11px] font-semibold text-[#e0e0f0] tracking-wide">
                Insights
              </span>
              {portfolioGrade.grade !== "F" && (
                <div className="flex items-center gap-2">
                  <span className="text-[8px] uppercase tracking-widest text-[#5a5a6a] font-semibold">
                    Health
                  </span>
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg border font-bold text-[13px] font-mono"
                    style={{
                      background: `${portfolioGrade.gradeColor}14`,
                      borderColor: `${portfolioGrade.gradeColor}30`,
                      color: portfolioGrade.gradeColor,
                    }}>
                    {portfolioGrade.grade}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2">
              {insights.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Shield className="w-5 h-5 text-[#585868]" />
                  <p className="text-[10px] text-[#5a5a6a]">
                    Waiting for market data…
                  </p>
                </div>
              ) : insights.map((ins, i) => (
                <div key={i}
                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
                  style={{
                    background: ins.type === "good"
                      ? "rgba(74,222,128,0.05)"
                      : ins.type === "warn"
                      ? "rgba(245,158,11,0.05)"
                      : "rgba(192,192,204,0.04)",
                    border: `1px solid ${
                      ins.type === "good"
                        ? "rgba(74,222,128,0.12)"
                        : ins.type === "warn"
                        ? "rgba(245,158,11,0.13)"
                        : "rgba(192,192,204,0.06)"
                    }`,
                  }}>
                  {ins.type === "good" ? (
                    <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "rgba(74,222,128,0.65)" }} />
                  ) : ins.type === "warn" ? (
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "rgba(245,158,11,0.75)" }} />
                  ) : (
                    <Activity className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#3a3a4a" }} />
                  )}
                  <span className="text-[10px] leading-relaxed" style={{
                    color: ins.type === "good"
                      ? "rgba(74,222,128,0.75)"
                      : ins.type === "warn"
                      ? "rgba(245,158,11,0.80)"
                      : "#4a4a5a",
                  }}>
                    {ins.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── positions table ── */}
        <div className="rounded-xl border border-[#1a1a22] overflow-hidden"
          style={{ background: "#0c0c10" }}>
          <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[#181820]">
            <span className="text-[11px] font-semibold text-[#e0e0f0] tracking-wide">
              Positions
            </span>
            <span className="text-[9px] text-[#5a5a6a]">
              {positions.length} holding{positions.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="border-b border-[#111116]">
                  {[
                    { label: "Ticker",        align: "left"  },
                    { label: "Shares",        align: "right" },
                    { label: "Avg Buy Price", align: "right" },
                    { label: "Price",         align: "right" },
                    { label: "30D",           align: "right" },
                    { label: "Market Value",  align: "right" },
                    { label: "Day Chg",       align: "right" },
                    { label: "Total P&L",     align: "right" },
                    { label: "Weight",        align: "right" },
                    { label: "",              align: "right" },
                  ].map(({ label, align }, i) => (
                    <th key={i}
                      className="px-4 py-2.5 text-[8px] font-semibold uppercase tracking-widest text-[#585868]"
                      style={{ textAlign: align as "left" | "right" }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.rows.map((row, i) => (
                  <tr key={row.id}
                    className="border-b border-[#0d0d11] last:border-0 hover:bg-[#0e0e16] transition-colors group">

                    {/* ticker + name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-sm shrink-0"
                          style={{ background: PALETTE[i % PALETTE.length] }} />
                        <div>
                          <div className="text-[11px] font-mono font-bold text-[#e0e0f0]">
                            {row.ticker}
                          </div>
                          <div className="text-[8.5px] text-[#5a5a6a] truncate max-w-[96px]">
                            {row.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* shares */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[10px] font-mono text-[#767676]">
                        {row.shares.toLocaleString()}
                      </span>
                    </td>

                    {/* avg cost */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[10px] font-mono text-[#767676]">
                        {fmt$(row.avgBuyPrice)}
                      </span>
                    </td>

                    {/* price */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[11px] font-mono font-medium text-[#e0e0f0]">
                        {quotesLoading ? <span className="text-[#68687a]">—</span> : fmt$(row.price)}
                      </span>
                    </td>

                    {/* 30-day sparkline */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end">
                        <MiniSparkline bars={histMap.get(row.ticker) ?? []} />
                      </div>
                    </td>

                    {/* market value */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[11px] font-mono text-[#c0c0cc]">
                        {quotesLoading ? <span className="text-[#68687a]">—</span> : fmt$(row.mktVal)}
                      </span>
                    </td>

                    {/* day change */}
                    <td className="px-4 py-3.5 text-right">
                      {quotesLoading ? (
                        <span className="text-[10px] font-mono text-[#68687a]">—</span>
                      ) : (
                        <div style={{ color: col(row.dayChg) }}>
                          <div className="text-[10px] font-mono">
                            {row.dayChg >= 0 ? "+" : ""}{fmt$(row.dayChg)}
                          </div>
                          <div className="text-[8.5px]">
                            {fmtPct(row.dayChgPct)}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* total P&L */}
                    <td className="px-4 py-3.5 text-right">
                      {quotesLoading ? (
                        <span className="text-[10px] font-mono text-[#68687a]">—</span>
                      ) : (
                        <div style={{ color: col(row.pnl) }}>
                          <div className="text-[10px] font-mono font-medium">
                            {row.pnl >= 0 ? "+" : ""}{fmt$(row.pnl)}
                          </div>
                          <div className="text-[8.5px]">
                            {fmtPct(row.pnlPct)}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* weight */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-mono text-[#767676]">
                          {row.weight.toFixed(1)}%
                        </span>
                        <div className="w-12 h-0.5 rounded-full bg-[#141420]">
                          <div className="h-full rounded-full"
                            style={{
                              width: `${row.weight}%`,
                              background: PALETTE[i % PALETTE.length],
                              opacity: 0.6,
                            }} />
                        </div>
                      </div>
                    </td>

                    {/* actions (hover) */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditPos({ id: row.id, ticker: row.ticker, shares: row.shares, avgBuyPrice: row.avgBuyPrice, name: row.name }); setShowModal(true); }}
                          className="w-6 h-6 rounded flex items-center justify-center text-[#5a5a6a] hover:text-[#767676] hover:bg-[#161620] transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removePosition(row.id)}
                          className="w-6 h-6 rounded flex items-center justify-center text-[#5a5a6a] hover:text-[#f87171] hover:bg-[rgba(248,113,113,0.10)] transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* totals footer */}
              <tfoot>
                <tr className="border-t border-[#181820]">
                  <td colSpan={5} className="px-4 py-3 text-[9px] uppercase tracking-widest text-[#5a5a6a] font-semibold">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[11px] text-[#c0c0cc]">
                    {fmt$(metrics.totalValue)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div style={{ color: col(metrics.dayPnl) }}
                      className="text-[10px] font-mono font-medium">
                      {metrics.dayPnl >= 0 ? "+" : ""}{fmt$(metrics.dayPnl)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div style={{ color: col(metrics.totalPnl) }}>
                      <div className="text-[10px] font-mono font-bold">
                        {metrics.totalPnl >= 0 ? "+" : ""}{fmt$(metrics.totalPnl)}
                      </div>
                      <div className="text-[8.5px]">
                        {fmtPct(metrics.totalPnlPct)}
                      </div>
                    </div>
                  </td>
                  <td colSpan={2} className="px-4 py-3 text-right font-mono text-[10px] text-[#5a5a6a]">
                    100%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>

      {/* modal */}
      {showModal && (
        <PositionModal
          initial={editPos ?? undefined}
          onSave={(p) => {
            if (editPos) {
              updatePosition(editPos.id, {
                shares: p.shares, avgBuyPrice: p.avgBuyPrice, name: p.name
              });
            } else {
              addPosition(p);
            }
            setEditPos(null);
          }}
          onClose={() => { setShowModal(false); setEditPos(null); }}
        />
      )}
    </div>
  );
}
