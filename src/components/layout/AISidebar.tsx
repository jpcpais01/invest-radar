"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Square, X, Trash2, ChevronRight } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { useAIChat } from "@/hooks/useAIChat";
import { ChatMessage, ToolResult } from "@/types/ai";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const TOOL_LABELS: Record<string, string> = {
  get_price_data: "Price Data",
  get_technical_indicators: "Technical Indicators",
  get_fundamentals: "Fundamentals",
  get_news_sentiment: "News Sentiment",
  get_earnings: "Earnings Data",
};

function ToolResultCard({ result }: { result: ToolResult }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[result.toolName] ?? result.toolName;

  return (
    <div className="my-1.5 rounded-md border border-[#1f6feb44] bg-[#1f6feb11] text-[11px]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#1f6feb] shrink-0" />
        <span className="text-[#388bfd] font-medium">{label}</span>
        <ChevronRight className={cn("w-3 h-3 text-[#8b949e] ml-auto transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 border-t border-[#1f6feb22]">
          <pre className="text-[#8b949e] overflow-x-auto whitespace-pre-wrap break-words mt-1.5 text-[10px] leading-relaxed">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Message({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("mb-4", isUser ? "flex justify-end" : "")}>
      {isUser ? (
        <div className="max-w-[85%] px-3 py-2 rounded-xl bg-[#1f6feb] text-white text-xs leading-relaxed">
          {msg.content}
        </div>
      ) : (
        <div className="max-w-full">
          {/* Tool results inline */}
          {msg.toolResults && msg.toolResults.length > 0 && (
            <div className="mb-2">
              {msg.toolResults.map((tr, i) => (
                <ToolResultCard key={i} result={tr} />
              ))}
            </div>
          )}
          {/* Prose response */}
          {msg.content && (
            <div className="text-xs text-[#e6edf3] leading-relaxed prose prose-invert prose-xs max-w-none">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                  li: ({ children }) => <li className="text-[#e6edf3]">{children}</li>,
                  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                  code: ({ children }) => (
                    <code className="bg-[#21262d] text-[#388bfd] px-1 py-0.5 rounded text-[10px] font-mono">{children}</code>
                  ),
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          )}
          {!msg.content && !msg.toolResults?.length && (
            <div className="flex items-center gap-1 text-[#8b949e] text-xs">
              <div className="w-1 h-1 rounded-full bg-[#8b949e] animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-[#8b949e] animate-pulse delay-150" />
              <div className="w-1 h-1 rounded-full bg-[#8b949e] animate-pulse delay-300" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AISidebar() {
  const { messages, isOpen, isStreaming, toggleOpen, clearHistory, pendingPrefill, clearPrefill } =
    useChatStore();
  const { sendMessage, stop } = useAIChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (pendingPrefill) {
      setInput(pendingPrefill);
      clearPrefill();
      inputRef.current?.focus();
    }
  }, [pendingPrefill, clearPrefill]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={toggleOpen}
        className="w-9 shrink-0 flex flex-col items-center justify-center border-l border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors gap-1"
      >
        <span className="text-[10px] font-bold tracking-widest [writing-mode:vertical-lr] rotate-180">AI Chat</span>
      </button>
    );
  }

  return (
    <div className="w-[360px] shrink-0 flex flex-col border-l border-[#30363d] bg-[#161b22]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#1f6feb] animate-pulse" />
          <span className="text-xs font-semibold text-white">InvestRadar AI</span>
          <span className="text-[10px] text-[#8b949e]">Kimi K2</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            title="Clear chat"
            className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleOpen}
            className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">📈</div>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Ask me anything about stocks, options, technicals, or fundamentals. I can fetch live data and analyze it for you.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {[
                "Is AAPL overbought right now?",
                "Analyze NVDA's fundamentals",
                "What's the market sentiment for TSLA?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-[11px] text-left px-2.5 py-1.5 rounded bg-[#21262d] text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#30363d] p-3">
        <div className="flex items-end gap-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 focus-within:border-[#1f6feb] transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about any stock..."
            rows={1}
            className="flex-1 bg-transparent text-xs text-white placeholder-[#8b949e] resize-none outline-none leading-relaxed max-h-24"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={isStreaming ? stop : handleSend}
            disabled={!input.trim() && !isStreaming}
            className={cn(
              "p-1 rounded transition-colors shrink-0",
              isStreaming
                ? "text-[#f85149] hover:bg-[#f8514922]"
                : input.trim()
                ? "text-[#388bfd] hover:bg-[#1f6feb22]"
                : "text-[#8b949e] opacity-50 cursor-not-allowed"
            )}
          >
            {isStreaming ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-[#8b949e] mt-1.5 text-center">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
