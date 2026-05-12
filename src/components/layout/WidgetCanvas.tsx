"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
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
import WidgetShell from "@/components/widgets/_base/WidgetShell";

interface CatalogEntry {
  type: WidgetType;
  label: string;
  desc: string;
  defaultW: number;
  defaultH: number;
}

const WIDGET_CATALOG: CatalogEntry[] = [
  { type: "candlestick",   label: "Price Chart",      desc: "OHLCV candlestick chart",       defaultW: 8, defaultH: 5 },
  { type: "rsi",           label: "RSI",              desc: "Relative Strength Index",        defaultW: 4, defaultH: 3 },
  { type: "macd",          label: "MACD",             desc: "Moving Average Convergence",     defaultW: 4, defaultH: 3 },
  { type: "stochastic",    label: "Stochastic",       desc: "Stochastic oscillator %K/%D",    defaultW: 4, defaultH: 3 },
  { type: "bollinger",     label: "Bollinger Bands",  desc: "Volatility bands",               defaultW: 4, defaultH: 3 },
  { type: "ema",           label: "EMA Panel",        desc: "9/21/50/100/200 EMAs",           defaultW: 6, defaultH: 3 },
  { type: "signal-summary",label: "Signal Summary",   desc: "Aggregate buy/sell signals",     defaultW: 6, defaultH: 3 },
  { type: "adx",           label: "ADX / DMI",        desc: "Trend strength & direction",      defaultW: 4, defaultH: 3 },
  { type: "cci",           label: "CCI (20)",          desc: "Commodity Channel Index",         defaultW: 4, defaultH: 3 },
  { type: "psar",          label: "Parabolic SAR",     desc: "Stop-and-reverse reversal dots",  defaultW: 4, defaultH: 3 },
  { type: "obv",           label: "OBV",               desc: "On-Balance Volume trend",         defaultW: 4, defaultH: 3 },
  { type: "key-metrics",   label: "Key Metrics",      desc: "P/E, EV/EBITDA, market cap",    defaultW: 4, defaultH: 3 },
  { type: "earnings",      label: "Earnings",         desc: "EPS history & estimates",        defaultW: 4, defaultH: 3 },
  { type: "news-feed",     label: "News Feed",        desc: "Latest news with sentiment",     defaultW: 4, defaultH: 3 },
  { type: "iv-rank",       label: "IV Rank",          desc: "Implied volatility rank",        defaultW: 4, defaultH: 3 },
  { type: "put-call-ratio",label: "Put/Call Ratio",   desc: "Options sentiment ratio",        defaultW: 4, defaultH: 3 },
  { type: "options-chain", label: "Options Chain",    desc: "Full calls/puts table",          defaultW: 8, defaultH: 6 },
  { type: "max-pain",      label: "Max Pain",         desc: "Max pain strike calculator",     defaultW: 4, defaultH: 3 },
  { type: "prob-cone",     label: "Probability Cone", desc: "1σ/2σ price range at expiry",   defaultW: 4, defaultH: 3 },
];

