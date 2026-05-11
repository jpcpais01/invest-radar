"use client";
import { ReactNode, useState } from "react";
import { X, MessageSquare, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chatStore";

interface Props {
  title: string;
  id: string;
  onRemove?: (id: string) => void;
  onRefresh?: () => void;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  askAIContext?: string;
  className?: string;
}

export default function WidgetShell({
  title,
  id,
  onRemove,
  onRefresh,
  children,
  loading,
  error,
  askAIContext,
  className,
}: Props) {
  const { prefillMessage } = useChatStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleAskAI = () => {
    if (askAIContext) prefillMessage(askAIContext);
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[#0d1117] border border-[#21262d] rounded-xl overflow-hidden group",
        className
      )}
    >
      {/* Header — also acts as the drag handle for react-grid-layout */}
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 border-b border-[#161b22] shrink-0 cursor-grab active:cursor-grabbing select-none bg-[#0d1117]">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            loading ? "bg-yellow-400 animate-pulse" : error ? "bg-[#f85149]" : "bg-[#238636]"
          )} />
          <span className="text-[11px] font-medium text-[#8b949e] tracking-wide">{title}</span>
        </div>
        <div
          className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {askAIContext && (
            <button
              onClick={handleAskAI}
              title="Ask AI about this"
              className="p-1 rounded text-[#8b949e] hover:text-[#388bfd] hover:bg-[#1f6feb22] transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}
          {onRefresh && (
            <button
              onClick={handleRefresh}
              className="p-1 rounded text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(id)}
              className="p-1 rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#f8514922] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body — stopPropagation prevents react-draggable from starting drag inside widget content */}
      <div
        className="widget-body flex-1 overflow-hidden relative flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#161b22]/70">
            <div className="w-5 h-5 border-2 border-[#30363d] border-t-[#1f6feb] rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4 z-10">
            <p className="text-xs text-[#f85149] text-center">{error}</p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
