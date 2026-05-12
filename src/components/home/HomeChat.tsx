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
    <div className="rounded border border-[#152b1e] bg-[#0a1610] overflow-hidden flex flex-col hover:border-[#1e4030] transition-colors">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#152b1e] shrink-0">
        <span className="font-mono text-[10px] text-[#b87dff] tracking-widest">// </span>
        <span className="font-mono text-[11px] font-bold text-[#c8edd8] tracking-wider">AI ASSISTANT</span>
        <span className="font-mono text-[9px] text-[#2d5040] ml-1">[{ticker}]</span>
        <button
          onClick={clearHistory}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center text-[#2d5040] hover:text-[#ff4545] transition-colors"
          title="Clear history"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="overflow-y-auto px-4 py-3 flex flex-col gap-3"
        style={{ minHeight: 180, maxHeight: 380, scrollbarWidth: "thin", scrollbarColor: "#152b1e transparent" }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[9px] text-[#2d5040] text-center py-2 tracking-widest uppercase">— awaiting input —</p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-3 py-2 rounded border border-[#152b1e] font-mono text-[11px] text-[#5a9e7a] hover:text-[#c8edd8] hover:border-[#1e4030] hover:bg-[#0f2218] transition-colors"
                >
                  <span className="text-[#2d5040]">&gt; </span>{q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "assistant" && (
                <span className="font-mono text-[10px] text-[#b87dff] shrink-0 mt-0.5 leading-relaxed">AI&gt;</span>
              )}
              <div className={cn(
                "max-w-[88%] rounded border px-3 py-2 text-xs leading-relaxed",
                msg.role === "user"
                  ? "bg-[#00e87c0a] border-[#00e87c22] text-[#c8edd8] font-mono"
                  : "bg-[#0f2218] border-[#152b1e] text-[#c8edd8]"
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-xs max-w-none
                    [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                    [&_ul]:my-1 [&_ul]:pl-3 [&_li]:my-0.5
                    [&_ol]:my-1 [&_ol]:pl-3
                    [&_strong]:text-[#c8edd8] [&_strong]:font-semibold
                    [&_code]:bg-[#0a1610] [&_code]:border [&_code]:border-[#152b1e] [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[10px] [&_code]:text-[#00e87c]
                    [&_h3]:font-mono [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:text-[#c8edd8] [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:tracking-wider [&_h3]:uppercase">
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
      <div className="px-4 py-3 border-t border-[#152b1e] shrink-0">
        <div className="flex items-end gap-2 rounded border border-[#152b1e] bg-[#060d09] px-3 py-2 focus-within:border-[#1e4030] transition-colors">
          <span className="font-mono text-[10px] text-[#2d5040] shrink-0 mb-0.5">&gt;</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`query ${ticker}…`}
            rows={1}
            className="flex-1 bg-transparent font-mono text-xs text-[#c8edd8] placeholder-[#2d5040] outline-none resize-none"
            style={{ maxHeight: 80 }}
          />
          {isStreaming ? (
            <button
              onClick={stop}
              className="w-6 h-6 rounded border border-[#ff454530] bg-[#ff45450a] flex items-center justify-center text-[#ff4545] hover:bg-[#ff454518] transition-colors shrink-0"
            >
              <Square className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "w-6 h-6 rounded border flex items-center justify-center transition-colors shrink-0",
                input.trim()
                  ? "border-[#00e87c33] bg-[#00e87c0a] text-[#00e87c] hover:bg-[#00e87c18]"
                  : "border-[#152b1e] bg-transparent text-[#2d5040] cursor-not-allowed"
              )}
            >
              <Send className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="font-mono text-[8px] text-[#152b1e] mt-1.5 text-center tracking-widest">ENTER TO SEND · SHIFT+ENTER FOR NEWLINE</p>
      </div>
    </div>
  );
}
