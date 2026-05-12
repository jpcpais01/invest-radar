"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import { Plus, X, RefreshCw, Lock, LockOpen, Trash2, Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLayoutStore } from "@/store/layoutStore";
import { WidgetConfig, WidgetType } from "@/types/widgets";
import { useTickerStore } from "@/store/tickerStore";
import { cn } from "@/lib/utils";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import CandlestickChart from "@/components/widgets/price/CandlestickChart";
import RSIWidget from "@/components/widgets/technicals/RSIWidget";
import StochasticWidget from "@/components/widgets/technicals/StochasticWidget";
import MACDWidget from "@/components/widgets/technicals/MACDWidget";
import KeyMetrics from "@/components/widgets/fundamentals/KeyMetrics";
import NewsFeed from "@/components/widgets/sentiment/NewsFeed";
import EarningsWidget from "@/components/widgets/fundamentals/EarningsWidget";
import SignalSummaryWidget from "@/components/widgets/technicals/SignalSummaryWidget";
import ADXWidget from "@/components/widgets/technicals/ADXWidget";
import CCIWidget from "@/components/widgets/technicals/CCIWidget";
import PSARWidget from "@/components/widgets/technicals/PSARWidget";
import OBVWidget from "@/components/widgets/technicals/OBVWidget";
import QualityScoreWidget from "@/components/widgets/investment/QualityScoreWidget";
import ValuationContextWidget from "@/components/widgets/investment/ValuationContextWidget";
import HeatmapWidget from "@/components/widgets/investment/HeatmapWidget";
import ConvictionTrackerWidget from "@/components/widgets/investment/ConvictionTrackerWidget";
import NarrativeIndexWidget from "@/components/widgets/investment/NarrativeIndexWidget";
import WidgetShell from "@/components/widgets/_base/WidgetShell";

// ─── Grid geometry ────────────────────────────────────────────────────────────
//
// We use 24 columns with containerPadding=[0,0] and margin=[GAP,GAP].
// Per the RGL source (chunk-BPZQUJ7Y.js):
//
//   effectiveContainerPadding = containerPadding ?? margin   ← that's why we set it explicitly
//   colWidth = (width - margin[0]*(cols-1) - containerPadding[0]*2) / cols
//
// With containerPadding=[0,0]:
//   colWidth = (width - GAP*(COLS-1)) / COLS
//
// We set rowHeight = colWidth by computing it from the measured container width.
// Result: both resize axes snap by the same pixel distance on every screen size.

const COLS = 24;
const GAP  = 6;   // px — used for both margin and containerPadding is 0

// colWidth (== rowHeight) = (innerWidth - GAP*(COLS-1)) / COLS
function calcRowHeight(innerWidth: number): number {
  return Math.max(20, Math.round((innerWidth - GAP * (COLS - 1)) / COLS));
}

// ─── Widget catalogue ─────────────────────────────────────────────────────────
interface CatalogEntry {
  type: WidgetType;
  label: string;
  desc: string;
  defaultW: number;
  defaultH: number;
  minW: number;
}

