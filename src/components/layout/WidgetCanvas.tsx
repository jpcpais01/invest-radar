"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import { useLayoutStore } from "@/store/layoutStore";
import { WidgetConfig, WidgetType } from "@/types/widgets";
import { useTickerStore } from "@/store/tickerStore";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import CandlestickChart from "@/components/widgets/price/CandlestickChart";
import RSIWidget from "@/components/widgets/technicals/RSIWidget";
import MACDWidget from "@/components/widgets/technicals/MACDWidget";
import KeyMetrics from "@/components/widgets/fundamentals/KeyMetrics";
import NewsFeed from "@/components/widgets/sentiment/NewsFeed";
import EarningsWidget from "@/components/widgets/fundamentals/EarningsWidget";

function renderWidget(type: WidgetType, ticker: string, id: string) {
  switch (type) {
    case "candlestick": return <CandlestickChart ticker={ticker} id={id} />;
    case "rsi": return <RSIWidget ticker={ticker} id={id} />;
    case "macd": return <MACDWidget ticker={ticker} id={id} />;
    case "key-metrics": return <KeyMetrics ticker={ticker} id={id} />;
    case "news-feed": return <NewsFeed ticker={ticker} id={id} />;
    case "earnings": return <EarningsWidget ticker={ticker} id={id} />;
    default:
      return (
        <div className="h-full flex items-center justify-center bg-[#161b22] border border-[#30363d] rounded-lg">
          <span className="text-xs text-[#8b949e]">{type} — coming soon</span>
        </div>
      );
  }
}

export default function WidgetCanvas() {
  const { widgets, setLayout } = useLayoutStore();
  const { activeTicker } = useTickerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1000);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setCanvasWidth(containerRef.current.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const handleLayoutChange = useCallback(
    (newLayout: any[]) => {
      const updated: WidgetConfig[] = widgets.map((w) => {
        const l = newLayout.find((nl: any) => nl.i === w.i);
        if (!l) return w;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      });
      setLayout(updated);
    },
    [widgets, setLayout]
  );

  const MIN_W: Partial<Record<WidgetType, number>> = {
    candlestick:      5,
    "options-chain":  5,
  };

  const layout = widgets.map((w) => ({
    i: w.i, x: w.x, y: w.y, w: w.w, h: w.h,
    minW: MIN_W[w.type] ?? 3,
    minH: 2,
  }));

  const GL = GridLayout as any;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-[#0d1117] p-2">
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
            {renderWidget(w.type, activeTicker, w.id)}
          </div>
        ))}
      </GL>
    </div>
  );
}
