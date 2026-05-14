"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WidgetConfig, PresetLayout } from "@/types/widgets";

const OVERVIEW_LAYOUT: WidgetConfig[] = [
  { id: "candlestick-1778720998541",       type: "candlestick",        title: "Price Chart",          i: "candlestick-1778720998541",       x: 0,  y: 0, w: 10, h: 8, minW: 1, minH: 1 },
  { id: "quality-score-1778721005237",     type: "quality-score",      title: "Quality Score",        i: "quality-score-1778721005237",     x: 10, y: 0, w: 4,  h: 8, minW: 1, minH: 1 },
  { id: "price-prediction-1778721007613",  type: "price-prediction",   title: "AI Price Prediction",  i: "price-prediction-1778721007613",  x: 14, y: 0, w: 10, h: 8, minW: 1, minH: 1 },
  { id: "key-metrics-1778721127101",       type: "key-metrics",        title: "Key Metrics",          i: "key-metrics-1778721127101",       x: 0,  y: 8, w: 4,  h: 8, minW: 1, minH: 1 },
  { id: "valuation-context-1778721042221", type: "valuation-context",  title: "Valuation Context",    i: "valuation-context-1778721042221", x: 4,  y: 8, w: 5,  h: 7, minW: 1, minH: 1 },
  { id: "conviction-tracker-1778721081253",type: "conviction-tracker", title: "Management Conviction",i: "conviction-tracker-1778721081253",x: 9,  y: 8, w: 5,  h: 7, minW: 1, minH: 1 },
  { id: "earnings-1778721033269",          type: "earnings",           title: "Earnings",             i: "earnings-1778721033269",          x: 14, y: 8, w: 5,  h: 7, minW: 1, minH: 1 },
  { id: "news-feed-1778721068149",         type: "news-feed",          title: "News Feed",            i: "news-feed-1778721068149",         x: 19, y: 8, w: 5,  h: 7, minW: 1, minH: 1 },
];

export const PRESET_LAYOUTS: Record<PresetLayout, WidgetConfig[]> = {
  overview: OVERVIEW_LAYOUT,
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
  locked: boolean;

  setLayout: (widgets: WidgetConfig[]) => void;
  applyPreset: (preset: PresetLayout) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (id: string) => void;
  setLocked: (v: boolean) => void;

  addCustomLayout: (name: string) => void;
  applyCustomLayout: (id: string) => void;
  removeCustomLayout: (id: string) => void;
  renameCustomLayout: (id: string, name: string) => void;
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
      locked: false,

      setLocked: (v) => set({ locked: v }),

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
          return { widgets, customLayouts: saveToCustom(s.customLayouts, s.activeCustomId, widgets) };
        }),

      removeWidget: (id) =>
        set((s) => {
          const widgets = s.widgets.filter((w) => w.id !== id);
          return { widgets, customLayouts: saveToCustom(s.customLayouts, s.activeCustomId, widgets) };
        }),

      addCustomLayout: (name) =>
        set((s) => {
          const id = `custom-${Date.now()}`;
          return {
            customLayouts: [...s.customLayouts, { id, name, widgets: [] }],
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
            ...(wasActive && { widgets: OVERVIEW_LAYOUT, activePreset: "overview", activeCustomId: null }),
          };
        }),

      renameCustomLayout: (id, name) =>
        set((s) => ({
          customLayouts: s.customLayouts.map((l) => l.id === id ? { ...l, name } : l),
        })),
    }),
    { name: "investradar-layout-v13" }
  )
);