const CATALOG: CatalogEntry[] = [
  { type: "candlestick",        label: "Price Chart",           desc: "OHLCV candlestick chart",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "rsi",                label: "RSI",                   desc: "Relative Strength Index",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "macd",               label: "MACD",                  desc: "Moving Average Convergence",           defaultW: 8, defaultH: 2, minW: 4 },
  { type: "stochastic",         label: "Stochastic",            desc: "Stochastic oscillator %K/%D",          defaultW: 8, defaultH: 2, minW: 4 },
  { type: "bollinger",          label: "Bollinger Bands",       desc: "Volatility bands",                     defaultW: 8, defaultH: 2, minW: 4 },
  { type: "ema",                label: "EMA Panel",             desc: "9 / 21 / 50 / 100 / 200 EMAs",        defaultW: 8, defaultH: 2, minW: 4 },
  { type: "signal-summary",     label: "Signal Summary",        desc: "Aggregate buy / sell signals",         defaultW: 8, defaultH: 2, minW: 4 },
  { type: "adx",                label: "ADX / DMI",             desc: "Trend strength & direction",           defaultW: 8, defaultH: 2, minW: 4 },
  { type: "cci",                label: "CCI (20)",              desc: "Commodity Channel Index",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "psar",               label: "Parabolic SAR",         desc: "Stop-and-reverse reversal dots",       defaultW: 8, defaultH: 2, minW: 4 },
  { type: "obv",                label: "OBV",                   desc: "On-Balance Volume trend",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "key-metrics",        label: "Key Metrics",           desc: "P/E, EV/EBITDA, market cap",          defaultW: 8, defaultH: 2, minW: 4 },
  { type: "earnings",           label: "Earnings",              desc: "EPS history & estimates",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "news-feed",          label: "News Feed",             desc: "Latest news with sentiment",           defaultW: 8, defaultH: 2, minW: 4 },
  { type: "iv-rank",            label: "IV Rank",               desc: "Implied volatility rank",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "put-call-ratio",     label: "Put / Call Ratio",      desc: "Options sentiment ratio",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "options-chain",      label: "Options Chain",         desc: "Full calls / puts table",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "max-pain",           label: "Max Pain",              desc: "Max pain strike calculator",           defaultW: 8, defaultH: 2, minW: 4 },
  { type: "prob-cone",          label: "Probability Cone",      desc: "1σ / 2σ price range at expiry",       defaultW: 8, defaultH: 2, minW: 4 },
  { type: "quality-score",      label: "Quality Score",         desc: "Business quality: margins, ROE, FCF", defaultW: 8, defaultH: 2, minW: 4 },
  { type: "valuation-context",  label: "Valuation Context",     desc: "Multiples vs own 1Y history",         defaultW: 8, defaultH: 2, minW: 4 },
  { type: "timeframe-heatmap",  label: "Timeframe Heatmap",     desc: "1M – 2Y agreement grid",              defaultW: 8, defaultH: 2, minW: 4 },
  { type: "conviction-tracker", label: "Management Conviction", desc: "Insider buy / sell trend",            defaultW: 8, defaultH: 2, minW: 4 },
  { type: "narrative-index",    label: "Narrative Index",       desc: "News narrative lifecycle stage",      defaultW: 8, defaultH: 2, minW: 4 },
];

// ─── Widget renderer ──────────────────────────────────────────────────────────
function renderWidget(type: WidgetType, ticker: string, id: string, onRemove: (id: string) => void) {
  switch (type) {
    case "candlestick":         return <CandlestickChart   ticker={ticker} id={id} />;
    case "rsi":                 return <RSIWidget           ticker={ticker} id={id} />;
    case "stochastic":          return <StochasticWidget    ticker={ticker} id={id} />;
    case "macd":                return <MACDWidget          ticker={ticker} id={id} />;
    case "key-metrics":         return <KeyMetrics          ticker={ticker} id={id} />;
    case "news-feed":           return <NewsFeed            ticker={ticker} id={id} />;
    case "earnings":            return <EarningsWidget      ticker={ticker} id={id} />;
    case "signal-summary":      return <SignalSummaryWidget ticker={ticker} id={id} />;
    case "adx":                 return <ADXWidget           ticker={ticker} id={id} />;
    case "cci":                 return <CCIWidget           ticker={ticker} id={id} />;
    case "psar":                return <PSARWidget          ticker={ticker} id={id} />;
    case "obv":                 return <OBVWidget           ticker={ticker} id={id} />;
    case "quality-score":       return <QualityScoreWidget      ticker={ticker} id={id} />;
    case "valuation-context":   return <ValuationContextWidget   ticker={ticker} id={id} />;
    case "timeframe-heatmap":   return <HeatmapWidget            ticker={ticker} id={id} />;
    case "conviction-tracker":  return <ConvictionTrackerWidget  ticker={ticker} id={id} />;
    case "narrative-index":     return <NarrativeIndexWidget     ticker={ticker} id={id} />;
    default:
      return (
        <WidgetShell title={type} id={id} onRemove={onRemove}>
          <div className="h-full flex items-center justify-center">
            <span className="text-xs text-[#484f58]">{type} — coming soon</span>
          </div>
        </WidgetShell>
      );
  }
}

