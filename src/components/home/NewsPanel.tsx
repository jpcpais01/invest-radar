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
    <div className="rounded border border-[#152b1e] bg-[#0a1610] overflow-hidden hover:border-[#1e4030] transition-colors">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#152b1e]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#00e87c] tracking-widest">// </span>
          <span className="font-mono text-[11px] font-bold text-[#c8edd8] tracking-wider">NEWS FEED</span>
        </div>
        {articles.length > 0 && (
          <div className="flex items-center gap-2 font-mono text-[9px]">
            <span className="text-[#00e87c]">{pos}↑</span>
            <span className="text-[#2d5040]">{neu}→</span>
            <span className="text-[#ff4545]">{neg}↓</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col divide-y divide-[#152b1e] animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex flex-col gap-1.5">
              <div className="h-2.5 w-3/4 rounded bg-[#152b1e]" />
              <div className="h-2 w-1/2 rounded bg-[#152b1e]" />
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="font-mono text-[10px] text-[#2d5040]">NO FEED DATA</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#152b1e]">
          {articles.slice(0, 8).map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 px-4 py-3 hover:bg-[#0f2218] transition-colors"
            >
              <span className={cn("mt-1 w-1.5 h-1.5 rounded-sm shrink-0", {
                "bg-[#00e87c]": a.sentiment === "positive",
                "bg-[#ff4545]": a.sentiment === "negative",
                "bg-[#2d5040]": a.sentiment === "neutral",
              })} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#c8edd8] group-hover:text-white leading-snug line-clamp-2 transition-colors">
                  {a.title}
                </p>
                <div className="flex items-center gap-2 mt-1 font-mono text-[9px] text-[#2d5040]">
                  {a.source && <span>{a.source}</span>}
                  {a.publishedAt && (
                    <>
                      <span>·</span>
                      <span>{new Date(a.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </>
                  )}
                  <span className={cn("ml-auto uppercase font-bold tracking-wide", {
                    "text-[#00e87c]": a.sentiment === "positive",
                    "text-[#ff4545]": a.sentiment === "negative",
                    "text-[#5a9e7a]": a.sentiment === "neutral",
                  })}>{a.sentiment}</span>
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-[#152b1e] group-hover:text-[#2d5040] shrink-0 mt-0.5 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
