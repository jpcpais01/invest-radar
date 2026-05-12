"use client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { NewsItem } from "@/types/market";
import { ExternalLink, Newspaper } from "lucide-react";

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
    <div className="rounded-2xl border border-[#21262d] bg-[#161b22] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#21262d]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#388bfd18] flex items-center justify-center">
            <Newspaper className="w-3.5 h-3.5 text-[#388bfd]" />
          </div>
          <span className="text-xs font-bold text-white">Latest News</span>
        </div>
        {articles.length > 0 && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[#3fb950]">{pos}↑</span>
            <span className="text-[#484f58]">{neu}→</span>
            <span className="text-[#f85149]">{neg}↓</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col divide-y divide-[#21262d] animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex flex-col gap-1.5">
              <div className="h-3 w-3/4 rounded bg-[#21262d]" />
              <div className="h-2.5 w-1/2 rounded bg-[#21262d]" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-xs text-[#484f58]">No news available</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#21262d]">
          {articles.slice(0, 8).map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 px-4 py-3 hover:bg-[#21262d] transition-colors"
            >
              {/* Sentiment dot */}
              <span className={cn("mt-1 w-1.5 h-1.5 rounded-full shrink-0", {
                "bg-[#3fb950]": a.sentiment === "positive",
                "bg-[#f85149]": a.sentiment === "negative",
                "bg-[#484f58]": a.sentiment === "neutral",
              })} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#e6edf3] group-hover:text-white leading-snug line-clamp-2 transition-colors">
                  {a.title}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-[#484f58]">
                  {a.source && <span>{a.source}</span>}
                  {a.publishedAt && (
                    <>
                      <span>·</span>
                      <span>{new Date(a.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </>
                  )}
                  <span className={cn("ml-auto capitalize font-medium", {
                    "text-[#3fb950]": a.sentiment === "positive",
                    "text-[#f85149]": a.sentiment === "negative",
                    "text-[#8b949e]": a.sentiment === "neutral",
                  })}>{a.sentiment}</span>
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-[#30363d] group-hover:text-[#484f58] shrink-0 mt-0.5 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
