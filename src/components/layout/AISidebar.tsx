"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Square, X, Trash2, ChevronRight, Bot, Sparkles, TrendingUp, BarChart2, Newspaper } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { useAIChat } from "@/hooks/useAIChat";
import { ChatMessage, ToolResult } from "@/types/ai";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const TOOL_META: Record<string, { label: string; icon: string }> = {
  get_price_data:          { label: "Price Data",           icon: "📈" },
  get_technical_indicators:{ label: "Technicals",           icon: "📊" },
  get_fundamentals:        { label: "Fundamentals",         icon: "🏦" },
  get_news_sentiment:      { label: "News & Sentiment",     icon: "📰" },
  get_earnings:            { label: "Earnings",             icon: "📅" },
};

const STARTERS = [
  { icon: TrendingUp,  text: "Is AAPL overbought right now?" },
  { icon: BarChart2,   text: "Analyze NVDA's fundamentals" },
  { icon: Newspaper,   text: "What's the market sentiment for TSLA?" },
];

function ToolResultCard({ result }: { result: ToolResult }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[result.toolName] ?? { label: result.toolName, icon: "🔧" };

  return (
    <div className="my-1 rounded-lg border border-[#1f6feb22] bg-[#1f6feb08] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1f6feb10] transition-colors"
      >
        <span className="text-sm leading-none">{meta.icon}</span>
        <span className="text-[11px] text-[#388bfd] font-medium flex-1">{meta.label}</span>
        <ChevronRight className={cn("w-3 h-3 text-[#388bfd] transition-transform duration-200", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 border-t border-[#1f6feb15]">
          <pre className="text-[10px] text-[#8b949e] overflow-x-auto whitespace-pre-wrap break-words mt-2 leading-relaxed font-mono">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[#388bfd] animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "800ms" }}
        />
      ))}
    </div>
  );
}

function Message({ msg, isLast, isStreaming }: { msg: ChatMessage; isLast: boolean; isStreaming: boolean }) {
  const isUser = msg.role === "user";
  const showTyping = isLast && isStreaming && !isUser && !msg.content && !msg.toolResults?.length;

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-[#1f6feb] text-white text-[12px] leading-relaxed shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Tool results */}
      {msg.toolResults && msg.toolResults.length > 0 && (
        <div className="mb-2">
          {msg.toolResults.map((tr, i) => (
            <ToolResultCard key={i} result={tr} />
          ))}
        </div>
      )}

      {/* AI response */}
      {showTyping && <TypingDots />}

      {msg.content && (
        <div className="text-[12px] text-[#c9d1d9] leading-relaxed prose prose-invert prose-xs max-w-none">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li className="text-[#c9d1d9]">{children}</li>,
              strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
              h3: ({ children }) => <h3 className="text-white font-semibold text-[12px] mb-1 mt-2">{children}</h3>,
              code: ({ children }) => (
                <code className="bg-[#161b22] text-[#58a6ff] px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#30363d]">{children}</code>
              ),
              hr: () => <hr className="border-[#21262d] my-2" />,
            }}
          >
            {msg.content}
          </ReactMarkdown>
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
        className="w-9 shrink-0 flex flex-col items-center justify-center border-l border-[#21262d] bg-[#0d1117] text-[#484f58] hover:text-[#388bfd] transition-colors gap-1"
      >
        <Bot className="w-4 h-4" />
        <span className="text-[9px] font-bold tracking-widest [writing-mode:vertical-lr] rotate-180 mt-1">AI</span>
      </button>
    );
  }

  return (
    <div className="w-[340px] shrink-0 flex flex-col border-l border-[#21262d] bg-[#080c12] relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#1f6feb0a] to-transparent pointer-events-none z-0" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-[#161b22]">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1f6feb] to-[#388bfd] flex items-center justify-center shadow-lg shadow-[#1f6feb22]">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            {isStreaming && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#3fb950] border border-[#080c12] animate-pulse" />
            )}
          </div>
          <div>
            <div className="text-[12px] font-semibold text-white leading-tight">InvestRadar AI</div>
            <div className="text-[10px] text-[#484f58] leading-tight">
              {isStreaming ? (
                <span className="text-[#388bfd]">Thinking…</span>
              ) : (
                "Kimi K2 · Live data"
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={clearHistory}
            title="Clear chat"
            className="p-1.5 rounded-lg text-[#484f58] hover:text-[#8b949e] hover:bg-[#161b22] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleOpen}
            className="p-1.5 rounded-lg text-[#484f58] hover:text-[#8b949e] hover:bg-[#161b22] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1f6feb] to-[#58a6ff] flex items-center justify-center mb-4 shadow-xl shadow-[#1f6feb30]">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <p className="text-[13px] font-medium text-white mb-1">Ask me anything</p>
            <p className="text-[11px] text-[#484f58] leading-relaxed mb-6 max-w-[220px]">
              I can fetch live market data, analyze technicals, fundamentals, and news in real time.
            </p>
            <div className="w-full flex flex-col gap-2">
              {STARTERS.map(({ icon: Icon, text }) => (
                <button
                  key={text}
                  onClick={() => sendMessage(text)}
                  className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-xl bg-[#0d1117] border border-[#21262d] text-[11px] text-[#8b949e] hover:text-white hover:border-[#388bfd33] hover:bg-[#161b22] transition-all group"
                >
                  <Icon className="w-3.5 h-3.5 text-[#388bfd] shrink-0" />
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message
            key={msg.id}
            msg={msg}
            isLast={i === messages.length - 1}
            isStreaming={isStreaming}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 p-3 border-t border-[#161b22] bg-[#080c12]">
        <div className={cn(
          "flex items-end gap-2 rounded-xl border px-3 py-2.5 transition-all duration-200",
          input.trim() || isStreaming
            ? "bg-[#0d1117] border-[#1f6feb44] shadow-lg shadow-[#1f6feb10]"
            : "bg-[#0d1117] border-[#21262d]"
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about any stock…"
            rows={1}
            className="flex-1 bg-transparent text-[12px] text-white placeholder-[#484f58] resize-none outline-none leading-relaxed max-h-28"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={isStreaming ? stop : handleSend}
            disabled={!input.trim() && !isStreaming}
            className={cn(
              "p-1.5 rounded-lg transition-all duration-200 shrink-0 mb-0.5",
              isStreaming
                ? "bg-[#f8514922] text-[#f85149] hover:bg-[#f8514933]"
                : input.trim()
                ? "bg-[#1f6feb] text-white hover:bg-[#388bfd] shadow-md shadow-[#1f6feb33]"
                : "text-[#30363d] cursor-not-allowed"
            )}
          >
            {isStreaming ? <Square className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-[#30363d] mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
