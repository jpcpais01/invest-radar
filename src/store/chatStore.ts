"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ChatMessage } from "@/types/ai";

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isStreaming: boolean;
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  appendToLastMessage: (chunk: string) => void;
  setStreaming: (v: boolean) => void;
  toggleOpen: () => void;
  clearHistory: () => void;
  prefillMessage: (text: string) => void;
  pendingPrefill: string | null;
  clearPrefill: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isOpen: true,
      isStreaming: false,
      pendingPrefill: null,
      addMessage: (msg) =>
        set((s) => ({ messages: [...s.messages, msg] })),
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
      prefillMessage: (text) => set({ pendingPrefill: text, isOpen: true }),
      clearPrefill: () => set({ pendingPrefill: null }),
    }),
    {
      name: "investradar-chat",
      partialize: (s) => ({ messages: s.messages.slice(-50), isOpen: s.isOpen }),
    }
  )
);
