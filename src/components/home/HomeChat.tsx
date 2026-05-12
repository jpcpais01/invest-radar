"use client";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { useAIChat } from "@/hooks/useAIChat";
import { cn } from "@/lib/utils";
import { Send, Square, Trash2 } from "lucide-react";
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
    <div className="rounded-lg border border-[#1e1e1e] bg-[#101010] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#1e1e1e] shrink-0">
        <span className="text-[#c0c0cc] text-[8px]">◆</span>
        <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">AI Assistant</span>
        <span className="text-[9px] text-[#3a3a3a] ml-0.5">{ticker}</span>
        <button
          onClick={clearHistory}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center text-[#3a3a3a] hover:text-[#ef4444] transition-colors"
          title="Clear history"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="overflow-y-auto px-4 py-3 flex flex-col gap-3"
        style={{ minHeight: 180, maxHeight: 380, scrollbarWidth: "thin", scrollbarColor: "#1e1e1e transparent" }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-[#3a3a3a] text-center py-2">Ask anything about {ticker}</p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-3 py-2 rounded-md border border-[#1e1e1e] text-[11px] text-[#767676] hover:text-[#f0f0f0] hover:border-[#2c2c2c] hover:bg-[#161616] transition-colors"
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
                <span className="text-[#c0c0cc] text-[8px] shrink-0 mt-1">◆</span>
              )}
              <div className={cn(
                "max-w-[88%] rounded-lg border px-3 py-2 text-xs leading-relaxed",
                msg.role === "user"
                  ? "bg-[#161616] border-[#2c2c2c] text-[#f0f0f0]"
                  : "bg-transparent border-[#1e1e1e] text-[#f0f0f0]"
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-xs max-w-none
                    [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                    [&_ul]:my-1 [&_ul]:pl-3 [&_li]:my-0.5
                    [&_ol]:my-1 [&_ol]:pl-3
                    [&_strong]:text-[#f0f0f0] [&_strong]:font-semibold
                    [&_code]:bg-[#161616] [&_code]:border [&_code]:border-[#1e1e1e] [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-[#c0c0cc]
                    [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:text-[#f0f0f0] [&_h3]:mt-2 [&_h3]:mb-1">
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
      <div className="px-4 py-3 border-t border-[#1e1e1e] shrink-0">
        <div className="flex items-end gap-2 rounded-md border border-[#1e1e1e] bg-[#080808] px-3 py-2 focus-within:border-[#2c2c2c] transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask about ${ticker}…`}
            rows={1}
            className="flex-1 bg-transparent text-xs text-[#f0f0f0] placeholder-[#3a3a3a] outline-none resize-none"
            style={{ maxHeight: 80 }}
          />
          {isStreaming ? (
            <button onClick={stop} className="w-6 h-6 rounded border border-[#ef444428] bg-[#ef44440a] flex items-center justify-center text-[#ef4444] hover:bg-[#ef444415] transition-colors shrink-0">
              <Square className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "w-6 h-6 rounded border flex items-center justify-center transition-colors shrink-0",
                input.trim()
                  ? "border-[#c0c0cc33] bg-[#c0c0cc0a] text-[#c0c0cc] hover:bg-[#c0c0cc18]"
                  : "border-[#1e1e1e] bg-transparent text-[#3a3a3a] cursor-not-allowed"
              )}
            >
              <Send className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="text-[9px] text-[#1e1e1e] mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