// ─── Widget picker modal ──────────────────────────────────────────────────────
function WidgetPicker({ onAdd, onClose }: { onAdd: (e: CatalogEntry) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-[480px] max-h-[70vh] flex flex-col rounded-2xl border border-[#21262d] bg-[#0d1117] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#21262d]">
          <span className="text-sm font-semibold text-white">Add Widget</span>
          <button onClick={onClose} className="text-[#484f58] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-3 grid grid-cols-2 gap-2">
          {CATALOG.map((e) => (
            <button
              key={e.type}
              onClick={() => { onAdd(e); onClose(); }}
              className="text-left px-3 py-2.5 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-[#1f6feb44] hover:bg-[#1f6feb08] transition-all group"
            >
              <div className="text-xs font-semibold text-white group-hover:text-[#388bfd] transition-colors">{e.label}</div>
              <div className="text-[10px] text-[#484f58] mt-0.5 leading-relaxed">{e.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GL = GridLayout as any;

export default function WidgetCanvas() {
  const { widgets, setLayout, addWidget, removeWidget } = useLayoutStore();
  const { activeTicker, watchlist, addToWatchlist, removeFromWatchlist } = useTickerStore();
  const queryClient = useQueryClient();

  // gridRef sits on a div with NO padding so its clientWidth == the exact pixel
  // budget we hand to <GL width={...}>.  This makes calcRowHeight() exact.
  const gridRef = useRef<HTMLDivElement>(null);

  // Single state object so both values update in one React render (no flash).
  const [grid, setGrid] = useState({ width: 1200, rowHeight: calcRowHeight(1200) });

  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [locked,       setLocked]       = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure the grid container and keep rowHeight == colWidth at all times.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setGrid({ width: w, rowHeight: calcRowHeight(w) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Skip the initial spurious onLayoutChange from RGL ──
  // RGL fires onLayoutChange once on mount (and on remount after key flip).
  // That call just reflects the props we already have — we must NOT write it
  // back to the store or it can corrupt persisted custom positions.
  const skipRef = useRef(true);

  // Remount key for locking (forces GL to remount → skip its first callback).
  const glKey = locked ? "locked" : "unlocked";
  const prevKey = useRef(glKey);
  if (prevKey.current !== glKey) {
    prevKey.current = glKey;
    skipRef.current = true;
  }

  // Also skip when the widget set changes (preset switch / add / remove).
  const widgetSig = widgets.map((w) => w.i).join(",");
  const prevSig = useRef(widgetSig);
  if (prevSig.current !== widgetSig) {
    prevSig.current = widgetSig;
    skipRef.current = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLayoutChange = useCallback((next: any[]) => {
    if (skipRef.current) { skipRef.current = false; return; }
    const updated: WidgetConfig[] = widgets.map((w) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const l = next.find((n: any) => n.i === w.i);
      return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
    });
    setLayout(updated);
  }, [widgets, setLayout]);

  const handleRefreshAll = () => {
    setRefreshing(true);
    queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleClear = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearTimer.current = setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setClearConfirm(false);
    widgets.forEach((w) => removeWidget(w.id));
  };

  const handleAddWidget = useCallback((entry: CatalogEntry) => {
    const nextY = widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    const id = `${entry.type}-${Date.now()}`;
    addWidget({
      id, type: entry.type, title: entry.label, i: id,
      x: 0, y: nextY,
      w: entry.defaultW, h: entry.defaultH,
      minW: entry.minW, minH: 1,
    });
  }, [widgets, addWidget]);

  const glLayout = widgets.map((w) => {
    const cat = CATALOG.find((c) => c.type === w.type);
    return { i: w.i, x: w.x, y: w.y, w: w.w, h: w.h, minW: cat?.minW ?? 4, minH: 2 };
  });

  const inWatchlist = watchlist.includes(activeTicker);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      {pickerOpen && <WidgetPicker onAdd={handleAddWidget} onClose={() => setPickerOpen(false)} />}

      {/* ── Toolbar ── */}
      <div className="flex items-center h-8 px-2 gap-0.5 border-b border-[#21262d] shrink-0 bg-[#0d1117]">
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#8b949e] hover:text-white hover:bg-[#161b22] transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Widget
        </button>

        <div className="w-px h-3.5 bg-[#21262d] mx-1" />

        <button
          onClick={handleRefreshAll}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#8b949e] hover:text-white hover:bg-[#161b22] transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} /> Refresh
        </button>

        <div className="w-px h-3.5 bg-[#21262d] mx-1" />

        <button
          onClick={() => inWatchlist ? removeFromWatchlist(activeTicker) : addToWatchlist(activeTicker)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
            inWatchlist ? "text-[#d29922] hover:bg-[#161b22]" : "text-[#8b949e] hover:text-[#d29922] hover:bg-[#161b22]"
          )}
        >
          <Star className={cn("w-3 h-3", inWatchlist && "fill-current")} />
          {inWatchlist ? activeTicker : `Watch ${activeTicker}`}
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => setLocked((v) => !v)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
              locked ? "text-[#388bfd] bg-[#1f6feb15] hover:bg-[#1f6feb22]" : "text-[#8b949e] hover:text-white hover:bg-[#161b22]"
            )}
          >
            {locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
            {locked ? "Locked" : "Lock"}
          </button>

          <div className="w-px h-3.5 bg-[#21262d] mx-1" />

          <button
            onClick={handleClear}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
              clearConfirm ? "text-[#f85149] bg-[#f8514915] hover:bg-[#f8514922]" : "text-[#8b949e] hover:text-[#f85149] hover:bg-[#161b22]"
            )}
          >
            <Trash2 className="w-3 h-3" />
            {clearConfirm ? "Confirm?" : "Clear"}
          </button>
        </div>
      </div>

      {/* ── Scroll container (has padding for aesthetics — NOT the ref target) ── */}
      <div
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden relative p-2",
          locked && "[&_.react-resizable-handle]:!hidden [&_.widget-drag-handle]:!cursor-default"
        )}
        onMouseDownCapture={locked ? (e: React.MouseEvent) => {
          if ((e.target as HTMLElement).closest(".widget-drag-handle")) {
            e.stopPropagation();
            e.preventDefault();
          }
        } : undefined}
      >
        {widgets.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
            <button onClick={() => setPickerOpen(true)} className="flex flex-col items-center gap-2 group">
              <div className="w-10 h-10 rounded-xl border-2 border-dashed border-[#21262d] group-hover:border-[#30363d] flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-[#30363d] group-hover:text-[#484f58] transition-colors" />
              </div>
              <p className="text-xs text-[#30363d] group-hover:text-[#484f58] transition-colors">Add a widget to get started</p>
            </button>
          </div>
        )}

        {/*
          gridRef is on this div — no padding, so clientWidth == the exact pixel budget.
          We measure it and feed both `width` and `rowHeight` to GL from that one number.
          containerPadding=[0,0] is EXPLICIT so RGL's colWidth formula is simply:
            colWidth = (width - GAP*(COLS-1)) / COLS
          which is exactly what calcRowHeight() computes — guaranteed equal steps.
        */}
        <div ref={gridRef}>
          <GL
            layout={glLayout}
            cols={COLS}
            rowHeight={grid.rowHeight}
            width={grid.width}
            margin={[GAP, GAP]}
            containerPadding={[0, 0]}
            onLayoutChange={handleLayoutChange}
            key={glKey}
            draggableHandle=".widget-drag-handle"
            draggableCancel=".widget-body"
            isDraggable={!locked}
            isResizable={!locked}
            resizeHandles={["se", "s", "e", "sw", "w", "n", "ne", "nw"]}
            useCSSTransforms={false}
          >
            {widgets.map((w) => (
              <div key={w.i} className="relative">
                {renderWidget(w.type, activeTicker, w.id, removeWidget)}
              </div>
            ))}
          </GL>
        </div>
      </div>
    </div>
  );
}
