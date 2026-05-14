"use client";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAIChat } from "@/hooks/useAIChat";
import { cn } from "@/lib/utils";
import { Send, Square, Trash2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Props { ticker: string }

export default function HomeChat({ ticker }: Props) {
  const { messages, isStreaming, clearHistory, pendingPrefill, clearPrefill } = useChatStore();
  const { sendMessage, stop } = useAIChat();
  const [input, setInput] = useState("");
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!pendingPrefill) return;
    setInput(pendingPrefill);
    clearPrefill();
    inputRef.current?.focus();
  }, [pendingPrefill, clearPrefill]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const SUGGESTIONS = [
    `What's the technical outlook for ${ticker}?`,
    `Is ${ticker} a good buy right now?`,
    `What are the key risks for ${ticker}?`,
  ];

  return (
    <div
      className="overflow-hidden flex flex-col"
      style={{
        background: "linear-gradient(160deg, rgba(6,8,28,0.97) 0%, rgba(10,14,38,0.97) 100%)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(96,165,250,0.18)",
        borderRadius: 12,
        boxShadow: "0 0 40px rgba(37,99,235,0.10), inset 0 1px 0 rgba(147,197,253,0.08)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
        style={{
          background: "rgba(37,99,235,0.08)",
          borderBottom: "1px solid rgba(96,165,250,0.12)",
        }}
      >
        <Sparkles className="w-3 h-3 shrink-0" style={{ color: "#93c5fd", filter: "drop-shadow(0 0 4px rgba(147,197,253,0.6))" }} />
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: "#93c5fd" }}>AI Assistant</span>
        <span className="text-[9px] ml-0.5" style={{ color: "rgba(96,165,250,0.35)" }}>{ticker}</span>
        <button
          onClick={clearHistory}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center transition-colors"
          style={{ color: "rgba(96,165,250,0.25)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(239,68,68,0.7)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(96,165,250,0.25)")}
          title="Clear history"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="overflow-y-auto px-4 py-3 flex flex-col gap-3"
        style={{
          minHeight: 180, maxHeight: 380,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(96,165,250,0.15) transparent",
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-center py-2" style={{ color: "rgba(96,165,250,0.35)" }}>
              Ask anything about {ticker}
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-3 py-2 rounded-md text-[11px] transition-all"
                  style={{
                    border: "1px solid rgba(96,165,250,0.12)",
                    background: "rgba(37,99,235,0.05)",
                    color: "rgba(147,197,253,0.55)",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(96,165,250,0.28)";
                    (e.currentTarget as HTMLButtonElement).style.background  = "rgba(37,99,235,0.12)";
                    (e.currentTarget as HTMLButtonElement).style.color       = "rgba(147,197,253,0.90)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(96,165,250,0.12)";
                    (e.currentTarget as HTMLButtonElement).style.background  = "rgba(37,99,235,0.05)";
                    (e.currentTarget as HTMLButtonElement).style.color       = "rgba(147,197,253,0.55)";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <Sparkles className="w-3 h-3 shrink-0 mt-1" style={{ color: "rgba(147,197,253,0.5)" }} />
              )}
              <div
                className="max-w-[88%] rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={msg.role === "user" ? {
                  background: "rgba(37,99,235,0.18)",
                  border: "1px solid rgba(96,165,250,0.22)",
                  color: "#e0e8ff",
                } : {
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(96,165,250,0.10)",
                  color: "rgba(220,228,255,0.85)",
                }}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-xs max-w-none
                    [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                    [&_ul]:my-1 [&_ul]:pl-3 [&_li]:my-0.5
                    [&_ol]:my-1 [&_ol]:pl-3
                    [&_strong]:font-semibold
                    [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[10px]
                    [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1"
                    style={{ "--tw-prose-body": "rgba(220,228,255,0.85)", "--tw-prose-bold": "#93c5fd", "--tw-prose-code": "#93c5fd" } as React.CSSProperties}
                  >
                    <ReactMarkdown>{msg.content || (isStreaming ? "▋" : "")}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: "1px solid rgba(96,165,250,0.10)" }}
      >
        <div
          className="flex items-end gap-2 rounded-md px-3 py-2 transition-all"
          style={{
            background: "rgba(15,23,42,0.70)",
            border: "1px solid rgba(96,165,250,0.14)",
          }}
          onFocusCapture={e => (e.currentTarget.style.borderColor = "rgba(96,165,250,0.32)")}
          onBlurCapture={e  => (e.currentTarget.style.borderColor = "rgba(96,165,250,0.14)")}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask about ${ticker}…`}
            rows={1}
            className="flex-1 bg-transparent text-xs outline-none resize-none"
            style={{
              maxHeight: 80,
              color: "#e2e8ff",
            }}
          />
          {isStreaming ? (
            <button
              onClick={stop}
              className="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors"
              style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
            >
              <Square className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-6 h-6 rounded flex items-center justify-center shrink-0 transition-all"
              style={input.trim() ? {
                border: "1px solid rgba(96,165,250,0.35)",
                background: "rgba(37,99,235,0.18)",
                color: "#93c5fd",
              } : {
                border: "1px solid rgba(96,165,250,0.08)",
                background: "transparent",
                color: "rgba(96,165,250,0.20)",
                cursor: "not-allowed",
              }}
            >
              <Send className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="text-[9px] mt-1.5 text-center" style={{ color: "rgba(96,165,250,0.18)" }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
