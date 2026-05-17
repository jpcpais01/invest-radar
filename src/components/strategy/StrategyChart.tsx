"use client";
import { useRef, useState, useEffect, useMemo, useId } from "react";

// ── shared shapes ────────────────────────────────────────────────────────────
export interface CurvePoint { time: number; equity: number; price?: number; avgCost?: number; value?: number; }

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
export interface BuyEvent  { idx: number; price: number; weight?: number; strategy?: string; }

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
  const [size, setSize]       = useState<{ w: number; h: number } | null>(null);
  const [hoverI, setHoverI]   = useState<number | null>(null);
  const [showStrat,    setShowStrat]    = useState(true);
  const [showBH,       setShowBH]       = useState(true);
  const [showAlpha,    setShowAlpha]    = useState(true);
  const [showStratVal, setShowStratVal] = useState(false);
  const [showDCAVal,   setShowDCAVal]   = useState(false);
  const [showValDiff,  setShowValDiff]  = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    setSize({ w: el.offsetWidth, h: el.offsetHeight });
    return () => ro.disconnect();
  }, []);

  const PAD = { t: 26, r: isInvesting ? 48 : 16, b: 30, l: 52 };

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

    const n = equityCurve.length;

    // primary y-scale: equity curves only
    const all = [...equityCurve.map(p => p.equity), ...buyHoldCurve.map(p => p.equity), 1];
    let lo = Math.min(...all), hi = Math.max(...all);
    const span = hi - lo || 0.02;
    lo -= span * 0.12; hi += span * 0.12;

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

    // shared zero pixel — all secondary lines anchor their 0 here
    const yZero    = y(1);
    const pixAbove = Math.max(yZero - PAD.t, 1);
    const pixBelow = Math.max((PAD.t + innerH) - yZero, 1);
    const anchored = (vals: number[], pxPerUnit: number) =>
      vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${(yZero - v * pxPerUnit).toFixed(1)}`).join(" ");
    const anchoredNullable = (vals: (number | null)[], pxPerUnit: number) => {
      const parts: string[] = []; let mn = true;
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (v == null) { mn = true; continue; }
        parts.push(`${mn ? "M" : "L"}${x(i).toFixed(1)},${(yZero - v * pxPerUnit).toFixed(1)}`);
        mn = false;
      }
      return parts.join(" ");
    };
    const scalePx = (lo: number, hi: number) => Math.min(
      hi > 0 ? pixAbove / hi * 0.85 : Infinity,
      lo < 0 ? pixBelow / Math.abs(lo) * 0.85 : Infinity,
      hi === 0 && lo === 0 ? 1 : Infinity,
    );

    // alpha: stratPnl% - dcaPnl% (percentage points)
    const ratioVals: number[] = equityCurve.map((p, i) => (p.equity - buyHoldCurve[i].equity) * 100);
    const aLo = Math.min(...ratioVals, -1e-10), aHi = Math.max(...ratioVals, 1e-10);
    const alphaPxPerPp = scalePx(aLo, aHi);
    const ratioPath = anchored(ratioVals, alphaPxPerPp);
    const alphaTicks = Array.from({ length: 5 }, (_, i) => {
      const v = aLo + (i / 4) * (aHi - aLo);
      return { y: yZero - v * alphaPxPerPp, label: `${v >= 0 ? "+" : ""}${v.toFixed(0)}pp` };
    });

    // outperf: (stratVal - dcaVal) / dcaVal
    const stratValues = equityCurve.map(p => p.value ?? 0);
    const dcaValues   = buyHoldCurve.map(p => p.value ?? 0);
    const outperfVals: (number | null)[] = stratValues.map((sv, i) => {
      const dv  = dcaValues[i];
      const deq = buyHoldCurve[i].equity;
      if (sv <= 0 || dv < 1e-10 || deq < 1e-10) return null;
      const uInvested = dv / deq; // total cash put into UniformDCA up to this candle
      return (sv - dv) / uInvested;
    });
    const validOP = outperfVals.filter((v): v is number => v != null);
    const opLo = Math.min(...validOP, -1e-10), opHi = Math.max(...validOP, 1e-10);
    const outperfPxPerUnit = scalePx(opLo, opHi);
    const outperfPath = anchoredNullable(outperfVals, outperfPxPerUnit);
    const outperfTicks = Array.from({ length: 5 }, (_, i) => {
      const v = opLo + (i / 4) * (opHi - opLo);
      return { y: yZero - v * outperfPxPerUnit, label: `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%` };
    });

    // absolute value paths (own y-scale)
    const valLo = Math.min(...stratValues, ...dcaValues);
    const valHi = Math.max(...stratValues, ...dcaValues);
    const valSpan = valHi - valLo || 1;
    const yVal = (v: number) => PAD.t + (1 - (v - valLo) / valSpan) * innerH;
    const stratValPath = stratValues.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yVal(v).toFixed(1)}`).join(" ");
    const dcaValPath   = dcaValues.map((v, i)   => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yVal(v).toFixed(1)}`).join(" ");

    return { w, h, innerW, innerH, lo, hi, x, y, stratPath, bhPath, areaPath, ticks, n, ratioVals, ratioPath, alphaTicks, outperfVals, outperfPath, outperfTicks, stratValues, dcaValues, stratValPath, dcaValPath, yVal, yZero, alphaPxPerPp, outperfPxPerUnit };
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

  const bhLabel = isInvesting ? "UniformDCA" : "B&H";

  return (
    <div ref={wrapRef} className="relative w-full h-full" style={{ background: "#080808" }}>
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
          {showBH && (
            <path d={geom.bhPath} fill="none"
              stroke="rgba(255,255,255,0.30)" strokeWidth="1.25" strokeDasharray="4,4"
              strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* alpha line + right axis */}
          {isInvesting && showAlpha && (
            <>
              <line x1={PAD.l} y1={geom.yZero} x2={geom.w - PAD.r} y2={geom.yZero}
                stroke="rgba(167,139,250,0.15)" strokeWidth="1" strokeDasharray="3,3" />
              <path d={geom.ratioPath} fill="none"
                stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="5,3"
                strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
              {geom.alphaTicks.map((t, i) => (
                <text key={`at${i}`} x={geom.w - PAD.r + 6} y={t.y + 3} textAnchor="start"
                  fontSize="9" fontFamily="ui-monospace, monospace"
                  fill="rgba(167,139,250,0.45)">{t.label}</text>
              ))}
            </>
          )}

          {/* outperf line + right axis */}
          {isInvesting && showValDiff && (
            <>
              {!showAlpha && (
                <line x1={PAD.l} y1={geom.yZero} x2={geom.w - PAD.r} y2={geom.yZero}
                  stroke="rgba(251,191,36,0.15)" strokeWidth="1" strokeDasharray="3,3" />
              )}
              <path d={geom.outperfPath} fill="none"
                stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="5,3"
                strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
              {!showAlpha && geom.outperfTicks.map((t, i) => (
                <text key={`opt${i}`} x={geom.w - PAD.r + 6} y={t.y + 3} textAnchor="start"
                  fontSize="9" fontFamily="ui-monospace, monospace"
                  fill="rgba(251,191,36,0.45)">{t.label}</text>
              ))}
            </>
          )}

          {/* absolute value lines (investing mode) */}
          {isInvesting && showDCAVal && (
            <path d={geom.dcaValPath} fill="none"
              stroke="rgba(255,255,255,0.45)" strokeWidth="1.25"
              strokeLinecap="round" strokeLinejoin="round" />
          )}
          {isInvesting && showStratVal && (
            <path d={geom.stratValPath} fill="none"
              stroke={stratColor} strokeWidth="1.25" opacity="0.6"
              strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* strategy area + line */}
          {showStrat && (
            <>
              <path d={geom.areaPath} fill={`url(#${uid}area)`} stroke="none" />
              <path d={geom.stratPath} fill="none"
                stroke={stratColor} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

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
          {showStrat && buyEvents.map((b, i) => {
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
                {showStrat && <circle cx={hx} cy={geom.y(eq)} r="3.5" fill={stratColor}
                  stroke="#080808" strokeWidth="1.5" />}
                {showBH && <circle cx={hx} cy={geom.y(bh)} r="2.8" fill="rgba(255,255,255,0.55)"
                  stroke="#080808" strokeWidth="1.25" />}
                {isInvesting && showStratVal && (
                  <circle cx={hx} cy={geom.yVal(geom.stratValues[hoverI])} r="2.5" fill={stratColor}
                    stroke="#080808" strokeWidth="1.25" opacity="0.7" />
                )}
                {isInvesting && showDCAVal && (
                  <circle cx={hx} cy={geom.yVal(geom.dcaValues[hoverI])} r="2.5" fill="rgba(255,255,255,0.55)"
                    stroke="#080808" strokeWidth="1.25" opacity="0.7" />
                )}
                {isInvesting && showValDiff && (() => {
                  const ov = geom.outperfVals[hoverI];
                  return ov != null ? (
                    <circle cx={hx} cy={geom.yZero - ov * geom.outperfPxPerUnit} r="2.5"
                      fill="#fbbf24" stroke="#080808" strokeWidth="1.25" opacity="0.9" />
                  ) : null;
                })()}
                {isInvesting && showAlpha && (
                  <circle cx={hx} cy={geom.yZero - geom.ratioVals[hoverI] * geom.alphaPxPerPp} r="2.8"
                    fill="#a78bfa" stroke="#080808" strokeWidth="1.25" opacity="0.9" />
                )}
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
        const equityLabel  = isInvesting ? "Portfolio" : "Equity";
        const buyHoldLabel = isInvesting ? "UniformDCA" : "B&H";
        const sharePrice     = equityCurve[hoverI].price;
        const stratAvgCost   = equityCurve[hoverI].avgCost;
        const dcaAvgCost     = buyHoldCurve[hoverI].avgCost;
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
            {isInvesting && (() => {
              const rv = geom.ratioVals[hoverI];
              return <Row label="Strat − DCA" value={`${rv >= 0 ? "+" : ""}${rv.toFixed(1)}pp`} accent />;
            })()}
            {isInvesting && (showStratVal || showDCAVal || showValDiff) && (() => {
              const sv = geom.stratValues[hoverI];
              const dv = geom.dcaValues[hoverI];
              const ov = geom.outperfVals[hoverI];
              const fmt = (v: number) => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(1)}k` : `$${v.toFixed(2)}`;
              return (
                <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  {showStratVal && <Row label="Strat value" value={fmt(sv)} bright />}
                  {showDCAVal   && <Row label="DCA value"   value={fmt(dv)} />}
                  {showValDiff && (
                    <>
                      <Row label="Strat value" value={fmt(sv)} bright />
                      <Row label="DCA value"   value={fmt(dv)} />
                      {ov != null && <Row label="Outperf" value={`${ov >= 0 ? "+" : ""}${(ov * 100).toFixed(1)}%`} accent2 />}
                    </>
                  )}
                </div>
              );
            })()}
            {isInvesting && sharePrice != null && (
              <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <Row label="Share price"   value={`$${sharePrice.toFixed(2)}`} />
                {stratAvgCost != null && <Row label="Strat avg cost" value={`$${stratAvgCost.toFixed(2)}`} />}
                {dcaAvgCost   != null && <Row label="DCA avg cost"   value={`$${dcaAvgCost.toFixed(2)}`} />}
              </div>
            )}

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

      {/* line toggles */}
      <div className="absolute flex items-center gap-1" style={{ top: 6, left: PAD.l }}>
        <Toggle active={showStrat} color={stratColor}             label="Strat"      onClick={() => setShowStrat(v => !v)} />
        <Toggle active={showBH}    color="rgba(255,255,255,0.55)" label={bhLabel}    onClick={() => setShowBH(v => !v)} />
        {isInvesting && (
          <Toggle active={showAlpha}    color="#a78bfa"                    label="Alpha"     onClick={() => setShowAlpha(v => !v)} />
        )}
        {isInvesting && (
          <Toggle active={showStratVal} color={stratColor}                 label="Strat $"   onClick={() => setShowStratVal(v => !v)} />
        )}
        {isInvesting && (
          <Toggle active={showDCAVal}   color="rgba(255,255,255,0.55)"     label="DCA $"     onClick={() => setShowDCAVal(v => !v)} />
        )}
        {isInvesting && (
          <Toggle active={showValDiff}  color="#fbbf24"                    label="Outperf"   onClick={() => setShowValDiff(v => !v)} />
        )}
      </div>
    </div>
  );
}

function Toggle({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-all"
      style={{
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
        border: "1px solid rgba(255,255,255,0.07)",
        opacity: active ? 1 : 0.35,
        cursor: "pointer",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 9, fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.55)", letterSpacing: "0.04em" }}>{label}</span>
    </button>
  );
}

function Row({ label, value, bright, accent, accent2 }: { label: string; value: string; bright?: boolean; accent?: boolean; accent2?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 leading-tight">
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.32)" }}>{label}</span>
      <span className="text-[10px] font-mono"
        style={{ color: accent2 ? "#fbbf24" : accent ? "#a78bfa" : bright ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}>{value}</span>
    </div>
  );
}
