"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TickerState {
  activeTicker: string;
  watchlist: string[];
  activeTimeframe: string;
  setActiveTicker: (ticker: string) => void;
  addToWatchlist: (ticker: string) => void;
  removeFromWatchlist: (ticker: string) => void;
  setActiveTimeframe: (tf: string) => void;
}

export const useTickerStore = create<TickerState>()(
  persist(
    (set) => ({
      activeTicker: "AAPL",
      watchlist: ["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "MSFT"],
      activeTimeframe: "3M",
      setActiveTicker: (ticker) => set({ activeTicker: ticker.toUpperCase() }),
      addToWatchlist: (ticker) =>
        set((s) => ({
          watchlist: s.watchlist.includes(ticker.toUpperCase())
            ? s.watchlist
            : [...s.watchlist, ticker.toUpperCase()],
        })),
      removeFromWatchlist: (ticker) =>
        set((s) => ({
          watchlist: s.watchlist.filter((t) => t !== ticker.toUpperCase()),
        })),
      setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),
    }),
    { name: "investradar-tickers" }
  )
);
