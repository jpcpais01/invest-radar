"use client";
import { useRef, useState, useEffect, useMemo, useId } from "react";

// ── shared shapes ────────────────────────────────────────────────────────────
export interface CurvePoint { time: number; equity: number }

/** A closed trade from the client-side simulation. */
export interface ChartTrade {
  entryIdx: number;
  exitIdx: number;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  pnlPct: number;
  won: boolean;
  reason: "reversal" | "stop" | "end";
  entryConfidence: number;
  entryAnalysis: string;
}

/** Investing-mode buy event (DCA accumulation). */
export interface BuyEvent  { idx: number; price: number; }

/** Investing-mode sell event (e.g. NoMondays weekly exit). */
export interface SellEvent { idx: number; price: number; entryPrice: number; pnlPct: number; won: boolean; }

interface Props {
  equityCurve:  CurvePoint[];   // one point per candle
  buyHoldCurve: CurvePoint[];   // aligned 1:1 with equityCurve
  trades:       ChartTrade[];
  timeframe:    string;
  accentColor?: string;         // investing mode accent
  buyEvents?:   BuyEvent[];
  sellEvents?:  SellEvent[];
}

const isIntraday = (tf: string) => tf === "1m" || tf === "5m" || tf === "1h";

function fmtDate(ts: number, tf: string): string {
  const d = new Date(ts * 1000);
  if (isIntraday(tf)) {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export default function StrategyChart({ equityCurve, buyHoldCurve, trades, timeframe, accentColor, buyEvents = [], sellEvents = [] }: Props) {
  const isInvesting = buyEvents.length > 0 || sellEvents.length > 0;
  const uid     = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize]     = useState<{ w: number; h: number } | null>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    setSize({ w: el.offsetWidth, h: el.offsetHeight });
    return () => ro.disconnect();
  }, []);

  const PAD = { t: 26, r: 16, b: 30, l: 52 };

  // map candle index → trade events that start / end there
  const events = useMemo(() => {
    const entry = new Map<number, ChartTrade>();
    const exit  = new Map<number, ChartTrade>();
    for (const t of trades) { entry.set(t.entryIdx, t); exit.set(t.exitIdx, t); }
    return { entry, exit };
  }, [trades]);

  const geom = useMemo(() => {
    if (!size || equityCurve.length < 2) return null;
    const { w, h } = size;
    const innerW = w - PAD.l - PAD.r;
    const innerH = h - PAD.t - PAD.b;
    if (innerW <= 0 || innerH <= 0) return null;

    const all = [...equityCurve.map(p => p.equity), ...buyHoldCurve.map(p => p.equity), 1];
    let lo = Math.min(...all), hi = Math.max(...all);
    const span = hi - lo || 0.02;
    lo -= span * 0.12; hi += span * 0.12;

    const n = equityCurve.length;
    const x = (i: number) => PAD.l + (i / (n - 1)) * innerW;
    const y = (eq: number) => PAD.t + (1 - (eq - lo) / (hi - lo)) * innerH;

    const line = (curve: CurvePoint[]) =>
      curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");

    const stratPath = line(equityCurve);
    const bhPath    = line(buyHoldCurve);
    const areaPath  = `${stratPath} L${x(n - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`;

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const eq = lo + (i / 4) * (hi - lo);
      return { eq, y: y(eq), label: `${eq >= 1 ? "+" : ""}${((eq - 1) * 100).toFixed(0)}%` };
    });

    return { w, h, innerW, innerH, lo, hi, x, y, stratPath, bhPath, areaPath, ticks, n };
  }, [size, equityCurve, buyHoldCurve]);

  const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? 1;
  const up = finalEquity >= 1;
  const stratColor = accentColor ?? (up ? "#22c55e" : "#ef4444");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < geom.n; i++) {
      const d = Math.abs(geom.x(i) - px);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHoverI(best);
  };

  return (
    <div ref={wrapRef} className="w-full h-full" style={{ background: "#080808" }}>
      {geom && (
        <svg
          width={geom.w} height={geom.h}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverI(null)}
          style={{ display: "block", animation: "chartIn 0.3s ease forwards" }}
        >
          <defs>
            <linearGradient id={`${uid}area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={stratColor} stopOpacity="0.20" />
              <stop offset="100%" stopColor={stratColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* y grid + labels */}
          {geom.ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={t.y} x2={geom.w - PAD.r} y2={t.y}
                stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <text x={PAD.l - 8} y={t.y + 3} textAnchor="end"
                fontSize="9" fontFamily="ui-monospace, monospace"
                fill="rgba(255,255,255,0.28)">{t.label}</text>
            </g>
          ))}

          {/* break-even baseline */}
          {geom.lo < 1 && geom.hi > 1 && (
            <line x1={PAD.l} y1={geom.y(1)} x2={geom.w - PAD.r} y2={geom.y(1)}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,3" />
          )}

          {/* shade each trade's holding period */}
          {trades.map((t, i) => {
            const x0 = geom.x(t.entryIdx);
            const x1 = geom.x(t.exitIdx);
            const c  = t.direction === "long" ? "34,197,94" : "239,68,68";
            return (
              <rect key={`s${i}`} x={x0} y={PAD.t} width={Math.max(0.5, x1 - x0)} height={geom.innerH}
                fill={`rgba(${c},0.05)`} />
            );
          })}

          {/* buy & hold */}
          <path d={geom.bhPath} fill="none"
            stroke="rgba(255,255,255,0.30)" strokeWidth="1.25" strokeDasharray="4,4"
            strokeLinecap="round" strokeLinejoin="round" />

          {/* strategy area + line */}
          <path d={geom.areaPath} fill={`url(#${uid}area)`} stroke="none" />
          <path d={geom.stratPath} fill="none"
            stroke={stratColor} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />

          {/* trade markers */}
          {trades.map((t, i) => {
            const ex = geom.x(t.exitIdx);
            const ey = geom.y(equityCurve[t.exitIdx]?.equity ?? 1);
            const en = geom.x(t.entryIdx);
            const eny = geom.y(equityCurve[t.entryIdx]?.equity ?? 1);
            const dirC = t.direction === "long" ? "#22c55e" : "#ef4444";
            const exitC = t.won ? "#22c55e" : "#ef4444";
            return (
              <g key={`m${i}`}>
                {/* entry: small triangle pointing in trade direction */}
                <path
                  d={t.direction === "long"
                    ? `M${en},${eny - 4} L${en - 3.2},${eny + 2} L${en + 3.2},${eny + 2} Z`
                    : `M${en},${eny + 4} L${en - 3.2},${eny - 2} L${en + 3.2},${eny - 2} Z`}
                  fill={dirC} opacity="0.9" stroke="#080808" strokeWidth="0.75" />
                {/* exit: filled dot (won/lost); stop-outs get a ring */}
                {t.reason === "stop" && (
                  <circle cx={ex} cy={ey} r="5" fill="none" stroke={exitC} strokeWidth="1" opacity="0.55" />
                )}
                <circle cx={ex} cy={ey} r="3" fill={exitC} stroke="#080808" strokeWidth="1.25" />
              </g>
            );
          })}

          {/* investing: buy event markers (small upward triangles) */}
          {buyEvents.map((b, i) => {
            const bx = geom.x(b.idx);
            const by = geom.y(equityCurve[b.idx]?.equity ?? 1);
            const ac = accentColor ?? "#34d399";
            return (
              <path key={`buy${i}`}
                d={`M${bx},${by - 5} L${bx - 3.5},${by + 1.5} L${bx + 3.5},${by + 1.5} Z`}
                fill={ac} opacity="0.75" stroke="#080808" strokeWidth="0.75" />
            );
          })}

          {/* investing: sell event markers (circles, won=green / lost=red) */}
          {sellEvents.map((s, i) => {
            const sx = geom.x(s.idx);
            const sy = geom.y(equityCurve[s.idx]?.equity ?? 1);
            const exitC = s.won ? "#22c55e" : "#ef4444";
            return (
              <g key={`sell${i}`}>
                {!s.won && <circle cx={sx} cy={sy} r="5" fill="none" stroke={exitC} strokeWidth="1" opacity="0.55" />}
                <circle cx={sx} cy={sy} r="3" fill={exitC} stroke="#080808" strokeWidth="1.25" opacity="0.85" />
              </g>
            );
          })}

          {/* x-axis labels */}
          {[0, Math.floor(geom.n / 2), geom.n - 1].map((i, k) => {
            const ts = equityCurve[i]?.time;
            if (ts == null) return null;
            const anchor = k === 0 ? "start" : k === 2 ? "end" : "middle";
            return (
              <text key={i} x={geom.x(i)} y={geom.h - 10} textAnchor={anchor}
                fontSize="9" fontFamily="ui-monospace, monospace"
                fill="rgba(255,255,255,0.28)">{fmtDate(ts, timeframe)}</text>
            );
          })}

          {/* hover crosshair */}
          {hoverI != null && (() => {
            const hx = geom.x(hoverI);
            const eq = equityCurve[hoverI].equity;
            const bh = buyHoldCurve[hoverI].equity;
            return (
              <g>
                <line x1={hx} y1={PAD.t} x2={hx} y2={geom.h - PAD.b}
                  stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
                <circle cx={hx} cy={geom.y(eq)} r="3.5" fill={stratColor}
                  stroke="#080808" strokeWidth="1.5" />
                <circle cx={hx} cy={geom.y(bh)} r="2.8" fill="rgba(255,255,255,0.55)"
                  stroke="#080808" strokeWidth="1.25" />
              </g>
            );
          })()}
        </svg>
      )}

      {/* tooltip */}
      {geom && hoverI != null && (() => {
        const eq = equityCurve[hoverI].equity;
        const bh = buyHoldCurve[hoverI].equity;
        const hx = geom.x(hoverI);
        const left = hx > geom.w / 2;
        const entryT  = events.entry.get(hoverI);
        const exitT   = events.exit.get(hoverI);
        const buyEvt  = buyEvents.find(b => b.idx === hoverI);
        const sellEvt = sellEvents.find(s => s.idx === hoverI);
        const equityLabel    = isInvesting ? "Portfolio" : "Equity";
        const buyHoldLabel   = "B&H";
        return (
          <div className="absolute pointer-events-none"
            style={{
              top: PAD.t + 6,
              left: left ? undefined : hx + 12,
              right: left ? geom.w - hx + 12 : undefined,
              background: "rgba(12,12,14,0.97)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 8, padding: "8px 10px", minWidth: 174, maxWidth: 230,
              boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
            }}>
            <div className="text-[10px] font-mono mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
              {fmtDate(equityCurve[hoverI].time, timeframe)}
            </div>
            <Row label={equityLabel} value={`${eq >= 1 ? "+" : ""}${((eq - 1) * 100).toFixed(1)}%`} bright />
            <Row label={buyHoldLabel} value={`${bh >= 1 ? "+" : ""}${((bh - 1) * 100).toFixed(1)}%`} />

            {/* investing: buy event */}
            {buyEvt && (
              <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="text-[9px] uppercase tracking-wide" style={{ color: accentColor ?? "#34d399" }}>
                  buy · DCA
                </span>
                <Row label="Price" value={`$${buyEvt.price.toFixed(2)}`} />
              </div>
            )}

            {/* investing: sell event */}
            {sellEvt && (
              <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <span className="text-[9px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                    sell
                  </span>
                  <span className="text-[11px] font-mono font-semibold"
                    style={{ color: sellEvt.won ? "#22c55e" : "#ef4444" }}>
                    {sellEvt.pnlPct >= 0 ? "+" : ""}{sellEvt.pnlPct.toFixed(2)}%
                  </span>
                </div>
                <Row label="Entry" value={`$${sellEvt.entryPrice.toFixed(2)}`} />
                <Row label="Exit"  value={`$${sellEvt.price.toFixed(2)}`} />
              </div>
            )}

            {/* trading: exit event */}
            {exitT && !isInvesting && (
              <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <span className="text-[9px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {exitT.direction} closed · {exitT.reason}
                  </span>
                  <span className="text-[11px] font-mono font-semibold"
                    style={{ color: exitT.won ? "#22c55e" : "#ef4444" }}>
                    {exitT.pnlPct >= 0 ? "+" : ""}{exitT.pnlPct.toFixed(2)}%
                  </span>
                </div>
                <Row label="Entry" value={`$${exitT.entryPrice.toFixed(2)}`} />
                <Row label="Exit"  value={`$${exitT.exitPrice.toFixed(2)}`} />
              </div>
            )}
            {entryT && !exitT && !isInvesting && (
              <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="text-[9px] uppercase tracking-wide"
                  style={{ color: entryT.direction === "long" ? "#22c55e" : "#ef4444" }}>
                  {entryT.direction} opened
                </span>
                <Row label="Entry" value={`$${entryT.entryPrice.toFixed(2)}`} />
                <Row label="Conf"  value={`${entryT.entryConfidence}`} />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Row({ label, value, bright }: { label: string; value: string; bright?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 leading-tight">
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.32)" }}>{label}</span>
      <span className="text-[10px] font-mono"
        style={{ color: bright ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}>{value}</span>
    </div>
  );
}
