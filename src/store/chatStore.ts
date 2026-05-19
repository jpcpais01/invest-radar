"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ChatMessage, ToolResult } from "@/types/ai";

export interface ActiveTool { name: string; callId: string }

interface ChatState {
  messages: ChatMessage[];
  activeChatTicker: string;
  isOpen: boolean;
  isStreaming: boolean;
  activeTools: ActiveTool[];
  pendingPrefill: string | null;
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  appendToLastMessage: (chunk: string) => void;
  setStreaming: (v: boolean) => void;
  toggleOpen: () => void;
  clearHistory: () => void;
  setActiveChatTicker: (ticker: string) => void;
  addActiveTool: (name: string, callId: string) => void;
  removeActiveTool: (callId: string) => void;
  clearActiveTools: () => void;
  prefillMessage: (text: string) => void;
  clearPrefill: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      activeChatTicker: "",
      isOpen: true,
      isStreaming: false,
      activeTools: [],
      pendingPrefill: null,

      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      updateLastMessage: (content) =>
        set((s) => {
          const msgs = [...s.messages];
          if (msgs.length > 0) msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
          return { messages: msgs };
        }),
      appendToLastMessage: (chunk) =>
        set((s) => {
          const msgs = [...s.messages];
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            msgs[msgs.length - 1] = { ...last, content: (last.content ?? "") + chunk };
          }
          return { messages: msgs };
        }),

      setStreaming: (v) => set({ isStreaming: v }),
      toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
      clearHistory: () => set({ messages: [] }),
      setActiveChatTicker: (ticker) => set({ activeChatTicker: ticker }),

      addActiveTool: (name, callId) =>
        set((s) => ({ activeTools: [...s.activeTools, { name, callId }] })),
      removeActiveTool: (callId) =>
        set((s) => ({ activeTools: s.activeTools.filter((t) => t.callId !== callId) })),
      clearActiveTools: () => set({ activeTools: [] }),

      prefillMessage: (text) => set({ pendingPrefill: text, isOpen: true }),
      clearPrefill: () => set({ pendingPrefill: null }),
    }),
    {
      name: "investradar-chat",
      partialize: (s) => ({
        messages: s.messages.slice(-50),
        isOpen: s.isOpen,
        activeChatTicker: s.activeChatTicker,
      }),
    }
  )
);
