"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Position {
  id: string;
  ticker: string;
  name?: string;
  shares: number;
  avgCost: number; // per share cost basis
}

interface PortfolioStore {
  positions: Position[];
  addPosition: (p: Omit<Position, "id">) => void;
  updatePosition: (id: string, updates: Partial<Omit<Position, "id">>) => void;
  removePosition: (id: string) => void;
}

export const usePortfolioStore = create<PortfolioStore>()(
  persist(
    (set) => ({
      positions: [],
      addPosition: (p) =>
        set((s) => ({
          positions: [...s.positions, { ...p, id: crypto.randomUUID() }],
        })),
      updatePosition: (id, updates) =>
        set((s) => ({
          positions: s.positions.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
      removePosition: (id) =>
        set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),
    }),
    { name: "investradar-portfolio" }
  )
);
