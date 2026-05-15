"use client";
import { useRef, useState, useEffect, useMemo, useId } from "react";

// ── shared shapes ────────────────────────────────────────────────────────────
export interface CurvePoint { time: number; equity: number }

/** A decision point after the client-side trade gate has been applied. */
export interface DerivedPoint {
  time: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  confidence: number;
  predictedMovePct: number;
  agreement: number;
  direction: "long" | "short";
  traded: boolean;
  pnlPct: number;
  won: boolean;
  equityAfter: number;
}

interface Props {
  equityCurve:  CurvePoint[];   // [start, ...one per decision point]
  buyHoldCurve: CurvePoint[];   // aligned 1:1 with equityCurve
  points:       DerivedPoint[]; // one per decision point (equityCurve[i+1])
  timeframe:    string;
}

const isIntraday = (tf: string) => tf === "1m" || tf === "5m" || tf === "1h";

function fmtDate(ts: number, tf: string): string {
  const d = new Date(ts * 1000);
  if (isIntraday(tf)) {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export default function StrategyChart({ equityCurve, buyHoldCurve, points, timeframe }: Props) {
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
    const x = (i: number) => PAD.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (eq: number) => PAD.t + (1 - (eq - lo) / (hi - lo)) * innerH;

    const line = (curve: CurvePoint[]) =>
      curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");

    const stratPath = line(equityCurve);
    const bhPath    = line(buyHoldCurve);
    const areaPath  = `${stratPath} L${x(n - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`;

    // y-axis ticks as % return
    const ticks = Array.from({ length: 5 }, (_, i) => {
      const eq = lo + (i / 4) * (hi - lo);
      return { eq, y: y(eq), label: `${eq >= 1 ? "+" : ""}${((eq - 1) * 100).toFixed(0)}%` };
    });

    return { w, h, innerW, innerH, lo, hi, x, y, stratPath, bhPath, areaPath, ticks, n };
  }, [size, equityCurve, buyHoldCurve]);

  const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? 1;
  const up = finalEquity >= 1;
  const stratColor = up ? "#22c55e" : "#ef4444";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    // nearest index
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

          {/* baseline at equity = 1 (break-even) */}
          {geom.lo < 1 && geom.hi > 1 && (
            <line x1={PAD.l} y1={geom.y(1)} x2={geom.w - PAD.r} y2={geom.y(1)}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,3" />
          )}

          {/* buy & hold */}
          <path d={geom.bhPath} fill="none"
            stroke="rgba(255,255,255,0.30)" strokeWidth="1.25" strokeDasharray="4,4"
            strokeLinecap="round" strokeLinejoin="round" />

          {/* strategy area + line */}
          <path d={geom.areaPath} fill={`url(#${uid}area)`} stroke="none" />
          <path d={geom.stratPath} fill="none"
            stroke={stratColor} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />

          {/* decision-point markers (skip index 0 = start) */}
          {points.map((p, i) => {
            const cx = geom.x(i + 1);
            const cy = geom.y(p.equityAfter);
            if (!p.traded) {
              return <circle key={i} cx={cx} cy={cy} r="2.4" fill="#080808"
                stroke="rgba(255,255,255,0.30)" strokeWidth="1" />;
            }
            const c = p.won ? "#22c55e" : "#ef4444";
            return <circle key={i} cx={cx} cy={cy} r="3.2" fill={c}
              stroke="#080808" strokeWidth="1.25" />;
          })}

          {/* x-axis labels: first, middle, last */}
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
        const pt = hoverI > 0 ? points[hoverI - 1] : null;
        const hx = geom.x(hoverI);
        const left = hx > geom.w / 2;
        return (
          <div className="absolute pointer-events-none"
            style={{
              top: PAD.t + 6,
              left: left ? undefined : hx + 12,
              right: left ? geom.w - hx + 12 : undefined,
              background: "rgba(12,12,14,0.97)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 8, padding: "8px 10px", minWidth: 168,
              boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
            }}>
            {pt ? (
              <>
                <div className="text-[10px] font-mono mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {fmtDate(pt.time, timeframe)}
                </div>
                {pt.traded ? (
                  <>
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <span className="text-[10px] uppercase tracking-wide"
                        style={{ color: pt.direction === "long" ? "#22c55e" : "#ef4444" }}>
                        {pt.direction}
                      </span>
                      <span className="text-[11px] font-mono font-semibold"
                        style={{ color: pt.won ? "#22c55e" : "#ef4444" }}>
                        {pt.pnlPct >= 0 ? "+" : ""}{pt.pnlPct.toFixed(2)}%
                      </span>
                    </div>
                    <Row label="Entry"  value={`$${pt.entryPrice.toFixed(2)}`} />
                    <Row label="Exit"   value={`$${pt.exitPrice.toFixed(2)}`} />
                  </>
                ) : (
                  <div className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                    No trade — gate not met
                  </div>
                )}
                <Row label="Pred move" value={`${pt.predictedMovePct >= 0 ? "+" : ""}${pt.predictedMovePct.toFixed(2)}%`} />
                <Row label="Agreement" value={`${(pt.agreement * 100).toFixed(0)}%`} />
                <Row label="Confidence" value={`${pt.confidence}`} />
                <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  <Row label="Equity"   value={`${eq >= 1 ? "+" : ""}${((eq - 1) * 100).toFixed(1)}%`} bright />
                  <Row label="Buy&hold" value={`${bh >= 1 ? "+" : ""}${((bh - 1) * 100).toFixed(1)}%`} />
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-mono mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Start
                </div>
                <Row label="Equity"   value="+0.0%" bright />
                <Row label="Buy&hold" value="+0.0%" />
              </>
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
