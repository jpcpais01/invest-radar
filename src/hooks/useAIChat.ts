"use client";
import { useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChatStore } from "@/store/chatStore";
import { useTickerStore } from "@/store/tickerStore";
import { ChatMessage, ToolResult } from "@/types/ai";

function fmtMcap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

export function useAIChat() {
  const {
    messages, addMessage, updateLastMessage, appendToLastMessage,
    setStreaming, isStreaming,
    addActiveTool, removeActiveTool, clearActiveTools,
  } = useChatStore();
  const { activeTicker } = useTickerStore();
  const abortRef = useRef<AbortController | null>(null);

  // Cached quote — will hit React Query cache if PriceHero already fetched it
  const { data: quote } = useQuery<{
    ticker: string; name?: string; price: number;
    changePercent: number; marketCap?: number; sector?: string;
  }>({
    queryKey: ["quote", activeTicker],
    queryFn: () => fetch(`/api/market/quote/${encodeURIComponent(activeTicker)}`).then((r) => r.json()),
    staleTime: 30_000,
    enabled: !!activeTicker,
  });

  const sendMessage = useCallback(
    async (userText: string) => {
      if (isStreaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userText,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        toolCalls: [],
        toolResults: [],
        timestamp: Date.now(),
      };
      addMessage(assistantMsg);
      setStreaming(true);

      // Rich view context — the AI uses this to avoid redundant tool calls
      const lines: string[] = [`Ticker: ${activeTicker}${quote?.name ? ` (${quote.name})` : ""}`];
      if (quote?.price != null) {
        const sign = quote.changePercent >= 0 ? "+" : "";
        lines.push(`Current price: $${quote.price.toFixed(2)} (${sign}${quote.changePercent.toFixed(2)}% today)`);
      }
      if (quote?.marketCap) lines.push(`Market cap: ${fmtMcap(quote.marketCap)}`);
      lines.push(`Date: ${new Date().toISOString().split("T")[0]}`);
      const viewContext = lines.join("\n");

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
            ticker: activeTicker,
            viewContext,
          }),
          signal: abortRef.current.signal,
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "text_chunk") {
                appendToLastMessage(event.content);
              } else if (event.type === "retract_text") {
                updateLastMessage("");
              } else if (event.type === "text") {
                updateLastMessage(event.content);
              } else if (event.type === "trim") {
                useChatStore.setState((s) => {
                  const msgs = [...s.messages];
                  const last = { ...msgs[msgs.length - 1] };
                  last.content = last.content.slice(0, last.content.length - event.chars);
                  msgs[msgs.length - 1] = last;
                  return { messages: msgs };
                });
              } else if (event.type === "followups") {
                useChatStore.setState((s) => {
                  const msgs = [...s.messages];
                  const last = { ...msgs[msgs.length - 1] };
                  last.followups = event.questions;
                  msgs[msgs.length - 1] = last;
                  return { messages: msgs };
                });
              } else if (event.type === "tool_start") {
                addActiveTool(event.toolName, event.toolCallId);
              } else if (event.type === "tool_result") {
                removeActiveTool(event.toolCallId);
                const tr: ToolResult = {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  data: event.data,
                };
                useChatStore.setState((s) => {
                  const msgs = [...s.messages];
                  const last = { ...msgs[msgs.length - 1] };
                  last.toolResults = [...(last.toolResults ?? []), tr];
                  msgs[msgs.length - 1] = last;
                  return { messages: msgs };
                });
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          updateLastMessage("Sorry, I encountered an error. Please try again.");
        }
      } finally {
        clearActiveTools();
        setStreaming(false);
      }
    },
    [messages, activeTicker, quote, isStreaming, addMessage, updateLastMessage, appendToLastMessage, setStreaming, addActiveTool, removeActiveTool, clearActiveTools]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    clearActiveTools();
    setStreaming(false);
  }, [setStreaming, clearActiveTools]);

  return { sendMessage, stop, isStreaming };
}
