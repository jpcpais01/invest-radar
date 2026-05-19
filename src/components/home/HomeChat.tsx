"use client";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAIChat } from "@/hooks/useAIChat";
import { cn } from "@/lib/utils";
import { Send, Square, Trash2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Props { ticker: string }

const TOOL_LABELS: Record<string, string> = {
  get_price_data:           "Fetching price data",
  get_technical_indicators: "Computing technicals",
  get_fundamentals:         "Loading fundamentals",
  get_news_sentiment:       "Scanning news",
  get_earnings:             "Loading earnings",
  get_business_quality:     "Scoring business quality",
  get_narrative:            "Analyzing narrative",
  get_insider_activity:     "Checking insider activity",
  get_fair_value:           "Computing fair value",
  get_dcf_valuation:        "Running DCF model",
  get_technical_heatmap:    "Building signal heatmap",
};

export default function HomeChat({ ticker }: Props) {
  const {
    messages, isStreaming, clearHistory, pendingPrefill, clearPrefill,
    activeChatTicker, setActiveChatTicker, activeTools,
  } = useChatStore();
  const { sendMessage, stop } = useAIChat();
  const [input, setInput] = useState("");
  const msgsRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scope history to active ticker — clear when user switches stocks
  useEffect(() => {
    if (activeChatTicker && activeChatTicker !== ticker) clearHistory();
    setActiveChatTicker(ticker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Scroll messages container (not the page) on new messages
  useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, activeTools]);

  // Prefill from external triggers (e.g. signal card "Ask AI" buttons)
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
    <>
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes chatBlob1 {
        0%   { transform: translate(0%,   10%)  scale(1.00); opacity: 0.45; }
        20%  { transform: translate(70%, -40%)  scale(1.20); opacity: 0.70; }
        45%  { transform: translate(110%, 55%)  scale(0.85); opacity: 0.30; }
        70%  { transform: translate(15%,  85%)  scale(1.10); opacity: 0.55; }
        100% { transform: translate(0%,   10%)  scale(1.00); opacity: 0.45; }
      }
      @keyframes chatBlob2 {
        0%   { transform: translate(100%, -5%)  scale(0.90); opacity: 0.28; }
        30%  { transform: translate(10%, -65%)  scale(1.15); opacity: 0.50; }
        60%  { transform: translate(60%,  75%)  scale(1.00); opacity: 0.35; }
        100% { transform: translate(100%, -5%)  scale(0.90); opacity: 0.28; }
      }
      @keyframes chatGlow {
        0%, 100% { opacity: 0.40; }
        50%       { opacity: 0.75; }
      }
      @keyframes toolPulse {
        0%, 100% { opacity: 0.4; }
        50%       { opacity: 1; }
      }
    ` }} />
    <div
      className="overflow-hidden flex flex-col relative"
      style={{
        background: "linear-gradient(160deg, rgba(4,6,22,0.97) 0%, rgba(8,11,32,0.97) 100%)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(96,165,250,0.18)",
        borderRadius: 12,
        boxShadow: "0 0 40px rgba(37,99,235,0.12), inset 0 1px 0 rgba(147,197,253,0.08)",
      }}
    >
      {/* Animated glass blobs */}
      <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          position: "absolute", width: "55%", height: "60%", top: "-10%", left: "-5%",
          background: "radial-gradient(ellipse at center, rgba(147,210,255,0.20) 0%, rgba(99,179,255,0.07) 45%, transparent 70%)",
          animation: "chatBlob1 6s ease-in-out infinite", filter: "blur(18px)",
        }} />
        <div style={{
          position: "absolute", width: "48%", height: "55%", top: "5%", left: "20%",
          background: "radial-gradient(ellipse at center, rgba(192,168,255,0.14) 0%, rgba(139,120,255,0.05) 45%, transparent 70%)",
          animation: "chatBlob2 9s ease-in-out infinite", filter: "blur(16px)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 30%, rgba(37,99,235,0.08) 0%, transparent 65%)",
          animation: "chatGlow 5s ease-in-out infinite",
        }} />
      </div>

      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
        style={{ background: "rgba(37,99,235,0.08)", borderBottom: "1px solid rgba(96,165,250,0.12)" }}
      >
        <Sparkles className="w-3 h-3 shrink-0" style={{ color: "#93c5fd", filter: "drop-shadow(0 0 4px rgba(147,197,253,0.6))" }} />
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: "#93c5fd" }}>AI Assistant</span>
        <span className="text-[9px] ml-0.5" style={{ color: "rgba(96,165,250,0.35)" }}>{ticker}</span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearHistory(); }}
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
        ref={msgsRef}
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
                  style={{ border: "1px solid rgba(96,165,250,0.12)", background: "rgba(37,99,235,0.05)", color: "rgba(147,197,253,0.55)" }}
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
          messages.map((msg, idx) => {
            const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1;
            const showToolIndicators = isLastAssistant && isStreaming && !msg.content && activeTools.length > 0;
            const showCursor = isLastAssistant && isStreaming && !msg.content && activeTools.length === 0;

            return (
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
                    showToolIndicators ? (
                      /* Live tool call indicators */
                      <div className="flex flex-col gap-1.5 py-0.5">
                        {activeTools.map(t => (
                          <div key={t.callId} className="flex items-center gap-2">
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: "rgba(96,165,250,0.6)", animation: "toolPulse 1.2s ease-in-out infinite" }}
                            />
                            <span className="text-[10px]" style={{ color: "rgba(147,197,253,0.6)" }}>
                              {TOOL_LABELS[t.name] ?? t.name}…
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : showCursor ? (
                      <span style={{ color: "rgba(96,165,250,0.4)" }}>▋</span>
                    ) : (
                      <div
                        className="prose prose-invert prose-xs max-w-none
                          [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                          [&_ul]:my-1 [&_ul]:pl-3 [&_li]:my-0.5
                          [&_ol]:my-1 [&_ol]:pl-3
                          [&_strong]:font-semibold
                          [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[10px]
                          [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1"
                        style={{ "--tw-prose-body": "rgba(220,228,255,0.85)", "--tw-prose-bold": "#93c5fd", "--tw-prose-code": "#93c5fd" } as React.CSSProperties}
                      >
                        <ReactMarkdown>{msg.content || (isStreaming && isLastAssistant ? "▋" : "")}</ReactMarkdown>
                      </div>
                    )
                  ) : msg.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(96,165,250,0.10)" }}>
        <div
          className="flex items-end gap-2 rounded-md px-3 py-2 transition-all"
          style={{ background: "rgba(15,23,42,0.70)", border: "1px solid rgba(96,165,250,0.14)" }}
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
            style={{ maxHeight: 80, color: "#e2e8ff" }}
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
    </>
  );
}
