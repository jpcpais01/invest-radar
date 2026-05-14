"use client";
import { useRef, useState, useEffect, useMemo, useId } from "react";

interface Props {
  historical: { time: number; close: number }[];
  futureDates: number[];
  lastClose: number;
  scenarios: { bear: number[]; base: number[]; bull: number[] };
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const M = { top: 20, right: 68, bottom: 30, left: 12 };

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtPrice(p: number) {
  if (p >= 10000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1000)  return `$${p.toFixed(0)}`;
  return `$${p.toFixed(2)}`;
}

function linePath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// pick ~5 evenly-spaced x-tick indices, always including 0 and last
function xTickIdxs(total: number, max = 6): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i);
  const out = new Set<number>([0, total - 1]);
  const step = Math.floor((total - 1) / (max - 1));
  for (let i = step; i < total - 1; i += step) out.add(i);
  return [...out].sort((a, b) => a - b);
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ForecastChart({ historical, futureDates, lastClose, scenarios }: Props) {
  const uid          = useId().replace(/:/g, "");
  const wrapRef      = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [mouseX, setMouseX] = useState<number | null>(null);

  // Resize observer
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const cW = w - M.left - M.right;
  const cH = h - M.top  - M.bottom;

  // ── scales ─────────────────────────────────────────────────────────────────
  const allTimes = useMemo(
    () => [...historical.map(b => b.time), ...futureDates],
    [historical, futureDates]
  );
  const minT = allTimes[0];
  const maxT = allTimes[allTimes.length - 1];
  const xS = (t: number) => M.left + ((t - minT) / (maxT - minT)) * cW;

  const allPrices = useMemo(() => [
    ...historical.map(b => b.close),
    ...scenarios.bear, ...scenarios.base, ...scenarios.bull,
  ], [historical, scenarios]);

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad    = (rawMax - rawMin) * 0.08 || rawMax * 0.03;
  const minP   = rawMin - pad;
  const maxP   = rawMax + pad;
  const yS = (p: number) => M.top + cH - ((p - minP) / (maxP - minP)) * cH;

  // ── paths ──────────────────────────────────────────────────────────────────
  const histPts  = historical.map(b => [xS(b.time), yS(b.close)] as [number, number]);
  const lastHist = histPts[histPts.length - 1];

  const histLine = linePath(histPts);
  const histArea = `${histLine} L${lastHist[0].toFixed(1)},${(M.top + cH).toFixed(1)} L${M.left.toFixed(1)},${(M.top + cH).toFixed(1)} Z`;

  const scenPts = (prices: number[]) => [
    lastHist,
    ...prices.map((p, i) => [xS(futureDates[i]), yS(p)] as [number, number]),
  ];

  const sepX   = lastHist[0];
  const endX   = xS(futureDates[futureDates.length - 1]);

  // ── y-axis ticks ───────────────────────────────────────────────────────────
  const yTicks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n + 1 }, (_, i) => minP + (maxP - minP) * (i / n));
  }, [minP, maxP]);

  // ── x-axis ticks ───────────────────────────────────────────────────────────
  const xTicks = useMemo(
    () => xTickIdxs(allTimes.length).map(i => allTimes[i]),
    [allTimes]
  );

  // ── crosshair ──────────────────────────────────────────────────────────────
  const crosshair = useMemo(() => {
    if (mouseX === null) return null;
    const t = minT + ((mouseX - M.left) / cW) * (maxT - minT);
    let nearest = allTimes[0], minD = Infinity;
    for (const ts of allTimes) {
      const d = Math.abs(ts - t);
      if (d < minD) { minD = d; nearest = ts; }
    }
    const cx = xS(nearest);
    const hi  = historical.find(b => b.time === nearest);
    const fi  = futureDates.indexOf(nearest);
    return {
      x: cx,
      time: nearest,
      price:  hi   ? hi.close                 : null,
      bear:   fi >= 0 ? scenarios.bear[fi]    : null,
      base:   fi >= 0 ? scenarios.base[fi]    : null,
      bull:   fi >= 0 ? scenarios.bull[fi]    : null,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouseX, allTimes, minT, maxT, cW]);

  // tooltip x position (keep it inside the chart)
  const tooltipX = crosshair
    ? crosshair.x + 10 + 90 > w - M.right
      ? crosshair.x - 10 - 90
      : crosshair.x + 10
    : 0;

  return (
    <div
      ref={wrapRef}
      className="w-full h-full select-none"
      style={{ background: "#080808" }}
    >
      <svg
        width={w} height={h}
        style={{ display: "block", cursor: "crosshair" }}
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
            <stop offset="0%"   stopColor="#c0c0cc" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#c0c0cc" stopOpacity="0.00" />
          </linearGradient>
          {/* clip to chart area */}
          <clipPath id={`${uid}cl`}>
            <rect x={M.left} y={M.top} width={cW} height={cH} />
          </clipPath>
        </defs>

        {/* ── horizontal grid ───────────────────────────────────────────── */}
        {yTicks.map((p, i) => (
          <line key={i}
            x1={M.left} y1={yS(p).toFixed(1)}
            x2={w - M.right} y2={yS(p).toFixed(1)}
            stroke="#111" strokeWidth="1"
          />
        ))}

        {/* ── y-axis price labels ───────────────────────────────────────── */}
        {yTicks.map((p, i) => (
          <text key={i}
            x={w - M.right + 6} y={yS(p) + 3.5}
            fill="#3a3a3a" fontSize="10"
            fontFamily="'Geist Mono','Courier New',monospace"
            dominantBaseline="middle"
          >
            {fmtPrice(p)}
          </text>
        ))}

        {/* ── x-axis date labels ────────────────────────────────────────── */}
        {xTicks.map((ts, i) => (
          <text key={i}
            x={xS(ts).toFixed(1)} y={h - 7}
            fill="#3a3a3a" fontSize="10"
            fontFamily="'Inter','sans-serif'"
            textAnchor="middle"
          >
            {fmtDate(ts)}
          </text>
        ))}

        {/* ── history area fill ─────────────────────────────────────────── */}
        <path d={histArea} fill={`url(#${uid}hg)`} clipPath={`url(#${uid}cl)`} />

        {/* ── history line ──────────────────────────────────────────────── */}
        <path
          d={histLine} fill="none"
          stroke="rgba(192,192,204,0.55)" strokeWidth="1.5"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── forecast zone tint ────────────────────────────────────────── */}
        <rect
          x={sepX} y={M.top} width={endX - sepX} height={cH}
          fill="rgba(255,255,255,0.011)"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── separator dashed line ─────────────────────────────────────── */}
        <line
          x1={sepX.toFixed(1)} y1={M.top}
          x2={sepX.toFixed(1)} y2={M.top + cH}
          stroke="#222" strokeWidth="1" strokeDasharray="4,4"
        />

        {/* ── bear ──────────────────────────────────────────────────────── */}
        <path
          d={linePath(scenPts(scenarios.bear))} fill="none"
          stroke="rgba(239,68,68,0.72)" strokeWidth="1.5" strokeDasharray="6,4"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── base ──────────────────────────────────────────────────────── */}
        <path
          d={linePath(scenPts(scenarios.base))} fill="none"
          stroke="#c0c0cc" strokeWidth="2"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── bull ──────────────────────────────────────────────────────── */}
        <path
          d={linePath(scenPts(scenarios.bull))} fill="none"
          stroke="rgba(34,197,94,0.78)" strokeWidth="1.5" strokeDasharray="6,4"
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── endpoint dots ─────────────────────────────────────────────── */}
        {[
          { prices: scenarios.bear, color: "rgba(239,68,68,0.85)" },
          { prices: scenarios.base, color: "#c0c0cc" },
          { prices: scenarios.bull, color: "rgba(34,197,94,0.90)" },
        ].map(({ prices, color }, si) => {
          const ex = xS(futureDates[futureDates.length - 1]);
          const ey = yS(prices[prices.length - 1]);
          return (
            <g key={si}>
              <circle cx={ex.toFixed(1)} cy={ey.toFixed(1)} r="3" fill={color} />
              <circle cx={ex.toFixed(1)} cy={ey.toFixed(1)} r="5.5" fill={color} opacity="0.18" />
            </g>
          );
        })}

        {/* ── last-close dot ────────────────────────────────────────────── */}
        <circle
          cx={lastHist[0].toFixed(1)} cy={lastHist[1].toFixed(1)}
          r="3" fill="#c0c0cc"
        />

        {/* ── crosshair ─────────────────────────────────────────────────── */}
        {crosshair && (
          <>
            {/* vertical line */}
            <line
              x1={crosshair.x.toFixed(1)} y1={M.top}
              x2={crosshair.x.toFixed(1)} y2={M.top + cH}
              stroke="#2c2c2c" strokeWidth="1" strokeDasharray="3,3"
            />

            {/* horizontal line at closest price */}
            {(crosshair.price ?? crosshair.base) !== null && (
              <line
                x1={M.left} y1={yS(crosshair.price ?? crosshair.base!).toFixed(1)}
                x2={w - M.right} y2={yS(crosshair.price ?? crosshair.base!).toFixed(1)}
                stroke="#2c2c2c" strokeWidth="1" strokeDasharray="3,3"
              />
            )}

            {/* tooltip box */}
            <g transform={`translate(${tooltipX.toFixed(1)},${M.top + 8})`}>
              <rect
                x="0" y="0" width="84" rx="4" ry="4"
                height={crosshair.bear !== null ? 72 : 26}
                fill="#0e0e0e" stroke="#1e1e1e" strokeWidth="1"
              />
              {/* date */}
              <text x="8" y="16" fill="#484848" fontSize="9.5"
                fontFamily="'Inter','sans-serif'">{fmtDate(crosshair.time)}</text>

              {/* historical price */}
              {crosshair.price !== null && (
                <text x="8" y="30" fill="rgba(192,192,204,0.8)" fontSize="9.5"
                  fontFamily="'Geist Mono','Courier New',monospace">
                  {fmtPrice(crosshair.price)}
                </text>
              )}

              {/* scenario prices */}
              {crosshair.bull !== null && (
                <text x="8" y="30" fill="rgba(34,197,94,0.85)" fontSize="9"
                  fontFamily="'Geist Mono','Courier New',monospace">
                  ↑ {fmtPrice(crosshair.bull)}
                </text>
              )}
              {crosshair.base !== null && (
                <text x="8" y="48" fill="#c0c0cc" fontSize="9"
                  fontFamily="'Geist Mono','Courier New',monospace">
                  — {fmtPrice(crosshair.base)}
                </text>
              )}
              {crosshair.bear !== null && (
                <text x="8" y="64" fill="rgba(239,68,68,0.85)" fontSize="9"
                  fontFamily="'Geist Mono','Courier New',monospace">
                  ↓ {fmtPrice(crosshair.bear)}
                </text>
              )}
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
