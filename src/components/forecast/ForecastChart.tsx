"use client";
import { useRef, useState, useEffect, useMemo, useId } from "react";

interface Props {
  historical: { time: number; close: number }[];
  futureDates: number[];
  lastClose: number;
  scenarios: { bear: number[]; base: number[]; bull: number[] };
  timeframe?: string; // "5m" | "1h" | "1d"
}

// ─── margins ──────────────────────────────────────────────────────────────────
const M = { top: 28, right: 72, bottom: 36, left: 16 };

// ─── helpers ──────────────────────────────────────────────────────────────────
const isIntraday = (tf: string) => tf === "5m" || tf === "1h";

function fmtDateShort(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** UTC HH:MM string */
function fmtUTCTime(ts: number) {
  const d = new Date(ts * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * X-axis tick label.
 * - daily: "Jan 15"
 * - intraday: "HH:MM" on same-day ticks; "Jan 15" on day-boundary ticks.
 */
function fmtXTick(ts: number, tf: string, prevTs: number | null): string {
  if (!isIntraday(tf)) return fmtDateShort(ts);
  if (prevTs !== null) {
    const sameDay =
      new Date(ts * 1000).toISOString().slice(0, 10) ===
      new Date(prevTs * 1000).toISOString().slice(0, 10);
    if (!sameDay) return fmtDateShort(ts);
  }
  return fmtUTCTime(ts);
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
export default function ForecastChart({ historical, futureDates, lastClose, scenarios, timeframe = "1d" }: Props) {
  const uid      = useId().replace(/:/g, "");
  const wrapRef  = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
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

  // ── index-based x scale (no weekend gaps) ──────────────────────────────────
  const allTimes = useMemo(
    () => [...historical.map(b => b.time), ...futureDates],
    [historical, futureDates]
  );
  const timeToIdx = useMemo(
    () => new Map(allTimes.map((t, i) => [t, i])),
    [allTimes]
  );
  const n = allTimes.length;
  const xS = (t: number) => M.left + ((timeToIdx.get(t) ?? 0) / (n - 1)) * cW;

  // ── y scale ─────────────────────────────────────────────────────────────────
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
  const sepX     = lastHist[0];

  const scenPts = (prices: number[]) => [
    lastHist,
    ...prices.map((p, i) => [xS(futureDates[i]), yS(p)] as [number, number]),
  ];

  const histLine  = smooth(histPts);
  const histAreaD = `${histLine} L${lastHist[0].toFixed(2)},${(M.top + cH).toFixed(2)} L${M.left},${(M.top + cH).toFixed(2)} Z`;
  const bearPath  = smooth(scenPts(scenarios.bear));
  const basePath  = smooth(scenPts(scenarios.base));
  const bullPath  = smooth(scenPts(scenarios.bull));

  // ── y-axis ticks (5 nice lines) ─────────────────────────────────────────────
  const yTicks = useMemo(() => Array.from({ length: 5 }, (_, i) =>
    minP + (maxP - minP) * ((i + 0.5) / 5)
  ), [minP, maxP]);

  // ── x-axis ticks ────────────────────────────────────────────────────────────
  const xTicks = useMemo(
    () => evenIdxs(allTimes.length, 6).map(i => allTimes[i]),
    [allTimes]
  );

  // ── crosshair ───────────────────────────────────────────────────────────────
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouseX, allTimes, cW]);

  // tooltip sizing — intraday adds a time row under the date
  const intra   = isIntraday(timeframe);
  const tipW    = intra ? 108 : 96;
  const headerH = intra ? 40 : 24;   // space for date + optional time line
  const tipH    = crosshair?.bull !== null ? headerH + 56 : headerH + 14;
  const tipX    = crosshair
    ? (crosshair.x + tipW + 16 > w - M.right ? crosshair.x - tipW - 8 : crosshair.x + 12)
    : 0;
  const tipY    = M.top + 12;

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
          {/* history area gradient */}
          <linearGradient id={`${uid}hg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c0c0cc" stopOpacity="0.13" />
            <stop offset="75%"  stopColor="#c0c0cc" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#c0c0cc" stopOpacity="0" />
          </linearGradient>
          {/* forecast zone gradient */}
          <linearGradient id={`${uid}fg`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.018" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.005" />
          </linearGradient>
          {/* base line glow blur */}
          <filter id={`${uid}glow`} x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
          </filter>
          {/* clip to chart area */}
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
          stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4,5"
        />

        {/* ── forecast zone tint ─────────────────────────────────────────── */}
        <rect
          x={sepX} y={M.top}
          width={(w - M.right - sepX)} height={cH}
          fill={`url(#${uid}fg)`}
          clipPath={`url(#${uid}cl)`}
        />

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

        {/* ── last-close dot ─────────────────────────────────────────────── */}
        <circle cx={lastHist[0].toFixed(2)} cy={lastHist[1].toFixed(2)}
          r="3.5" fill="#c0c0cc" />
        <circle cx={lastHist[0].toFixed(2)} cy={lastHist[1].toFixed(2)}
          r="7" fill="rgba(192,192,204,0.10)" />

        {/* ── crosshair ──────────────────────────────────────────────────── */}
        {crosshair && (
          <>
            {/* vertical line */}
            <line
              x1={crosshair.x.toFixed(2)} y1={M.top}
              x2={crosshair.x.toFixed(2)} y2={M.top + cH}
              stroke="rgba(255,255,255,0.10)" strokeWidth="1"
            />

            {/* dot on history or base */}
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

            {/* glass tooltip */}
            {(() => {
              // price rows start after the header block
              const p1y = headerH + 2;   // first price row
              const p2y = p1y + 18;
              const p3y = p2y + 18;
              return (
                <g transform={`translate(${tipX.toFixed(2)},${tipY})`}>
                  <rect
                    x="0" y="0" rx="8" ry="8"
                    width={tipW} height={tipH}
                    fill="rgba(10,10,12,0.82)"
                    stroke="rgba(255,255,255,0.07)" strokeWidth="1"
                  />

                  {/* date line — always shown, slightly dim */}
                  <text x="10" y="15" fill="rgba(255,255,255,0.28)" fontSize="9"
                    fontFamily="'Inter','ui-sans-serif',sans-serif">
                    {fmtDateShort(crosshair.time)}
                  </text>

                  {/* time line — intraday only, brighter */}
                  {intra && (
                    <text x="10" y="30" fill="rgba(255,255,255,0.70)" fontSize="12"
                      fontWeight="500"
                      fontFamily="'Geist Mono','ui-monospace','Courier New',monospace">
                      {fmtUTCTime(crosshair.time)}
                    </text>
                  )}

                  {/* thin separator between header and prices */}
                  <line x1="10" y1={headerH - 4} x2={tipW - 10} y2={headerH - 4}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

                  {/* historical price */}
                  {crosshair.histPrice !== null && (
                    <text x="10" y={p1y} fill="rgba(192,192,204,0.85)" fontSize="11"
                      fontWeight="500"
                      fontFamily="'Geist Mono','ui-monospace','Courier New',monospace">
                      {fmtPrice(crosshair.histPrice)}
                    </text>
                  )}

                  {/* scenario prices */}
                  {crosshair.bull !== null && (
                    <text x="10" y={p1y} fill="rgba(34,197,94,0.85)" fontSize="10"
                      fontFamily="'Geist Mono','ui-monospace','Courier New',monospace">
                      ↑ {fmtPrice(crosshair.bull)}
                    </text>
                  )}
                  {crosshair.base !== null && (
                    <text x="10" y={p2y} fill="rgba(192,192,204,0.85)" fontSize="10"
                      fontFamily="'Geist Mono','ui-monospace','Courier New',monospace">
                      — {fmtPrice(crosshair.base)}
                    </text>
                  )}
                  {crosshair.bear !== null && (
                    <text x="10" y={p3y} fill="rgba(239,68,68,0.85)" fontSize="10"
                      fontFamily="'Geist Mono','ui-monospace','Courier New',monospace">
                      ↓ {fmtPrice(crosshair.bear)}
                    </text>
                  )}
                </g>
              );
            })()}
          </>
        )}
      </svg>}
    </div>
  );
}
