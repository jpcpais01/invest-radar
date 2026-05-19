"use client";
import { useRef, useState, useEffect, useCallback, useMemo, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { OHLCVBar, TechnicalIndicators } from "@/types/market";

interface Props { ticker: string }

const TF_OPTIONS = ["1D", "7D", "1M", "3M", "6M", "1Y", "2Y"] as const;
type TFOption = typeof TF_OPTIONS[number];
const INTRADAY_TFS = new Set<TFOption>(["1D", "7D"]);

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p >= 10000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1000)  return `$${p.toFixed(0)}`;
  return `$${p.toFixed(2)}`;
}
function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}
function fmtDateTick(ts: number, tf: TFOption): string {
  const d = new Date(ts * 1000);
  if (INTRADAY_TFS.has(tf)) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  if (tf === "2Y") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTooltipDate(ts: number, tf: TFOption): string {
  const d = new Date(ts * 1000);
  if (INTRADAY_TFS.has(tf)) {
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function isMarketOpen(): boolean {
  const ny = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = ny.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ny.getHours() * 60 + ny.getMinutes();
  return mins >= 570 && mins < 960; // 9:30–16:00
}
function evenIdxs(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  const out = new Set([0, total - 1]);
  const step = (total - 1) / (n - 1);
  for (let i = 1; i < n - 1; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

// ── chart ─────────────────────────────────────────────────────────────────────

const MG = { top: 12, right: 60, bottom: 22, left: 0 };
const VOL_H   = 44; // height of volume panel in px
const VOL_GAP =  5; // gap between sections
const RSI_H   = 50; // height of RSI panel in px
const RSI_GAP =  5;

interface ChartProps {
  bars: OHLCVBar[];
  indicators?: TechnicalIndicators;
  emaVisible: { ema21: boolean; ema50: boolean; ema200: boolean };
  showRsi: boolean;
  tf: TFOption;
  chartH: number;
}

function PriceChart({ bars, indicators, emaVisible, showRsi, tf, chartH }: ChartProps) {
  const uid     = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
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
  const cW = w - MG.left - MG.right;

  // Section boundaries (RSI panel sits between price and volume when enabled)
  const volBotY   = h - MG.bottom;
  const volTopY   = volBotY - VOL_H;
  const rsiBot    = showRsi ? volTopY - VOL_GAP : volTopY;
  const rsiTop    = showRsi ? rsiBot - RSI_H    : rsiBot;
  const priceTopY = MG.top;
  const priceBotY = showRsi ? rsiTop - RSI_GAP  : volTopY - VOL_GAP;
  const priceH    = Math.max(1, priceBotY - priceTopY);

  const n = bars.length;

  const xS = useCallback(
    (i: number) => MG.left + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW),
    [n, cW]
  );

  // Price scale
  const [minP, maxP] = useMemo(() => {
    if (!bars.length) return [0, 1];
    const lo = Math.min(...bars.map(b => b.low));
    const hi = Math.max(...bars.map(b => b.high));
    const pad = (hi - lo) * 0.07 || hi * 0.02;
    return [lo - pad, hi + pad * 1.8];
  }, [bars]);

  const yS = useCallback(
    (p: number) => priceTopY + priceH - ((p - minP) / (maxP - minP)) * priceH,
    [priceTopY, priceH, minP, maxP]
  );

  // Period direction → color
  const firstClose = bars[0]?.close ?? 0;
  const lastClose  = bars.at(-1)?.close ?? 0;
  const isUp       = lastClose >= firstClose;
  const lineColor  = isUp ? "#4ade80" : "#f87171";

  // Price line + area
  const closePts = useMemo<[number, number][]>(
    () => bars.map((b, i) => [xS(i), yS(b.close)]),
    [bars, xS, yS]
  );
  const priceLine = useMemo(() => {
    if (closePts.length < 2) return "";
    return "M" + closePts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  }, [closePts]);
  const priceArea = useMemo(() => {
    if (!priceLine || !closePts.length) return "";
    const [lx, ly] = closePts[closePts.length - 1];
    return `${priceLine} L${lx.toFixed(1)},${priceBotY} L${MG.left},${priceBotY} Z`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceLine, closePts, priceBotY]);

  // EMA path builder
  const buildEmaPath = useCallback((arr: number[] | undefined) => {
    if (!arr || arr.length < 2) return "";
    const pts = arr
      .map((v, i) => [xS(i), yS(v)] as [number, number])
      .filter(([, y]) => y >= priceTopY - 2 && y <= priceBotY + 2);
    if (pts.length < 2) return "";
    return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  }, [xS, yS, priceTopY, priceBotY]);

  // Volume
  const maxVol  = useMemo(() => Math.max(...bars.map(b => b.volume), 1), [bars]);
  const barPixW = cW > 0 && n > 1 ? Math.max(1, (cW / n) * 0.72) : 4;

  // RSI
  const rsiY = useCallback(
    (v: number) => rsiBot - (v / 100) * RSI_H,
    [rsiBot]
  );
  const rsiPath = useMemo(() => {
    const rsi = indicators?.rsi;
    if (!showRsi || !rsi || rsi.length < 2) return "";
    const pts = rsi
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v != null && !isNaN(v))
      .map(({ v, i }) => [xS(i), rsiY(v)] as [number, number]);
    if (pts.length < 2) return "";
    return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  }, [indicators?.rsi, showRsi, xS, rsiY]);

  // Ticks
  const yTicks    = useMemo(() => Array.from({ length: 4 }, (_, i) => minP + (maxP - minP) * ((i + 0.5) / 4)), [minP, maxP]);
  const xTickIdxs = useMemo(() => evenIdxs(n, 5), [n]);

  // Crosshair
  const crosshair = useMemo(() => {
    if (mouseX === null || cW <= 0 || !bars.length) return null;
    const ratio    = Math.max(0, Math.min(1, (mouseX - MG.left) / cW));
    const idx      = Math.round(ratio * (n - 1));
    const bar      = bars[idx];
    const rsiVal   = indicators?.rsi?.[idx];
    const rsiValid = rsiVal != null && !isNaN(rsiVal);
    return {
      idx, bar,
      cx: xS(idx),
      cy: yS(bar.close),
      rsiVal:  rsiValid ? rsiVal  : null,
      rsiCy:   rsiValid ? rsiY(rsiVal!) : null,
    };
  }, [mouseX, bars, n, cW, xS, yS, indicators?.rsi, rsiY]);

  if (!size || cW <= 0 || priceH <= 0) {
    return <div ref={wrapRef} style={{ height: chartH, background: "#0c0c10" }} />;
  }

  const curPriceY        = yS(lastClose);
  const showCurrentLabel = curPriceY >= priceTopY && curPriceY <= priceBotY;

  const tipW = 114;
  const tipH = 100;

  return (
    <div ref={wrapRef} style={{ height: chartH, background: "#0c0c10" }}>
      <svg
        width={w} height={h}
        style={{ display: "block", userSelect: "none" }}
        onMouseMove={e => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          setMouseX(x >= MG.left && x <= w - MG.right ? x : null);
        }}
        onMouseLeave={() => setMouseX(null)}
      >
        <defs>
          <linearGradient id={`${uid}ag`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.20" />
            <stop offset="85%"  stopColor={lineColor} stopOpacity="0.03" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
          <filter id={`${uid}gf`} x="-30%" y="-100%" width="160%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <clipPath id={`${uid}pc`}>
            <rect x={MG.left} y={priceTopY} width={cW} height={priceH} />
          </clipPath>
        </defs>

        {/* Horizontal grid lines */}
        {yTicks.map((p, i) => (
          <line key={i}
            x1={MG.left}        y1={yS(p).toFixed(1)}
            x2={w - MG.right}   y2={yS(p).toFixed(1)}
            stroke="rgba(255,255,255,0.035)" strokeWidth="1"
          />
        ))}

        {/* Area fill */}
        {priceArea && (
          <path d={priceArea} fill={`url(#${uid}ag)`} clipPath={`url(#${uid}pc)`} />
        )}

        {/* EMA overlays */}
        {emaVisible.ema200 && (() => {
          const d = buildEmaPath(indicators?.ema200);
          return d ? (
            <path d={d} fill="none" stroke="rgba(167,139,250,0.55)" strokeWidth="1"
              clipPath={`url(#${uid}pc)`} />
          ) : null;
        })()}
        {emaVisible.ema50 && (() => {
          const d = buildEmaPath(indicators?.ema50);
          return d ? (
            <path d={d} fill="none" stroke="rgba(96,165,250,0.60)" strokeWidth="1"
              clipPath={`url(#${uid}pc)`} />
          ) : null;
        })()}
        {emaVisible.ema21 && (() => {
          const d = buildEmaPath(indicators?.ema21);
          return d ? (
            <path d={d} fill="none" stroke="rgba(251,191,36,0.60)" strokeWidth="1"
              clipPath={`url(#${uid}pc)`} />
          ) : null;
        })()}

        {/* Price line glow */}
        <path d={priceLine} fill="none"
          stroke={lineColor} strokeOpacity="0.15" strokeWidth="10"
          filter={`url(#${uid}gf)`} clipPath={`url(#${uid}pc)`}
        />

        {/* Price line */}
        <path d={priceLine} fill="none"
          stroke={lineColor} strokeWidth="1.6" strokeLinecap="round"
          clipPath={`url(#${uid}pc)`}
        />

        {/* Current price dashed reference + label */}
        {showCurrentLabel && (
          <g>
            <line
              x1={MG.left}      y1={curPriceY.toFixed(1)}
              x2={w - MG.right} y2={curPriceY.toFixed(1)}
              stroke={lineColor} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="3,5"
            />
            <rect
              x={w - MG.right + 2} y={curPriceY - 8.5}
              width={MG.right - 3} height={17} rx="3"
              fill={lineColor} fillOpacity="0.13"
              stroke={lineColor} strokeOpacity="0.45" strokeWidth="0.75"
            />
            <text
              x={w - MG.right + 5} y={curPriceY + 0.5}
              fill={lineColor} fontSize="8.5" fontFamily="ui-monospace,monospace"
              dominantBaseline="middle" fontWeight="600"
            >{fmtPrice(lastClose)}</text>
          </g>
        )}

        {/* Y-axis labels — skip ticks too close to current price label */}
        {yTicks.map((p, i) => {
          const py = yS(p);
          if (showCurrentLabel && Math.abs(py - curPriceY) < 14) return null;
          return (
            <text key={i}
              x={w - MG.right + 5} y={py}
              fill="rgba(255,255,255,0.13)" fontSize="8.5"
              fontFamily="ui-monospace,monospace" dominantBaseline="middle"
            >{fmtPrice(p)}</text>
          );
        })}

        {/* ── RSI panel ── */}
        {showRsi && (
          <>
            <defs>
              <clipPath id={`${uid}rc`}>
                <rect x={MG.left} y={rsiTop} width={cW} height={RSI_H} />
              </clipPath>
            </defs>

            {/* separator above RSI */}
            <line x1={MG.left} y1={(rsiTop - 2).toFixed(1)}
              x2={w - MG.right} y2={(rsiTop - 2).toFixed(1)}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1"
            />

            {/* overbought zone (70–100) */}
            <rect x={MG.left} y={rsiTop} width={cW} height={(RSI_H * 0.30).toFixed(1)}
              fill="rgba(248,113,113,0.04)" clipPath={`url(#${uid}rc)`}
            />
            {/* oversold zone (0–30) */}
            <rect x={MG.left} y={rsiY(30).toFixed(1)} width={cW}
              height={(RSI_H * 0.30).toFixed(1)}
              fill="rgba(74,222,128,0.04)" clipPath={`url(#${uid}rc)`}
            />

            {/* 70 reference line */}
            <line x1={MG.left} y1={rsiY(70).toFixed(1)}
              x2={w - MG.right} y2={rsiY(70).toFixed(1)}
              stroke="rgba(248,113,113,0.18)" strokeWidth="1" strokeDasharray="3,4"
            />
            {/* 30 reference line */}
            <line x1={MG.left} y1={rsiY(30).toFixed(1)}
              x2={w - MG.right} y2={rsiY(30).toFixed(1)}
              stroke="rgba(74,222,128,0.18)" strokeWidth="1" strokeDasharray="3,4"
            />
            {/* 50 midline */}
            <line x1={MG.left} y1={rsiY(50).toFixed(1)}
              x2={w - MG.right} y2={rsiY(50).toFixed(1)}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1"
            />

            {/* RSI line */}
            {rsiPath && (
              <path d={rsiPath} fill="none"
                stroke="rgba(148,163,200,0.75)" strokeWidth="1.2" strokeLinecap="round"
                clipPath={`url(#${uid}rc)`}
              />
            )}

            {/* RSI y-axis labels */}
            {[70, 50, 30].map(v => (
              <text key={v} x={w - MG.right + 5} y={rsiY(v)}
                fill="rgba(255,255,255,0.10)" fontSize="7.5"
                fontFamily="ui-monospace,monospace" dominantBaseline="middle"
              >{v}</text>
            ))}

            {/* "RSI" label */}
            <text x={MG.left + 4} y={rsiTop + 9}
              fill="rgba(255,255,255,0.12)" fontSize="7.5"
              fontFamily="ui-sans-serif,sans-serif" fontWeight="600" letterSpacing="0.06em"
            >RSI</text>

            {/* Current RSI label on right axis */}
            {(() => {
              const rsi = indicators?.rsi;
              const cur = rsi?.[rsi.length - 1];
              if (cur == null || isNaN(cur)) return null;
              const cy = rsiY(cur);
              const col = cur > 70 ? "#f87171" : cur < 30 ? "#4ade80" : "rgba(148,163,200,0.85)";
              return (
                <g>
                  <rect x={w - MG.right + 2} y={cy - 7} width={MG.right - 3} height={14} rx="3"
                    fill={col} fillOpacity="0.12"
                    stroke={col} strokeOpacity="0.40" strokeWidth="0.75"
                  />
                  <text x={w - MG.right + 5} y={cy + 0.5}
                    fill={col} fontSize="8" fontFamily="ui-monospace,monospace"
                    dominantBaseline="middle" fontWeight="600"
                  >{cur.toFixed(1)}</text>
                </g>
              );
            })()}
          </>
        )}

        {/* Volume separator */}
        <line
          x1={MG.left} y1={(volTopY - 2).toFixed(1)}
          x2={w - MG.right} y2={(volTopY - 2).toFixed(1)}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1"
        />

        {/* Volume bars */}
        {bars.map((b, i) => {
          const bx  = xS(i) - barPixW / 2;
          const bh  = Math.max(1, (b.volume / maxVol) * VOL_H);
          const by  = volBotY - bh;
          const up  = b.close >= b.open;
          return (
            <rect key={i}
              x={bx.toFixed(1)} y={by.toFixed(1)}
              width={barPixW.toFixed(1)} height={bh.toFixed(1)}
              fill={up ? "rgba(74,222,128,0.28)" : "rgba(248,113,113,0.24)"}
              rx="0.5"
            />
          );
        })}

        {/* X-axis labels */}
        {xTickIdxs.map(i => (
          <text key={i}
            x={xS(i).toFixed(1)} y={h - 5}
            fill="rgba(255,255,255,0.17)" fontSize="8.5"
            fontFamily="ui-sans-serif,sans-serif" textAnchor="middle"
          >{fmtDateTick(bars[i]?.time ?? 0, tf)}</text>
        ))}

        {/* Crosshair */}
        {crosshair && (() => {
          const { cx, cy, bar, rsiVal, rsiCy } = crosshair;
          const tipX   = cx + tipW + 14 > w - MG.right ? cx - tipW - 8 : cx + 8;
          const tipY   = priceTopY + 6;
          const tipH2  = showRsi && rsiVal != null ? tipH + 16 : tipH;
          const rsiCol = rsiVal != null
            ? (rsiVal > 70 ? "#f87171" : rsiVal < 30 ? "#4ade80" : "rgba(148,163,200,0.85)")
            : "rgba(148,163,200,0.85)";
          return (
            <>
              {/* vertical line through all panels */}
              <line x1={cx.toFixed(1)} y1={priceTopY} x2={cx.toFixed(1)} y2={volBotY}
                stroke="rgba(255,255,255,0.09)" strokeWidth="1"
              />
              {/* price dot */}
              <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="5.5" fill={lineColor} fillOpacity="0.12" />
              <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="2.5" fill={lineColor} fillOpacity="0.90" />
              {/* RSI dot */}
              {showRsi && rsiCy != null && (
                <>
                  <circle cx={cx.toFixed(1)} cy={rsiCy.toFixed(1)} r="4" fill={rsiCol} fillOpacity="0.15" />
                  <circle cx={cx.toFixed(1)} cy={rsiCy.toFixed(1)} r="2" fill={rsiCol} fillOpacity="0.90" />
                </>
              )}

              {/* OHLCV + RSI tooltip */}
              <g transform={`translate(${tipX.toFixed(1)},${tipY})`}>
                <rect rx="7" width={tipW} height={tipH2}
                  fill="rgba(5,6,16,0.94)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"
                />
                <text x="10" y="14" fill="rgba(255,255,255,0.30)" fontSize="8"
                  fontFamily="ui-sans-serif,sans-serif">
                  {fmtTooltipDate(bar.time, tf)}
                </text>
                <line x1="10" y1="19" x2={tipW - 10} y2="19"
                  stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                />
                {(
                  [["O", bar.open], ["H", bar.high], ["L", bar.low], ["C", bar.close]] as [string, number][]
                ).map(([label, val], i2) => (
                  <text key={label} x="10" y={31 + i2 * 14}
                    fontSize="9.5" fontFamily="ui-monospace,monospace"
                  >
                    <tspan fill="rgba(255,255,255,0.22)">{label} </tspan>
                    <tspan fill={label === "C" ? lineColor : "rgba(220,228,255,0.82)"}>
                      {fmtPrice(val)}
                    </tspan>
                  </text>
                ))}
                <text x="10" y={31 + 4 * 14} fontSize="9" fontFamily="ui-monospace,monospace">
                  <tspan fill="rgba(255,255,255,0.22)">V </tspan>
                  <tspan fill="rgba(180,190,230,0.55)">{fmtVol(bar.volume)}</tspan>
                </text>
                {showRsi && rsiVal != null && (
                  <text x="10" y={31 + 5 * 14} fontSize="9" fontFamily="ui-monospace,monospace">
                    <tspan fill="rgba(255,255,255,0.22)">RSI </tspan>
                    <tspan fill={rsiCol}>{rsiVal.toFixed(1)}</tspan>
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

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function AIPredPanel({ ticker }: Props) {
  const [tf, setTf]     = useState<TFOption>("1Y");
  const [ema, setEma]   = useState({ ema21: false, ema50: true, ema200: false });
  const isIntraday      = INTRADAY_TFS.has(tf);

  const { data, isLoading } = useQuery<{ bars: OHLCVBar[]; indicators?: TechnicalIndicators }>({
    queryKey: ["price-panel", ticker, tf],
    queryFn:  () =>
      fetch(
        `/api/market/history/${encodeURIComponent(ticker)}?tf=${tf}&indicators=${isIntraday ? "false" : "true"}`
      ).then(r => r.json()),
    staleTime: 5 * 60_000,
    refetchInterval: () => isIntraday && isMarketOpen() ? 60_000 : false,
  });

  const bars       = data?.bars        ?? [];
  const indicators = data?.indicators;

  // Period statistics
  const firstClose = bars[0]?.close    ?? 0;
  const lastClose  = bars.at(-1)?.close ?? 0;
  const periodPct  = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  const periodHigh = bars.length ? Math.max(...bars.map(b => b.high)) : 0;
  const periodLow  = bars.length ? Math.min(...bars.map(b => b.low))  : 0;
  const avgVol     = bars.length ? bars.reduce((s, b) => s + b.volume, 0) / bars.length : 1;
  const lastVol    = bars.at(-1)?.volume ?? 0;
  const volRatio   = avgVol > 0 ? lastVol / avgVol : 0;
  const isUp       = periodPct >= 0;
  const marketOpen = isMarketOpen();
  const showRsi    = !isIntraday;

  const CHART_H = showRsi ? 344 : 290;

  return (
    <div
      className="rounded-xl overflow-hidden border border-[#1a1a22]"
      style={{ background: "#0c0c10" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[#181820]">
        <div className="flex items-center gap-2">
          <span className="text-[#2e2e42] text-[9px]">◆</span>
          <span className="text-[11px] font-semibold text-[#e0e0f0] tracking-wide">Price</span>
          <span className="text-[9px] text-[#2a2a3a] mx-0.5">·</span>
          <span className="text-[10px] text-[#383850] font-mono">{ticker}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={cn("w-1.5 h-1.5 rounded-full transition-colors", marketOpen ? "bg-green-400" : "bg-[#252535]")}
            style={marketOpen ? { boxShadow: "0 0 6px rgba(74,222,128,0.55)" } : {}}
          />
          <span
            className="text-[9px] transition-colors"
            style={{ color: marketOpen ? "rgba(74,222,128,0.65)" : "#252535" }}
          >
            {marketOpen ? "Market open" : "Market closed"}
          </span>
        </div>
      </div>

      {/* ── TF tabs + EMA toggles ── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#181820]">
        {/* Timeframe buttons */}
        <div className="flex items-center gap-0.5 flex-1">
          {TF_OPTIONS.map(t => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-all tracking-wide",
                tf === t
                  ? "text-[#ddddf0] bg-[#ffffff0d] border border-[#ffffff1a]"
                  : "text-[#282838] hover:text-[#585870]"
              )}
            >{t}</button>
          ))}
        </div>

        {/* EMA toggles — only when daily data is available */}
        {!isIntraday && (
          <div className="flex items-center gap-0.5 ml-1 pl-2 border-l border-[#1a1a28]">
            {(
              [
                { key: "ema21"  as const, label: "21",  color: "#fbbf24" },
                { key: "ema50"  as const, label: "50",  color: "#60a5fa" },
                { key: "ema200" as const, label: "200", color: "#a78bfa" },
              ]
            ).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setEma(prev => ({ ...prev, [key]: !prev[key] }))}
                className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-all"
                style={
                  ema[key]
                    ? { color, background: `${color}14`, border: `1px solid ${color}38` }
                    : { color: "#252535", border: "1px solid transparent" }
                }
                onMouseEnter={e => {
                  if (!ema[key]) (e.currentTarget as HTMLElement).style.color = "#404055";
                }}
                onMouseLeave={e => {
                  if (!ema[key]) (e.currentTarget as HTMLElement).style.color = "#252535";
                }}
              >EMA{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      {isLoading ? (
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{ height: CHART_H, background: "#0c0c10" }}
        >
          <div className="w-6 h-6 rounded-full border border-[#22223a] border-t-[#505068] animate-spin" />
          <p className="text-[9px] text-[#252535]">Loading…</p>
        </div>
      ) : bars.length > 0 ? (
        <PriceChart
          bars={bars}
          indicators={indicators}
          emaVisible={ema}
          showRsi={showRsi}
          tf={tf}
          chartH={CHART_H}
        />
      ) : (
        <div className="flex items-center justify-center" style={{ height: CHART_H }}>
          <p className="text-[9px] text-[#252535]">No data</p>
        </div>
      )}

      {/* ── Stats strip ── */}
      {bars.length > 0 && (
        <div
          className="flex items-center px-4 py-2.5 border-t border-[#181820]"
          style={{ gap: 0 }}
        >
          {/* Period return */}
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-[7.5px] uppercase tracking-widest text-[#232335] mb-0.5 font-medium">Period</span>
            <span
              className="text-[13px] font-bold tabular-nums font-mono leading-none"
              style={{ color: isUp ? "#4ade80" : "#f87171" }}
            >
              {isUp ? "+" : ""}{periodPct.toFixed(2)}%
            </span>
          </div>

          <div className="w-px h-7 bg-[#1c1c28] mx-3 shrink-0" />

          {/* Period high */}
          <div className="flex flex-col items-start">
            <span className="text-[7.5px] uppercase tracking-widest text-[#232335] mb-0.5 font-medium">High</span>
            <span className="text-[11px] font-semibold tabular-nums font-mono text-[#c8c8e0]">
              {fmtPrice(periodHigh)}
            </span>
          </div>

          <div className="w-px h-7 bg-[#1c1c28] mx-3 shrink-0" />

          {/* Period low */}
          <div className="flex flex-col items-start">
            <span className="text-[7.5px] uppercase tracking-widest text-[#232335] mb-0.5 font-medium">Low</span>
            <span className="text-[11px] font-semibold tabular-nums font-mono text-[#c8c8e0]">
              {fmtPrice(periodLow)}
            </span>
          </div>

          <div className="w-px h-7 bg-[#1c1c28] mx-3 shrink-0" />

          {/* Volume */}
          <div className="flex flex-col items-start">
            <span className="text-[7.5px] uppercase tracking-widest text-[#232335] mb-0.5 font-medium">Volume</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] font-semibold tabular-nums font-mono text-[#c8c8e0]">
                {fmtVol(lastVol)}
              </span>
              {volRatio > 0 && (
                <span
                  className="text-[9px] tabular-nums font-mono"
                  style={{ color: volRatio > 1.5 ? "#fbbf24" : volRatio < 0.6 ? "#f87171" : "#323248" }}
                >
                  {volRatio.toFixed(1)}×
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
