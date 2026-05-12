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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
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
    <div className="rounded-2xl border border-[#21262d] bg-[#161b22] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#21262d] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-purple-900/30">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-white">AI Assistant</p>
          <p className="text-[10px] text-[#484f58]">Ask anything about {ticker}</p>
        </div>
        <button
          onClick={clearHistory}
          className="w-6 h-6 rounded flex items-center justify-center text-[#484f58] hover:text-[#f85149] hover:bg-[#f8514918] transition-colors"
          title="Clear history"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ minHeight: 200, maxHeight: 400, scrollbarWidth: "thin", scrollbarColor: "#21262d transparent" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-[#484f58] text-center py-2">Ask a question to get started</p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-[#21262d] text-[11px] text-[#8b949e] hover:text-white hover:border-[#30363d] hover:bg-[#21262d] transition-colors"
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
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}
              <div className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                msg.role === "user"
                  ? "bg-[#1f6feb22] border border-[#388bfd33] text-white"
                  : "bg-[#21262d] border border-[#30363d] text-[#e6edf3]"
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-xs max-w-none
                    [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                    [&_ul]:my-1 [&_ul]:pl-3 [&_li]:my-0.5
                    [&_ol]:my-1 [&_ol]:pl-3
                    [&_strong]:text-white [&_strong]:font-semibold
                    [&_code]:bg-[#161b22] [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px]
                    [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:text-white [&_h3]:mt-2 [&_h3]:mb-1">
                    <ReactMarkdown>{msg.content || (isStreaming ? "▋" : "")}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#21262d] shrink-0">
        <div className="flex items-end gap-2 rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-2 focus-within:border-[#484f58] transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask about ${ticker}…`}
            rows={1}
            className="flex-1 bg-transparent text-xs text-white placeholder-[#484f58] outline-none resize-none"
            style={{ maxHeight: 80 }}
          />
          {isStreaming ? (
            <button
              onClick={stop}
              className="w-7 h-7 rounded-lg bg-[#f8514922] border border-[#f8514944] flex items-center justify-center text-[#f85149] hover:bg-[#f8514933] transition-colors shrink-0"
            >
              <Square className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0",
                input.trim()
                  ? "bg-[#a78bfa22] border border-[#a78bfa44] text-[#a78bfa] hover:bg-[#a78bfa33]"
                  : "bg-[#21262d] border border-[#21262d] text-[#484f58] cursor-not-allowed"
              )}
            >
              <Send className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="text-[9px] text-[#30363d] mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
