"use client";
import { useRef, useState, useEffect, useMemo, useId } from "react";

interface Props {
  historical: { time: number; close: number }[];
  futureDates: number[];
  lastClose: number;
  scenarios: { bear: number[]; base: number[]; bull: number[] };
  timeframe?: string;       // "5m" | "1h" | "1d"
  isBacktest?: boolean;
  backtestSepTime?: number; // timestamp of last candle fed to AI
  backtestActuals?: number[];// actual closes for the forecast window
}

// ─── margins ──────────────────────────────────────────────────────────────────
const M = { top: 28, right: 72, bottom: 36, left: 16 };

// ─── helpers ──────────────────────────────────────────────────────────────────
const isIntraday = (tf: string) => tf === "1m" || tf === "5m" || tf === "1h";

function fmtDateShort(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtLocalTime(ts: number) {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function localDateKey(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function fmtXTick(ts: number, tf: string, prevTs: number | null): string {
  if (!isIntraday(tf)) return fmtDateShort(ts);
  if (prevTs !== null && localDateKey(ts) !== localDateKey(prevTs))
    return fmtDateShort(ts);
  return fmtLocalTime(ts);
}
function fmtPrice(p: number) {
  if (p >= 10000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1000)  return `$${p.toFixed(0)}`;
  return `$${p.toFixed(2)}`;
}

/** Smooth monotone-horizontal bezier path */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cpx = ((x0 + x1) / 2).toFixed(2);
    d += ` C${cpx},${y0.toFixed(2)} ${cpx},${y1.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return d;
}

/** Pick ~n evenly spaced indices including first and last */
function evenIdxs(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  const out = new Set([0, total - 1]);
  const step = (total - 1) / (n - 1);
  for (let i = 1; i < n - 1; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ForecastChart({
  historical, futureDates, lastClose, scenarios,
  timeframe = "1d",
  isBacktest = false,
  backtestSepTime,
  backtestActuals,
}: Props) {
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
  const cW = w - M.left - M.right;
  const cH = h - M.top  - M.bottom;

  // ── index-based x scale ──────────────────────────────────────────────────────
  // In backtest mode, futureDates are a subset of historical times — do NOT
  // append them again or the scale stretches with phantom points.
  const allTimes = useMemo(
    () => isBacktest
      ? historical.map(b => b.time)
      : [...historical.map(b => b.time), ...futureDates],
    [historical, futureDates, isBacktest]
  );
  const timeToIdx = useMemo(
    () => new Map(allTimes.map((t, i) => [t, i])),
    [allTimes]
  );
  const n  = allTimes.length;
  const xS = (t: number) => M.left + ((timeToIdx.get(t) ?? 0) / (n - 1)) * cW;

  // ── y scale ──────────────────────────────────────────────────────────────────
  const allPrices = useMemo(() => [
    ...historical.map(b => b.close),
    ...scenarios.bear, ...scenarios.base, ...scenarios.bull,
  ], [historical, scenarios]);
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad    = (rawMax - rawMin) * 0.10 || rawMax * 0.04;
  const minP   = rawMin - pad;
  const maxP   = rawMax + pad * 1.5;
  const yS = (p: number) => M.top + cH - ((p - minP) / (maxP - minP)) * cH;

  // ── point arrays ────────────────────────────────────────────────────────────
  const histPts  = historical.map(b => [xS(b.time), yS(b.close)] as [number, number]);
  const lastHist = histPts[histPts.length - 1];

  // In backtest mode the separator is the last candle the AI was fed, not the chart end.
  const sepBar   = isBacktest && backtestSepTime != null
    ? historical.find(b => b.time === backtestSepTime) ?? null
    : null;
  const anchorPt: [number, number] = sepBar
    ? [xS(sepBar.time), yS(sepBar.close)]
    : lastHist;
  const sepX = anchorPt[0];

  // Right edge of the forecast zone tint
  const foreEndX = isBacktest && futureDates.length > 0
    ? xS(futureDates[futureDates.length - 1])
    : w - M.right;

  const scenPts = (prices: number[]) => [
    anchorPt,
    ...prices.map((p, i) => [xS(futureDates[i]), yS(p)] as [number, number]),
  ];

  const histLine  = smooth(histPts);
  const histAreaD = `${histLine} L${lastHist[0].toFixed(2)},${(M.top + cH).toFixed(2)} L${M.left},${(M.top + cH).toFixed(2)} Z`;
  const bearPath  = smooth(scenPts(scenarios.bear));
  const basePath  = smooth(scenPts(scenarios.base));
  const bullPath  = smooth(scenPts(scenarios.bull));

  // ── y-axis ticks ─────────────────────────────────────────────────────────────
  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) =>
    minP + (maxP - minP) * ((i + 0.5) / 5)
  ), [minP, maxP]);

  // ── x-axis ticks ─────────────────────────────────────────────────────────────
  const xTicks = useMemo(
    () => evenIdxs(allTimes.length, 6).map(i => allTimes[i]),
    [allTimes]
  );

  // ── crosshair ────────────────────────────────────────────────────────────────
  const crosshair = useMemo(() => {
    if (mouseX === null || cW <= 0) return null;
    const ratio = (mouseX - M.left) / cW;
    const nearestIdx = Math.round(Math.max(0, Math.min(1, ratio)) * (n - 1));
    const ts = allTimes[nearestIdx];
    const cx = xS(ts);
    const hi = historical.find(b => b.time === ts);
    const fi = futureDates.indexOf(ts);
    return {
      x: cx, time: ts,
      histPrice: hi?.close ?? null,
      bear: fi >= 0 ? scenarios.bear[fi] : null,
      base: fi >= 0 ? scenarios.base[fi] : null,
      bull: fi >= 0 ? scenarios.bull[fi] : null,
      // In backtest mode, when hovering the forecast window, show actual alongside predictions
      isBacktestZone: isBacktest && fi >= 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouseX, allTimes, cW]);

  // ── tooltip sizing ───────────────────────────────────────────────────────────
  const intra = isIntraday(timeframe);
  const tipW  = intra ? 108 : 96;
  const headerH = intra ? 40 : 24;
  // Count price rows: in backtest zone we show actual + 3 scenarios = 4 rows
  const priceRows = crosshair
    ? (crosshair.histPrice !== null ? 1 : 0)
      + (crosshair.bull !== null ? 1 : 0)
      + (crosshair.base !== null ? 1 : 0)
      + (crosshair.bear !== null ? 1 : 0)
    : 0;
  const tipH = headerH + Math.max(priceRows * 18, 14);
  const tipX = crosshair
    ? (crosshair.x + tipW + 16 > w - M.right ? crosshair.x - tipW - 8 : crosshair.x + 12)
    : 0;
  const tipY = M.top + 12;

  return (
    <div ref={wrapRef} className="w-full h-full" style={{ background: "#080808" }}>
      {size && <svg
        width={w} height={h}
        style={{ display: "block" }}
        onMouseMove={e => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          setMouseX(x >= M.left && x <= w - M.right ? x : null);
        }}
        onMouseLeave={() => setMouseX(null)}
      >
        <defs>
          <linearGradient id={`${uid}hg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c0c0cc" stopOpacity="0.13" />
            <stop offset="75%"  stopColor="#c0c0cc" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#c0c0cc" stopOpacity="0" />
          </linearGradient>
          {/* normal forecast tint (left→right) */}
          <linearGradient id={`${uid}fg`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.018" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.005" />
          </linearGradient>
          {/* backtest zone tint — amber tint to signal "this is the past" */}
          <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
          <filter id={`${uid}glow`} x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
          </filter>
          <clipPath id={`${uid}cl`}>
            <rect x={M.left} y={M.top} width={cW} height={cH} />
          </clipPath>
        </defs>

        {/* ── horizontal grid ────────────────────────────────────────────── */}
        {yTicks.map((p, i) => (
          <line key={i}
            x1={M.left} y1={yS(p).toFixed(2)}
            x2={w - M.right} y2={yS(p).toFixed(2)}
            stroke="rgba(255,255,255,0.035)" strokeWidth="1"
          />
        ))}

        {/* ── y-axis labels ──────────────────────────────────────────────── */}
        {yTicks.map((p, i) => (
          <text key={i}
            x={w - M.right + 8} y={yS(p)}
            fill="rgba(255,255,255,0.18)" fontSize="10.5"
            fontFamily="'Geist Mono','ui-monospace','Courier New',monospace"
            dominantBaseline="middle"
          >
            {fmtPrice(p)}
          </text>
        ))}

        {/* ── x-axis labels ──────────────────────────────────────────────── */}
        {xTicks.map((ts, i) => (
          <text key={i}
            x={xS(ts).toFixed(2)} y={h - 10}
            fill="rgba(255,255,255,0.18)" fontSize="10"
            fontFamily="'Inter','ui-sans-serif',sans-serif"
            textAnchor="middle"
          >
            {fmtXTick(ts, timeframe, i > 0 ? xTicks[i - 1] : null)}
          </text>
        ))}

        {/* ── history area ───────────────────────────────────────────────── */}
        <path d={histAreaD} fill={`url(#${uid}hg)`} clipPath={`url(#${uid}cl)`} />

        {/* ── history line ───────────────────────────────────────────────── */}
        <path
          d={histLine} fill="none"
          stroke="rgba(192,192,204,0.50)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── separator ──────────────────────────────────────────────────── */}
        <line
          x1={sepX.toFixed(2)} y1={M.top}
          x2={sepX.toFixed(2)} y2={M.top + cH}
          stroke={isBacktest ? "rgba(245,158,11,0.30)" : "rgba(255,255,255,0.07)"}
          strokeWidth="1" strokeDasharray="4,5"
        />

        {/* ── forecast / backtest zone tint ──────────────────────────────── */}
        <rect
          x={sepX} y={M.top}
          width={Math.max(0, foreEndX - sepX)} height={cH}
          fill={isBacktest ? `url(#${uid}bg)` : `url(#${uid}fg)`}
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── backtest label ─────────────────────────────────────────────── */}
        {isBacktest && (
          <text
            x={(sepX + 6).toFixed(2)} y={(M.top + 14).toFixed(2)}
            fill="rgba(245,158,11,0.45)" fontSize="8.5"
            fontFamily="'Inter','ui-sans-serif',sans-serif"
            fontWeight="600" letterSpacing="0.08em"
          >
            BACKTEST
          </text>
        )}

        {/* ── bear ───────────────────────────────────────────────────────── */}
        <path d={bearPath} fill="none"
          stroke="rgba(239,68,68,0.55)" strokeWidth="1.5"
          strokeDasharray="5,5" strokeLinecap="round"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── bull ───────────────────────────────────────────────────────── */}
        <path d={bullPath} fill="none"
          stroke="rgba(34,197,94,0.55)" strokeWidth="1.5"
          strokeDasharray="5,5" strokeLinecap="round"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── base glow ──────────────────────────────────────────────────── */}
        <path d={basePath} fill="none"
          stroke="rgba(192,192,204,0.22)" strokeWidth="8"
          strokeLinecap="round"
          filter={`url(#${uid}glow)`}
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── base line ──────────────────────────────────────────────────── */}
        <path d={basePath} fill="none"
          stroke="#c0c0cc" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── endpoint markers ───────────────────────────────────────────── */}
        {[
          { p: scenarios.bear, c: "rgba(239,68,68,0.9)",  gc: "rgba(239,68,68,0.15)" },
          { p: scenarios.base, c: "#c0c0cc",               gc: "rgba(192,192,204,0.12)" },
          { p: scenarios.bull, c: "rgba(34,197,94,0.9)",  gc: "rgba(34,197,94,0.15)" },
        ].map(({ p, c, gc }, si) => {
          const ex = xS(futureDates[futureDates.length - 1]);
          const ey = yS(p[p.length - 1]);
          return (
            <g key={si}>
              <circle cx={ex.toFixed(2)} cy={ey.toFixed(2)} r="7" fill={gc} />
              <circle cx={ex.toFixed(2)} cy={ey.toFixed(2)} r="3" fill={c} />
            </g>
          );
        })}

        {/* ── actual outcome marker (backtest only) ──────────────────────── */}
        {isBacktest && backtestActuals && backtestActuals.length > 0 && (() => {
          const ax = xS(futureDates[futureDates.length - 1]);
          const ay = yS(backtestActuals[backtestActuals.length - 1]);
          return (
            <g>
              <circle cx={ax.toFixed(2)} cy={ay.toFixed(2)} r="9"
                fill="rgba(245,158,11,0.12)" />
              <circle cx={ax.toFixed(2)} cy={ay.toFixed(2)} r="3.5"
                fill="rgba(245,158,11,0.95)" />
              <text x={(ax + 6).toFixed(2)} y={(ay - 5).toFixed(2)}
                fill="rgba(245,158,11,0.65)" fontSize="8"
                fontFamily="'Inter','ui-sans-serif',sans-serif"
                fontWeight="600">
                actual
              </text>
            </g>
          );
        })()}

        {/* ── anchor dot (where AI prediction starts) ────────────────────── */}
        <circle cx={anchorPt[0].toFixed(2)} cy={anchorPt[1].toFixed(2)}
          r="3.5" fill={isBacktest ? "rgba(245,158,11,0.80)" : "#c0c0cc"} />
        <circle cx={anchorPt[0].toFixed(2)} cy={anchorPt[1].toFixed(2)}
          r="7" fill={isBacktest ? "rgba(245,158,11,0.10)" : "rgba(192,192,204,0.10)"} />

        {/* ── crosshair ──────────────────────────────────────────────────── */}
        {crosshair && (
          <>
            <line
              x1={crosshair.x.toFixed(2)} y1={M.top}
              x2={crosshair.x.toFixed(2)} y2={M.top + cH}
              stroke="rgba(255,255,255,0.10)" strokeWidth="1"
            />

            {/* dot — on history line, or on base if in forecast zone */}
            {(() => {
              const price = crosshair.histPrice ?? crosshair.base;
              if (price === null) return null;
              const cy = yS(price);
              return (
                <g>
                  <circle cx={crosshair.x.toFixed(2)} cy={cy.toFixed(2)}
                    r="5" fill="rgba(192,192,204,0.12)" />
                  <circle cx={crosshair.x.toFixed(2)} cy={cy.toFixed(2)}
                    r="2.5" fill="rgba(192,192,204,0.9)" />
                </g>
              );
            })()}

            {/* tooltip */}
            {(() => {
              const p1y = headerH + 4;
              // Build price rows dynamically so they never overlap
              type Row = { label: string; price: number; color: string };
              const rows: Row[] = [];
              // In backtest zone show actual first, then scenarios;
              // in pure-history zone show just the historical price
              if (crosshair.histPrice !== null) {
                rows.push({
                  label:  crosshair.isBacktestZone ? "● actual" : "",
                  price:  crosshair.histPrice,
                  color:  crosshair.isBacktestZone
                    ? "rgba(245,158,11,0.90)"
                    : "rgba(192,192,204,0.85)",
                });
              }
              if (crosshair.bull  !== null) rows.push({ label: "↑",  price: crosshair.bull,  color: "rgba(34,197,94,0.85)" });
              if (crosshair.base  !== null) rows.push({ label: "—",  price: crosshair.base,  color: "rgba(192,192,204,0.85)" });
              if (crosshair.bear  !== null) rows.push({ label: "↓",  price: crosshair.bear,  color: "rgba(239,68,68,0.85)" });

              const rowHeight = 18;
              const computedH = headerH + Math.max(rows.length * rowHeight, 14);

              return (
                <g transform={`translate(${tipX.toFixed(2)},${tipY})`}>
                  <rect
                    x="0" y="0" rx="8" ry="8"
                    width={tipW} height={computedH}
                    fill="rgba(10,10,12,0.82)"
                    stroke={crosshair.isBacktestZone
                      ? "rgba(245,158,11,0.18)"
                      : "rgba(255,255,255,0.07)"}
                    strokeWidth="1"
                  />

                  {/* date */}
                  <text x="10" y="15" fill="rgba(255,255,255,0.28)" fontSize="9"
                    fontFamily="'Inter','ui-sans-serif',sans-serif">
                    {fmtDateShort(crosshair.time)}
                  </text>

                  {/* time (intraday) */}
                  {intra && (
                    <text x="10" y="30" fill="rgba(255,255,255,0.70)" fontSize="12"
                      fontWeight="500"
                      fontFamily="'Geist Mono','ui-monospace','Courier New',monospace">
                      {fmtLocalTime(crosshair.time)}
                    </text>
                  )}

                  <line x1="10" y1={headerH - 4} x2={tipW - 10} y2={headerH - 4}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

                  {rows.map((row, ri) => (
                    <text key={ri}
                      x="10" y={p1y + ri * rowHeight}
                      fill={row.color}
                      fontSize={row.label ? 10 : 11}
                      fontWeight={row.label ? "400" : "500"}
                      fontFamily="'Geist Mono','ui-monospace','Courier New',monospace"
                    >
                      {row.label ? `${row.label} ${fmtPrice(row.price)}` : fmtPrice(row.price)}
                    </text>
                  ))}
                </g>
              );
            })()}
          </>
        )}
      </svg>}
    </div>
  );
}
