"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WidgetConfig, PresetLayout } from "@/types/widgets";

const OVERVIEW_LAYOUT: WidgetConfig[] = [
  { id: "chart",       type: "candlestick", title: "Price Chart",        i: "chart",       x: 0, y: 0, w: 8, h: 5, minW: 5, minH: 4 },
  { id: "rsi",         type: "rsi",         title: "RSI (14)",            i: "rsi",         x: 8, y: 0, w: 4, h: 3, minW: 3, minH: 2 },
  { id: "stochastic",  type: "stochastic",  title: "Stochastic (14,3)",   i: "stochastic",  x: 8, y: 3, w: 4, h: 2, minW: 3, minH: 2 },
  { id: "metrics",     type: "key-metrics", title: "Key Metrics",         i: "metrics",     x: 0, y: 5, w: 4, h: 3, minW: 3, minH: 2 },
  { id: "news",        type: "news-feed",   title: "News Feed",           i: "news",        x: 4, y: 5, w: 4, h: 3, minW: 3, minH: 2 },
  { id: "earnings",    type: "earnings",    title: "Earnings",            i: "earnings",    x: 8, y: 5, w: 4, h: 3, minW: 3, minH: 2 },
];

const OPTIONS_LAYOUT: WidgetConfig[] = [
  { id: "chart",         type: "candlestick",    title: "Price Chart",      i: "chart",         x: 0, y: 0, w: 8, h: 5, minW: 5, minH: 5 },
  { id: "iv-rank",       type: "iv-rank",        title: "IV Rank",          i: "iv-rank",       x: 8, y: 0, w: 4, h: 3, minW: 3, minH: 3 },
  { id: "pcr",           type: "put-call-ratio",  title: "Put/Call Ratio",   i: "pcr",           x: 8, y: 3, w: 4, h: 2, minW: 3, minH: 3 },
  { id: "options-chain", type: "options-chain",  title: "Options Chain",    i: "options-chain", x: 0, y: 5, w: 8, h: 6, minW: 5, minH: 5 },
  { id: "max-pain",      type: "max-pain",       title: "Max Pain",         i: "max-pain",      x: 8, y: 5, w: 4, h: 3, minW: 3, minH: 3 },
  { id: "prob-cone",     type: "prob-cone",      title: "Probability Cone", i: "prob-cone",     x: 8, y: 8, w: 4, h: 3, minW: 3, minH: 3 },
];

const TECHNICAL_LAYOUT: WidgetConfig[] = [
  { id: "chart",     type: "candlestick",    title: "Price Chart",    i: "chart",     x: 0,  y: 0, w: 12, h: 6, minW: 5, minH: 5 },
  { id: "rsi",       type: "rsi",            title: "RSI",            i: "rsi",       x: 0,  y: 6, w: 4,  h: 3, minW: 3, minH: 4 },
  { id: "macd",      type: "macd",           title: "MACD",           i: "macd",      x: 4,  y: 6, w: 4,  h: 3, minW: 3, minH: 4 },
  { id: "bollinger", type: "bollinger",      title: "Bollinger Bands",i: "bollinger", x: 8,  y: 6, w: 4,  h: 3, minW: 3, minH: 4 },
  { id: "ema",       type: "ema",            title: "EMA Panel",      i: "ema",       x: 0,  y: 9, w: 6,  h: 3, minW: 3, minH: 3 },
  { id: "signal",    type: "signal-summary", title: "Signal Summary", i: "signal",    x: 6,  y: 9, w: 6,  h: 3, minW: 3, minH: 3 },
];

export const PRESET_LAYOUTS: Record<PresetLayout, WidgetConfig[]> = {
  overview: OVERVIEW_LAYOUT,
  options: OPTIONS_LAYOUT,
  technical: TECHNICAL_LAYOUT,
};

export interface CustomLayout {
  id: string;
  name: string;
  widgets: WidgetConfig[];
}

interface LayoutState {
  widgets: WidgetConfig[];
  activePreset: PresetLayout | null;
  activeCustomId: string | null;
  customLayouts: CustomLayout[];

  setLayout: (widgets: WidgetConfig[]) => void;
  applyPreset: (preset: PresetLayout) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (id: string) => void;

  addCustomLayout: (name: string) => void;
  applyCustomLayout: (id: string) => void;
  removeCustomLayout: (id: string) => void;
}

function saveToCustom(
  customLayouts: CustomLayout[],
  activeCustomId: string | null,
  widgets: WidgetConfig[]
): CustomLayout[] {
  if (!activeCustomId) return customLayouts;
  return customLayouts.map((l) =>
    l.id === activeCustomId ? { ...l, widgets } : l
  );
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      widgets: OVERVIEW_LAYOUT,
      activePreset: "overview",
      activeCustomId: null,
      customLayouts: [],

      // Called on every drag/resize — auto-saves to custom layout if one is active
      setLayout: (widgets) =>
        set((s) => ({
          widgets,
          activePreset: s.activeCustomId ? s.activePreset : null,
          customLayouts: saveToCustom(s.customLayouts, s.activeCustomId, widgets),
        })),

      applyPreset: (preset) =>
        set({ widgets: PRESET_LAYOUTS[preset], activePreset: preset, activeCustomId: null }),

      addWidget: (widget) =>
        set((s) => {
          const widgets = [...s.widgets, widget];
          return {
            widgets,
            customLayouts: saveToCustom(s.customLayouts, s.activeCustomId, widgets),
          };
        }),

      removeWidget: (id) =>
        set((s) => {
          const widgets = s.widgets.filter((w) => w.id !== id);
          return {
            widgets,
            customLayouts: saveToCustom(s.customLayouts, s.activeCustomId, widgets),
          };
        }),

      addCustomLayout: (name) =>
        set((s) => {
          const id = `custom-${Date.now()}`;
          const newLayout: CustomLayout = { id, name, widgets: [] };
          return {
            customLayouts: [...s.customLayouts, newLayout],
            widgets: [],
            activePreset: null,
            activeCustomId: id,
          };
        }),

      applyCustomLayout: (id) =>
        set((s) => {
          const layout = s.customLayouts.find((l) => l.id === id);
          if (!layout) return s;
          return { widgets: layout.widgets, activePreset: null, activeCustomId: id };
        }),

      removeCustomLayout: (id) =>
        set((s) => {
          const customLayouts = s.customLayouts.filter((l) => l.id !== id);
          const wasActive = s.activeCustomId === id;
          return {
            customLayouts,
            ...(wasActive && {
              widgets: OVERVIEW_LAYOUT,
              activePreset: "overview",
              activeCustomId: null,
            }),
          };
        }),
    }),
    { name: "investradar-layout" }
  )
);
