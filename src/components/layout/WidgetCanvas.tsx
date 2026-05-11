"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import { Plus, X } from "lucide-react";
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
  const { activeTicker } = useTickerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Skip the first onLayoutChange fired by react-grid-layout on mount —
  // it reflects the initial props, not a user action, and would overwrite
  // the persisted custom layout before Zustand has finished hydrating.
  const mountedRef = useRef(false);

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

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".react-grid-item")) {
      setPickerOpen(true);
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden bg-[#0d1117] p-2 relative [&:not(:has(.react-grid-item:hover))]:cursor-cell"
      onClick={handleCanvasClick}
    >
      {pickerOpen && (
        <WidgetPicker onAdd={handleAddWidget} onClose={() => setPickerOpen(false)} />
      )}

      {widgets.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none gap-3">
          <div className="w-10 h-10 rounded-xl border-2 border-dashed border-[#21262d] flex items-center justify-center">
            <Plus className="w-5 h-5 text-[#30363d]" />
          </div>
          <p className="text-xs text-[#30363d]">Click anywhere to add a widget</p>
        </div>
      )}

      <GL
        className="react-grid-layout"
        layout={layout}
        cols={12}
        rowHeight={60}
        width={canvasWidth - 16}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-drag-handle"
        draggableCancel=".widget-body"
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
  );
}
