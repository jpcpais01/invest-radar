"use client";
import { useRef, useState, useEffect, useCallback, useMemo, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Minus, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { OHLCVBar } from "@/types/market";

interface PredictionResponse {
  historical: { time: number; close: number }[];
  futureDates: number[];
  runs: number[][];
  median: number[];
  p25: number[];
  p75: number[];
  n: number;
  successfulRuns: number;
  totalRuns: number;
}

interface Props { ticker: string }

const TF_OPTIONS = ["1M", "6M", "1Y", "2Y", "5Y", "10Y"] as const;
type TFOption = typeof TF_OPTIONS[number];
const PREDICT_ENABLED = new Set<TFOption>(["1M", "6M"]);

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(p: number) {
  if (p >= 10000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1000)  return `$${p.toFixed(0)}`;
  return `$${p.toFixed(2)}`;
}
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = ((x0 + x1) / 2).toFixed(2);
    d += ` C${cx},${y0.toFixed(2)} ${cx},${y1.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return d;
}
function straightPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} ` +
    pts.slice(1).map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}
function evenIdxs(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  const out = new Set([0, total - 1]);
  const step = (total - 1) / (n - 1);
  for (let i = 1; i < n - 1; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

// ── chart ─────────────────────────────────────────────────────────────────────

const M = { top: 20, right: 60, bottom: 30, left: 12 };

function PredChart({
  bars,
  prediction,
  height = 264,
}: {
  bars: { time: number; close: number }[];
  prediction?: PredictionResponse;
  height?: number;
}) {
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
  const cW = w - M.left - M.right;
  const cH = h - M.top  - M.bottom;

  const futureDates = prediction?.futureDates ?? [];

  const allTimes = useMemo(
    () => [...bars.map(b => b.time), ...futureDates],
    [bars, futureDates]
  );
  const n = allTimes.length;
  const timeToIdx = useMemo(
    () => new Map(allTimes.map((t, i) => [t, i])),
    [allTimes]
  );
  const xS = useCallback(
    (t: number) => M.left + ((timeToIdx.get(t) ?? 0) / Math.max(n - 1, 1)) * cW,
    [timeToIdx, n, cW]
  );

  const allPrices = useMemo(() => {
    const prices = bars.map(b => b.close);
    if (prediction) {
      prices.push(...prediction.median, ...prediction.p25, ...prediction.p75);
    }
    return prices;
  }, [bars, prediction]);

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const vPad   = (rawMax - rawMin) * 0.10 || rawMax * 0.04;
  const minP   = rawMin - vPad;
  const maxP   = rawMax + vPad * 1.5;
  const yS = useCallback(
    (p: number) => M.top + cH - ((p - minP) / (maxP - minP)) * cH,
    [cH, minP, maxP]
  );

  const lastBar   = bars[bars.length - 1];
  const anchorPt  = useMemo<[number, number]>(
    () => lastBar ? [xS(lastBar.time), yS(lastBar.close)] : [M.left, M.top],
    [lastBar, xS, yS]
  );
  const sepX      = anchorPt[0];

  // For large bar counts, use straight lines for perf
  const useStraight = bars.length > 300;

  const histPts = useMemo(
    () => bars.map(b => [xS(b.time), yS(b.close)] as [number, number]),
    [bars, xS, yS]
  );
  const histLine = useMemo(
    () => useStraight ? straightPath(histPts) : smooth(histPts),
    [histPts, useStraight]
  );
  const histLast = histPts[histPts.length - 1] ?? [M.left, M.top + cH];
  const histAreaD = `${histLine} L${histLast[0].toFixed(2)},${(M.top + cH).toFixed(2)} L${M.left},${(M.top + cH).toFixed(2)} Z`;

  const medPts = useMemo(
    () => prediction
      ? [anchorPt, ...prediction.median.map((p, i) => [xS(futureDates[i]), yS(p)] as [number, number])]
      : [],
    [prediction, anchorPt, futureDates, xS, yS]
  );
  const medPath = useMemo(() => smooth(medPts), [medPts]);

  const bandPath = useMemo(() => {
    if (!prediction?.p25.length || !prediction?.p75.length || cW <= 0) return "";
    const topPts = [anchorPt, ...prediction.p75.map((p, i) => [xS(futureDates[i]), yS(p)] as [number, number])];
    const botPts = [...prediction.p25.map((p, i) => [xS(futureDates[i]), yS(p)] as [number, number])].reverse();
    return `M${topPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} L${botPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} Z`;
  }, [prediction, anchorPt, futureDates, xS, yS, cW]);

  const yTicks = useMemo(
    () => Array.from({ length: 4 }, (_, i) => minP + (maxP - minP) * ((i + 0.5) / 4)),
    [minP, maxP]
  );
  const xTicks = useMemo(
    () => evenIdxs(allTimes.length, 5).map(i => allTimes[i]),
    [allTimes]
  );

  const crosshair = useMemo(() => {
    if (mouseX === null || cW <= 0) return null;
    const ratio = (mouseX - M.left) / cW;
    const nearestIdx = Math.round(Math.max(0, Math.min(1, ratio)) * (n - 1));
    const ts = allTimes[nearestIdx];
    const cx = xS(ts);
    const hi = bars.find(b => b.time === ts);
    const fi = futureDates.indexOf(ts);
    return {
      x: cx, time: ts,
      histPrice: hi?.close ?? null,
      median: fi >= 0 && prediction ? prediction.median[fi] : null,
      p25:    fi >= 0 && prediction ? prediction.p25[fi]    : null,
      p75:    fi >= 0 && prediction ? prediction.p75[fi]    : null,
    };
  }, [mouseX, allTimes, cW, n, bars, futureDates, prediction, xS]);

  const tipW = 96;
  const tipX = crosshair
    ? (crosshair.x + tipW + 14 > w - M.right ? crosshair.x - tipW - 8 : crosshair.x + 10)
    : 0;

  if (!size || cW <= 0 || cH <= 0) return <div ref={wrapRef} style={{ height, background: "#101010" }} />;

  return (
    <div ref={wrapRef} style={{ height, background: "#101010" }}>
      <svg
        width={w} height={h}
        style={{ display: "block", userSelect: "none" }}
        onMouseMove={e => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          setMouseX(x >= M.left && x <= w - M.right ? x : null);
        }}
        onMouseLeave={() => setMouseX(null)}
      >
        <defs>
          <linearGradient id={`${uid}hg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#c0c0cc" stopOpacity="0.10" />
            <stop offset="80%"  stopColor="#c0c0cc" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#c0c0cc" stopOpacity="0" />
          </linearGradient>
          <filter id={`${uid}gw`} x="-30%" y="-120%" width="160%" height="340%">
            <feGaussianBlur stdDeviation="5" result="blur" />
          </filter>
          <clipPath id={`${uid}cl`}>
            <rect x={M.left} y={M.top} width={cW} height={cH} />
          </clipPath>
        </defs>

        {/* horizontal grid */}
        {yTicks.map((p, i) => (
          <line key={i}
            x1={M.left} y1={yS(p).toFixed(1)}
            x2={w - M.right} y2={yS(p).toFixed(1)}
            stroke="rgba(255,255,255,0.03)" strokeWidth="1"
          />
        ))}

        {/* y labels */}
        {yTicks.map((p, i) => (
          <text key={i}
            x={w - M.right + 7} y={yS(p)}
            fill="rgba(255,255,255,0.14)" fontSize="9"
            fontFamily="ui-monospace,monospace"
            dominantBaseline="middle"
          >{fmtPrice(p)}</text>
        ))}

        {/* x labels */}
        {xTicks.map((ts, i) => (
          <text key={i}
            x={xS(ts).toFixed(1)} y={h - 8}
            fill="rgba(255,255,255,0.14)" fontSize="9"
            fontFamily="ui-sans-serif,sans-serif"
            textAnchor="middle"
          >{fmtDate(ts)}</text>
        ))}

        {/* history area */}
        <path d={histAreaD} fill={`url(#${uid}hg)`} clipPath={`url(#${uid}cl)`} />

        {/* history line */}
        <path d={histLine} fill="none"
          stroke="rgba(192,192,204,0.40)" strokeWidth="1.5"
          strokeLinecap="round" clipPath={`url(#${uid}cl)`}
        />

        {/* prediction overlay */}
        {prediction && (
          <>
            {/* spaghetti runs */}
            {prediction.runs.map((run, ri) => {
              const pts: [number, number][] = [
                anchorPt,
                ...run.map((p, i) => [xS(futureDates[i]), yS(p)] as [number, number]),
              ];
              return (
                <path key={ri} d={smooth(pts)} fill="none"
                  stroke="rgba(192,192,204,0.10)" strokeWidth="1"
                  strokeLinecap="round" clipPath={`url(#${uid}cl)`}
                />
              );
            })}

            {/* P25–P75 band */}
            {bandPath && (
              <path d={bandPath} fill="rgba(192,192,204,0.06)"
                clipPath={`url(#${uid}cl)`}
              />
            )}

            {/* separator */}
            <line
              x1={sepX.toFixed(1)} y1={M.top}
              x2={sepX.toFixed(1)} y2={M.top + cH}
              stroke="rgba(255,255,255,0.07)" strokeWidth="1"
              strokeDasharray="4,5"
            />

            {/* forecast zone tint */}
            <rect
              x={sepX} y={M.top}
              width={Math.max(0, w - M.right - sepX)} height={cH}
              fill="rgba(255,255,255,0.010)"
              clipPath={`url(#${uid}cl)`}
            />

            {/* FORECAST label */}
            <text
              x={(sepX + 7).toFixed(1)} y={(M.top + 13).toFixed(1)}
              fill="rgba(255,255,255,0.12)" fontSize="7.5"
              fontFamily="ui-sans-serif,sans-serif"
              fontWeight="600" letterSpacing="0.08em"
            >FORECAST</text>

            {/* median glow */}
            <path d={medPath} fill="none"
              stroke="rgba(192,192,204,0.18)" strokeWidth="10"
              filter={`url(#${uid}gw)`}
              clipPath={`url(#${uid}cl)`}
            />

            {/* median line */}
            <path d={medPath} fill="none"
              stroke="#c0c0cc" strokeWidth="2"
              strokeDasharray="6,4" strokeLinecap="round"
              clipPath={`url(#${uid}cl)`}
            />

            {/* anchor dot */}
            <circle cx={anchorPt[0].toFixed(1)} cy={anchorPt[1].toFixed(1)} r="7" fill="rgba(192,192,204,0.10)" />
            <circle cx={anchorPt[0].toFixed(1)} cy={anchorPt[1].toFixed(1)} r="3.5" fill="#c0c0cc" />

            {/* endpoint marker */}
            {prediction.median.length > 0 && (() => {
              const ex = xS(futureDates[futureDates.length - 1]);
              const ey = yS(prediction.median[prediction.median.length - 1]);
              return (
                <g>
                  <circle cx={ex.toFixed(1)} cy={ey.toFixed(1)} r="7" fill="rgba(192,192,204,0.10)" />
                  <circle cx={ex.toFixed(1)} cy={ey.toFixed(1)} r="3" fill="#c0c0cc" />
                </g>
              );
            })()}
          </>
        )}

        {/* crosshair */}
        {crosshair && (() => {
          const activePrice = crosshair.histPrice ?? crosshair.median;
          const cy = activePrice !== null ? yS(activePrice) : null;
          const isForecast = crosshair.median !== null;
          const tipH = isForecast ? 74 : 44;

          return (
            <>
              <line
                x1={crosshair.x.toFixed(1)} y1={M.top}
                x2={crosshair.x.toFixed(1)} y2={M.top + cH}
                stroke="rgba(255,255,255,0.09)" strokeWidth="1"
              />
              {cy !== null && (
                <g>
                  <circle cx={crosshair.x.toFixed(1)} cy={cy.toFixed(1)} r="5" fill="rgba(192,192,204,0.12)" />
                  <circle cx={crosshair.x.toFixed(1)} cy={cy.toFixed(1)} r="2.5" fill="rgba(192,192,204,0.9)" />
                </g>
              )}
              <g transform={`translate(${tipX.toFixed(1)},${M.top + 10})`}>
                <rect x="0" y="0" rx="7" ry="7" width={tipW} height={tipH}
                  fill="rgba(8,8,8,0.88)" stroke="rgba(255,255,255,0.07)" strokeWidth="1"
                />
                <text x="9" y="15" fill="rgba(255,255,255,0.30)" fontSize="8.5"
                  fontFamily="ui-sans-serif,sans-serif">
                  {fmtDate(crosshair.time)}
                </text>
                <line x1="9" y1="20" x2={tipW - 9} y2="20" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                {crosshair.histPrice !== null && (
                  <text x="9" y="34" fill="rgba(192,192,204,0.85)" fontSize="10.5"
                    fontWeight="500" fontFamily="ui-monospace,monospace">
                    {fmtPrice(crosshair.histPrice)}
                  </text>
                )}
                {isForecast && (
                  <>
                    <text x="9" y="34" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="ui-sans-serif,sans-serif">↑ {fmtPrice(crosshair.p75!)}</text>
                    <text x="9" y="50" fill="rgba(192,192,204,0.85)" fontSize="10.5" fontWeight="500" fontFamily="ui-monospace,monospace">{fmtPrice(crosshair.median!)}</text>
                    <text x="9" y="66" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="ui-sans-serif,sans-serif">↓ {fmtPrice(crosshair.p25!)}</text>
                  </>
                )}
              </g>
            </>
          );
        })()}
      </svg>
    </div>
  );
}

// ── panel ─────────────────────────────────────────────────────────────────────

export default function AIPredPanel({ ticker }: Props) {
  const [tf, setTf]     = useState<TFOption>("6M");
  const [nDays, setNDays] = useState(() => { try { return JSON.parse(localStorage.getItem("home-pred-days") ?? "10"); } catch { return 10; } });
  const [nRuns, setNRuns] = useState(() => { try { return JSON.parse(localStorage.getItem("home-pred-runs") ?? "10"); } catch { return 10; } });
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predError,   setPredError]   = useState<string | null>(null);

  const canPredict = PREDICT_ENABLED.has(tf);
  const cacheKey   = `home-pred-${ticker}`;

  useEffect(() => { localStorage.setItem("home-pred-days", String(nDays)); }, [nDays]);
  useEffect(() => { localStorage.setItem("home-pred-runs", String(nRuns)); }, [nRuns]);

  // Clear prediction when ticker or TF changes
  useEffect(() => { setPrediction(null); setPredError(null); }, [ticker, tf]);

  // Restore cached prediction (6M only, on ticker change)
  useEffect(() => {
    if (tf !== "6M") return;
    try {
      const c = localStorage.getItem(cacheKey);
      if (c) setPrediction(JSON.parse(c));
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Fetch price history for selected TF
  const { data: histData, isLoading: histLoading } = useQuery<{ bars: { time: number; close: number }[] }>({
    queryKey: ["price-chart", ticker, tf],
    queryFn: async () => {
      const res = await fetch(`/api/market/history/${encodeURIComponent(ticker)}?tf=${tf}`);
      if (!res.ok) throw new Error("Failed to load history");
      const json = await res.json();
      return { bars: (json.bars as OHLCVBar[]).map(b => ({ time: b.time, close: b.close })) };
    },
    staleTime: 5 * 60 * 1000,
  });

  const bars = histData?.bars ?? [];

  const runPredict = useCallback(async () => {
    if (!canPredict || predLoading) return;
    setPredLoading(true);
    setPredError(null);
    try {
      const res  = await fetch(`/api/market/predict/${encodeURIComponent(ticker)}?n=${nDays}&runs=${nRuns}&history=252`);
      const json = await res.json();
      if (json.error) throw new Error(json.details?.[0] ?? json.error);
      setPrediction(json);
      if (tf === "6M") {
        try { localStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* quota */ }
      }
    } catch (e) { setPredError(String(e)); }
    finally { setPredLoading(false); }
  }, [ticker, nDays, nRuns, canPredict, predLoading, tf, cacheKey]);

  const lastClose  = bars.at(-1)?.close ?? null;
  const predFinal  = prediction?.median.at(-1) ?? null;
  const predChange = lastClose && predFinal ? ((predFinal - lastClose) / lastClose) * 100 : null;
  const isUp       = (predChange ?? 0) >= 0;

  return (
    <div className="rounded-xl border border-[#1e1e1e] overflow-hidden" style={{ background: "#101010" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2.5">
          <span className="text-[#c0c0cc] text-[8px]">◆</span>
          <div>
            <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">Price & Forecast</span>
            <p className="text-[9px] text-[#3a3a3a] mt-0.5">Monte Carlo · LLM Ensemble</p>
          </div>
        </div>

        {prediction && lastClose && predFinal && predChange !== null && (
          <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2 shrink-0">
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold tabular-nums",
              isUp
                ? "text-[#c0c0cc] bg-[#c0c0cc0a] border-[#c0c0cc28]"
                : "text-[#ef4444] bg-[#ef44440a] border-[#ef444428]"
            )}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span className="font-mono">{isUp ? "+" : ""}{predChange.toFixed(2)}%</span>
              <span className="opacity-50">·{prediction.n}D</span>
            </div>
            <span className={cn("text-sm font-bold tabular-nums font-mono", isUp ? "text-[#c0c0cc]" : "text-[#ef4444]")}>
              {fmtPrice(predFinal)}
            </span>
          </div>
        )}
      </div>

      {/* TF selector */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1e1e1e]">
        {TF_OPTIONS.map(t => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={cn(
              "px-2.5 py-1 rounded text-[10px] font-medium transition-colors tracking-wide",
              tf === t
                ? "bg-[#c0c0cc15] text-[#c0c0cc] border border-[#c0c0cc28]"
                : "text-[#3a3a3a] hover:text-[#767676]"
            )}
          >{t}</button>
        ))}
      </div>

      {/* Chart */}
      <div className="relative">
        {histLoading ? (
          <div className="flex flex-col items-center justify-center gap-3" style={{ height: 264, background: "#101010" }}>
            <div className="w-8 h-8 rounded-full border-2 border-[#c0c0cc22] border-t-[#c0c0cc] animate-spin" />
            <p className="text-[10px] text-[#3a3a3a]">Loading…</p>
          </div>
        ) : bars.length > 0 ? (
          <PredChart bars={bars} prediction={prediction ?? undefined} height={264} />
        ) : (
          <div className="flex items-center justify-center" style={{ height: 264 }}>
            <p className="text-[10px] text-[#3a3a3a]">No data</p>
          </div>
        )}

        {predLoading && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#101010] border border-[#1e1e1e]">
            <div className="w-3 h-3 rounded-full border border-[#c0c0cc33] border-t-[#c0c0cc] animate-spin" />
            <span className="text-[9px] text-[#3a3a3a]">Running scenarios…</span>
          </div>
        )}
        {predError && !prediction && (
          <div className="absolute bottom-3 left-4 right-4">
            <p className="text-[9px] text-[#ef4444] text-center">{predError}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e1e1e] gap-2">
        {/* Days + Runs spinners */}
        <div className="flex items-center gap-1.5">
          {[
            { label: "Days", val: nDays, set: setNDays, min: 1, max: 30, step: 1 },
            { label: "Runs", val: nRuns, set: setNRuns, min: 1, max: 20, step: 1 },
          ].map(({ label, val, set, min, max, step }, i) => (
            <div key={label} className="flex items-center gap-0.5">
              {i > 0 && <div className="w-px h-3 bg-[#1e1e1e] mx-1" />}
              <span className="text-[9px] text-[#3a3a3a] uppercase tracking-widest">{label}</span>
              <button
                onClick={() => set((v: number) => Math.max(min, v - step))}
                className="w-5 h-5 rounded flex items-center justify-center text-[#3a3a3a] hover:text-[#f0f0f0] hover:bg-[#161616] transition-colors"
              ><Minus className="w-2.5 h-2.5" /></button>
              <span className="text-xs text-[#f0f0f0] w-6 text-center tabular-nums font-mono">{val}</span>
              <button
                onClick={() => set((v: number) => Math.min(max, v + step))}
                className="w-5 h-5 rounded flex items-center justify-center text-[#3a3a3a] hover:text-[#f0f0f0] hover:bg-[#161616] transition-colors"
              ><Plus className="w-2.5 h-2.5" /></button>
            </div>
          ))}
        </div>

        {/* Right: runs count + Predict */}
        <div className="flex items-center gap-2 shrink-0">
          {prediction && (
            <span className="text-[9px] text-[#3a3a3a] tabular-nums hidden xs:inline">
              {prediction.successfulRuns}/{prediction.totalRuns}
            </span>
          )}
          <button
            onClick={runPredict}
            disabled={predLoading || !canPredict}
            title={canPredict ? undefined : "Select 1M or 6M to enable prediction"}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[10px] font-semibold tracking-wide transition-all whitespace-nowrap",
              predLoading
                ? "text-[#3a3a3a] border-[#1e1e1e] cursor-not-allowed"
                : canPredict
                  ? "text-[#c0c0cc] bg-[#c0c0cc0a] border-[#c0c0cc33] hover:bg-[#c0c0cc18] hover:border-[#c0c0cc55]"
                  : "text-[#252525] border-[#161616] cursor-not-allowed opacity-40"
            )}
          >
            {predLoading
              ? <><RefreshCw className="w-3 h-3 animate-spin" />Running…</>
              : <><Sparkles className="w-3 h-3" />Predict</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
