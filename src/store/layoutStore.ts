"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WidgetConfig, PresetLayout } from "@/types/widgets";

const OVERVIEW_LAYOUT: WidgetConfig[] = [
  { id: "chart", type: "candlestick", title: "Price Chart", i: "chart", x: 0, y: 0, w: 8, h: 6, minW: 5, minH: 5 },
  { id: "rsi", type: "rsi", title: "RSI", i: "rsi", x: 8, y: 0, w: 4, h: 3, minW: 3, minH: 4 },
  { id: "macd", type: "macd", title: "MACD", i: "macd", x: 8, y: 3, w: 4, h: 3, minW: 3, minH: 4 },
  { id: "metrics", type: "key-metrics", title: "Key Metrics", i: "metrics", x: 0, y: 6, w: 4, h: 4, minW: 3, minH: 4 },
  { id: "news", type: "news-feed", title: "News Feed", i: "news", x: 4, y: 6, w: 4, h: 6, minW: 3, minH: 5 },
  { id: "earnings", type: "earnings", title: "Earnings", i: "earnings", x: 8, y: 6, w: 4, h: 4, minW: 3, minH: 4 },
];

const OPTIONS_LAYOUT: WidgetConfig[] = [
  { id: "chart", type: "candlestick", title: "Price Chart", i: "chart", x: 0, y: 0, w: 8, h: 5, minW: 5, minH: 5 },
  { id: "iv-rank", type: "iv-rank", title: "IV Rank", i: "iv-rank", x: 8, y: 0, w: 4, h: 3, minW: 3, minH: 3 },
  { id: "pcr", type: "put-call-ratio", title: "Put/Call Ratio", i: "pcr", x: 8, y: 3, w: 4, h: 2, minW: 3, minH: 3 },
  { id: "options-chain", type: "options-chain", title: "Options Chain", i: "options-chain", x: 0, y: 5, w: 8, h: 6, minW: 5, minH: 5 },
  { id: "max-pain", type: "max-pain", title: "Max Pain", i: "max-pain", x: 8, y: 5, w: 4, h: 3, minW: 3, minH: 3 },
  { id: "prob-cone", type: "prob-cone", title: "Probability Cone", i: "prob-cone", x: 8, y: 8, w: 4, h: 3, minW: 3, minH: 3 },
];

const TECHNICAL_LAYOUT: WidgetConfig[] = [
  { id: "chart", type: "candlestick", title: "Price Chart", i: "chart", x: 0, y: 0, w: 12, h: 6, minW: 5, minH: 5 },
  { id: "rsi", type: "rsi", title: "RSI", i: "rsi", x: 0, y: 6, w: 4, h: 3, minW: 3, minH: 4 },
  { id: "macd", type: "macd", title: "MACD", i: "macd", x: 4, y: 6, w: 4, h: 3, minW: 3, minH: 4 },
  { id: "bollinger", type: "bollinger", title: "Bollinger Bands", i: "bollinger", x: 8, y: 6, w: 4, h: 3, minW: 3, minH: 4 },
  { id: "ema", type: "ema", title: "EMA Panel", i: "ema", x: 0, y: 9, w: 6, h: 3, minW: 3, minH: 3 },
  { id: "signal", type: "signal-summary", title: "Signal Summary", i: "signal", x: 6, y: 9, w: 6, h: 3, minW: 3, minH: 3 },
];

export const PRESET_LAYOUTS: Record<PresetLayout, WidgetConfig[]> = {
  overview: OVERVIEW_LAYOUT,
  options: OPTIONS_LAYOUT,
  technical: TECHNICAL_LAYOUT,
};

interface LayoutState {
  widgets: WidgetConfig[];
  activePreset: PresetLayout | null;
  setLayout: (widgets: WidgetConfig[]) => void;
  applyPreset: (preset: PresetLayout) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (id: string) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      widgets: OVERVIEW_LAYOUT,
      activePreset: "overview",
      setLayout: (widgets) => set({ widgets, activePreset: null }),
      applyPreset: (preset) =>
        set({ widgets: PRESET_LAYOUTS[preset], activePreset: preset }),
      addWidget: (widget) =>
        set((s) => ({ widgets: [...s.widgets, widget], activePreset: null })),
      removeWidget: (id) =>
        set((s) => ({
          widgets: s.widgets.filter((w) => w.id !== id),
          activePreset: null,
        })),
    }),
    { name: "investradar-layout" }
  )
);
