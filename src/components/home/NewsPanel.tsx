"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { NewsItem } from "@/types/market";
import { ExternalLink } from "lucide-react";

interface Props { ticker: string }

export default function NewsPanel({ ticker }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["news", ticker],
    queryFn: async () => {
      const r = await fetch(`/api/market/news/${ticker}`);
      return r.json() as Promise<{ articles: NewsItem[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const articles = data?.articles ?? [];
  const pos = articles.filter(a => a.sentiment === "positive").length;
  const neg = articles.filter(a => a.sentiment === "negative").length;
  const neu = articles.length - pos - neg;

  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#101010] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2.5">
          <span className="text-[#c0c0cc] text-[8px]">◆</span>
          <span className="text-[11px] font-semibold text-[#f0f0f0] tracking-wide">News Feed</span>
        </div>
        {articles.length > 0 && (
          <div className="flex items-center gap-2.5 text-[10px]">
            <span className="text-[#c0c0cc]">{pos} pos</span>
            <span className="text-[#3a3a3a]">{neu} neu</span>
            <span className="text-[#ef4444]">{neg} neg</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col divide-y divide-[#1e1e1e] animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex flex-col gap-1.5">
              <div className="h-2.5 w-3/4 rounded bg-[#1e1e1e]" />
              <div className="h-2 w-1/2 rounded bg-[#1e1e1e]" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-[11px] text-[#3a3a3a]">No news available</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#1e1e1e]">
          {articles.slice(0, 8).map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 px-4 py-3 hover:bg-[#161616] transition-colors"
            >
              <span className={cn("mt-1.5 w-1 h-1 rounded-full shrink-0", {
                "bg-[#c0c0cc]": a.sentiment === "positive",
                "bg-[#ef4444]": a.sentiment === "negative",
                "bg-[#3a3a3a]": a.sentiment === "neutral",
              })} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#f0f0f0] group-hover:text-white leading-snug line-clamp-2 transition-colors">
                  {a.title}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-[#3a3a3a]">
                  {a.source && <span>{a.source}</span>}
                  {a.publishedAt && (
                    <><span>·</span><span>{new Date(a.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></>
                  )}
                  <span className={cn("ml-auto capitalize font-medium", {
                    "text-[#c0c0cc]": a.sentiment === "positive",
                    "text-[#ef4444]": a.sentiment === "negative",
                    "text-[#767676]": a.sentiment === "neutral",
                  })}>{a.sentiment}</span>
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-[#1e1e1e] group-hover:text-[#3a3a3a] shrink-0 mt-1 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
