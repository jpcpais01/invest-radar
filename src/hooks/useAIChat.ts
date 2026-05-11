"use client";
import { useRef, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import { useTickerStore } from "@/store/tickerStore";
import { ChatMessage, ToolResult } from "@/types/ai";

export function useAIChat() {
  const { messages, addMessage, updateLastMessage, appendToLastMessage, setStreaming, isStreaming } = useChatStore();
  const { activeTicker } = useTickerStore();
  const abortRef = useRef<AbortController | null>(null);

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

      const viewContext = `Ticker: ${activeTicker}`;

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMsg].map((m) => ({
              role: m.role,
              content: m.content,
            })),
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
                // Model called tools after streaming some text — clear the partial content
                updateLastMessage("");
              } else if (event.type === "text") {
                // Safety-net fallback: full content in one event
                updateLastMessage(event.content);
              } else if (event.type === "tool_result") {
                const tr: ToolResult = {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  data: event.data,
                };
                // Append tool result to the last message in store
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
        setStreaming(false);
      }
    },
    [messages, activeTicker, isStreaming, addMessage, updateLastMessage, appendToLastMessage, setStreaming]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  return { sendMessage, stop, isStreaming };
}