function WidgetPicker({ onAdd, onClose }: { onAdd: (entry: CatalogEntry) => void; onClose: () => void }) {
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
          {WIDGET_CATALOG.map((entry) => (
            <button
              key={entry.type}
              onClick={() => { onAdd(entry); onClose(); }}
              className="text-left px-3 py-2.5 rounded-xl border border-[#21262d] bg-[#161b22] hover:border-[#1f6feb44] hover:bg-[#1f6feb08] transition-all group"
            >
              <div className="text-xs font-semibold text-white group-hover:text-[#388bfd] transition-colors">{entry.label}</div>
              <div className="text-[10px] text-[#484f58] mt-0.5 leading-relaxed">{entry.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderWidget(type: WidgetType, ticker: string, id: string, onRemove: (id: string) => void) {
  switch (type) {
    case "candlestick": return <CandlestickChart ticker={ticker} id={id} />;
    case "rsi": return <RSIWidget ticker={ticker} id={id} />;
    case "stochastic": return <StochasticWidget ticker={ticker} id={id} />;
    case "macd": return <MACDWidget ticker={ticker} id={id} />;
    case "key-metrics": return <KeyMetrics ticker={ticker} id={id} />;
    case "news-feed": return <NewsFeed ticker={ticker} id={id} />;
    case "earnings": return <EarningsWidget ticker={ticker} id={id} />;
    case "signal-summary": return <SignalSummaryWidget ticker={ticker} id={id} />;
    case "adx":            return <ADXWidget ticker={ticker} id={id} />;
    case "cci":            return <CCIWidget ticker={ticker} id={id} />;
    case "psar":           return <PSARWidget ticker={ticker} id={id} />;
    case "obv":            return <OBVWidget ticker={ticker} id={id} />;
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

export default function WidgetCanvas() {
  const { widgets, setLayout, addWidget, removeWidget } = useLayoutStore();
  const { activeTicker, watchlist, addToWatchlist, removeFromWatchlist } = useTickerStore();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the first onLayoutChange fired by react-grid-layout on mount —
  // it reflects the initial props, not a user action, and would overwrite
  // the persisted custom layout before Zustand has finished hydrating.
  const mountedRef = useRef(false);
  // When locked flips we force a GL remount (via key). GL fires onLayoutChange
  // immediately on mount — reset mountedRef synchronously during render so
  // that spurious first call is skipped, not written back to the store.
  const prevLockedRef = useRef(locked);
  if (prevLockedRef.current !== locked) {
    prevLockedRef.current = locked;
    mountedRef.current = false;
  }

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setCanvasWidth(containerRef.current.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // When the widget set changes (layout switch), allow the next onLayoutChange
  // to be skipped again since it will just reflect the new props, not a user drag.
  const widgetIds = widgets.map((w) => w.i).join(",");
  useEffect(() => {
    mountedRef.current = false;
  }, [widgetIds]);

  const handleLayoutChange = useCallback(
    (newLayout: any[]) => {
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      const updated: WidgetConfig[] = widgets.map((w) => {
        const l = newLayout.find((nl: any) => nl.i === w.i);
        if (!l) return w;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      });
      setLayout(updated);
    },
    [widgets, setLayout]
  );

  const handleRefreshAll = () => {
    setRefreshing(true);
    queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleClear = () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearTimerRef.current = setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setClearConfirm(false);
    widgets.forEach((w) => removeWidget(w.id));
  };

  const handleAddWidget = useCallback((entry: CatalogEntry) => {
    const nextY = widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    const id = `${entry.type}-${Date.now()}`;
    const widget: WidgetConfig = {
      id, type: entry.type, title: entry.label, i: id,
      x: 0, y: nextY, w: entry.defaultW, h: entry.defaultH,
      minW: entry.type === "candlestick" || entry.type === "options-chain" ? 5 : 3,
      minH: 2,
    };
    addWidget(widget);
  }, [widgets, addWidget]);

  const MIN_W: Partial<Record<WidgetType, number>> = {
    candlestick:     5,
    "options-chain": 5,
  };

  const layout = widgets.map((w) => ({
    i: w.i, x: w.x, y: w.y, w: w.w, h: w.h,
    minW: MIN_W[w.type] ?? 3,
    minH: 2,
  }));

  const GL = GridLayout as any;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      {pickerOpen && (
        <WidgetPicker onAdd={handleAddWidget} onClose={() => setPickerOpen(false)} />
      )}

      {/* Canvas toolbar */}
      <div className="flex items-center h-8 px-2 gap-0.5 border-b border-[#21262d] shrink-0 bg-[#0d1117]">
        {/* Left group */}
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#8b949e] hover:text-white hover:bg-[#161b22] transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Widget
        </button>

        <div className="w-px h-3.5 bg-[#21262d] mx-1" />

        <button
          onClick={handleRefreshAll}
          title="Refresh all widgets"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#8b949e] hover:text-white hover:bg-[#161b22] transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
          Refresh
        </button>

        <div className="w-px h-3.5 bg-[#21262d] mx-1" />

        {/* Watchlist star */}
        {(() => {
          const inWatchlist = watchlist.includes(activeTicker);
          return (
            <button
              onClick={() => inWatchlist ? removeFromWatchlist(activeTicker) : addToWatchlist(activeTicker)}
              title={inWatchlist ? `Remove ${activeTicker} from watchlist` : `Add ${activeTicker} to watchlist`}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                inWatchlist
                  ? "text-[#d29922] hover:bg-[#161b22]"
                  : "text-[#8b949e] hover:text-[#d29922] hover:bg-[#161b22]"
              )}
            >
              <Star className={cn("w-3 h-3", inWatchlist && "fill-current")} />
              {inWatchlist ? activeTicker : `Watch ${activeTicker}`}
            </button>
          );
        })()}

        {/* Right group */}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => setLocked((v) => !v)}
            title={locked ? "Unlock layout" : "Lock layout"}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
              locked
                ? "text-[#388bfd] bg-[#1f6feb15] hover:bg-[#1f6feb22]"
                : "text-[#8b949e] hover:text-white hover:bg-[#161b22]"
            )}
          >
            {locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
            {locked ? "Locked" : "Lock"}
          </button>

          <div className="w-px h-3.5 bg-[#21262d] mx-1" />

          <button
            onClick={handleClear}
            title={clearConfirm ? "Click again to confirm" : "Remove all widgets"}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
              clearConfirm
                ? "text-[#f85149] bg-[#f8514915] hover:bg-[#f8514922]"
                : "text-[#8b949e] hover:text-[#f85149] hover:bg-[#161b22]"
            )}
          >
            <Trash2 className="w-3 h-3" />
            {clearConfirm ? "Confirm?" : "Clear"}
          </button>
        </div>
      </div>

      {/* Canvas content — when locked, CSS hides resize handles */}
      <div
        ref={containerRef}
        onMouseDownCapture={locked ? (e: React.MouseEvent) => {
          if ((e.target as HTMLElement).closest(".widget-drag-handle")) {
            e.stopPropagation();
            e.preventDefault();
          }
        } : undefined}
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden p-2 relative",
          locked && "[&_.react-resizable-handle]:!hidden [&_.widget-drag-handle]:!cursor-default"
        )}
      >
        {widgets.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center select-none gap-3">
            <button
              onClick={() => setPickerOpen(true)}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="w-10 h-10 rounded-xl border-2 border-dashed border-[#21262d] group-hover:border-[#30363d] flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-[#30363d] group-hover:text-[#484f58] transition-colors" />
              </div>
              <p className="text-xs text-[#30363d] group-hover:text-[#484f58] transition-colors">Add a widget to get started</p>
            </button>
          </div>
        )}

        <GL
          className="react-grid-layout"
          layout={layout}
          cols={12}
          rowHeight={60}
          width={canvasWidth - 16}
          onLayoutChange={handleLayoutChange}
          key={locked ? "locked" : "unlocked"}
          draggableHandle=".widget-drag-handle"
          draggableCancel=".widget-body"
          isDraggable={!locked}
          isResizable={!locked}
          margin={[8, 8]}
          containerPadding={[0, 0]}
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
  );
}
