"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WidgetConfig, PresetLayout } from "@/types/widgets";

const OVERVIEW_LAYOUT: WidgetConfig[] = [
  { id: "chart",       type: "candlestick", title: "Price Chart",        i: "chart",       x: 0, y: 0,  w: 8, h: 10, minW: 5, minH: 8 },
  { id: "rsi",         type: "rsi",         title: "RSI (14)",            i: "rsi",         x: 8, y: 0,  w: 4, h: 6,  minW: 3, minH: 4 },
  { id: "stochastic",  type: "stochastic",  title: "Stochastic (14,3)",   i: "stochastic",  x: 8, y: 6,  w: 4, h: 4,  minW: 3, minH: 4 },
  { id: "metrics",     type: "key-metrics", title: "Key Metrics",         i: "metrics",     x: 0, y: 10, w: 4, h: 6,  minW: 3, minH: 4 },
  { id: "news",        type: "news-feed",   title: "News Feed",           i: "news",        x: 4, y: 10, w: 4, h: 6,  minW: 3, minH: 4 },
  { id: "earnings",    type: "earnings",    title: "Earnings",            i: "earnings",    x: 8, y: 10, w: 4, h: 6,  minW: 3, minH: 4 },
];

const OPTIONS_LAYOUT: WidgetConfig[] = [
  { id: "chart",         type: "candlestick",    title: "Price Chart",      i: "chart",         x: 0, y: 0,  w: 8, h: 10, minW: 5, minH: 10 },
  { id: "iv-rank",       type: "iv-rank",        title: "IV Rank",          i: "iv-rank",       x: 8, y: 0,  w: 4, h: 6,  minW: 3, minH: 6  },
  { id: "pcr",           type: "put-call-ratio",  title: "Put/Call Ratio",   i: "pcr",           x: 8, y: 6,  w: 4, h: 4,  minW: 3, minH: 6  },
  { id: "options-chain", type: "options-chain",  title: "Options Chain",    i: "options-chain", x: 0, y: 10, w: 8, h: 12, minW: 5, minH: 10 },
  { id: "max-pain",      type: "max-pain",       title: "Max Pain",         i: "max-pain",      x: 8, y: 10, w: 4, h: 6,  minW: 3, minH: 6  },
  { id: "prob-cone",     type: "prob-cone",      title: "Probability Cone", i: "prob-cone",     x: 8, y: 16, w: 4, h: 6,  minW: 3, minH: 6  },
];

const TECHNICAL_LAYOUT: WidgetConfig[] = [
  { id: "chart",     type: "candlestick",    title: "Price Chart",    i: "chart",     x: 0, y: 0,  w: 12, h: 12, minW: 5, minH: 10 },
  { id: "rsi",       type: "rsi",            title: "RSI",            i: "rsi",       x: 0, y: 12, w: 4,  h: 6,  minW: 3, minH: 4  },
  { id: "macd",      type: "macd",           title: "MACD",           i: "macd",      x: 4, y: 12, w: 4,  h: 6,  minW: 3, minH: 4  },
  { id: "bollinger", type: "bollinger",      title: "Bollinger Bands",i: "bollinger", x: 8, y: 12, w: 4,  h: 6,  minW: 3, minH: 4  },
  { id: "ema",       type: "ema",            title: "EMA Panel",      i: "ema",       x: 0, y: 18, w: 6,  h: 6,  minW: 3, minH: 4  },
  { id: "signal",    type: "signal-summary", title: "Signal Summary", i: "signal",    x: 6, y: 18, w: 6,  h: 6,  minW: 3, minH: 4  },
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
    {
      name: "investradar-layout",
      version: 1,
      migrate: (persisted: unknown, fromVersion: number) => {
        const state = persisted as Record<string, unknown>;
        // v0 → v1: rowHeight changed 60→30, so double all stored h/minH values
        if (fromVersion === 0) {
          const doubleH = (widgets: unknown[]) =>
            (widgets ?? []).map((w: unknown) => {
              const widget = w as Record<string, unknown>;
              return {
                ...widget,
                h: Math.round(((widget.h as number) ?? 3) * 2),
                minH: widget.minH != null ? Math.round(((widget.minH as number)) * 2) : undefined,
              };
            });
          return {
            ...state,
            widgets: doubleH((state.widgets as unknown[]) ?? []),
            customLayouts: ((state.customLayouts as unknown[]) ?? []).map((cl: unknown) => {
              const layout = cl as Record<string, unknown>;
              return { ...layout, widgets: doubleH((layout.widgets as unknown[]) ?? []) };
            }),
          };
        }
        return state;
      },
    }
  )
);
