"use client";
import { useQuery } from "@tanstack/react-query";
import WidgetShell from "@/components/widgets/_base/WidgetShell";
import { useLayoutStore } from "@/store/layoutStore";
import { NewsItem } from "@/types/market";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

interface Props { ticker: string; id: string }

function SentimentBadge({ sentiment }: { sentiment: NewsItem["sentiment"] }) {
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", {
      "bg-[#3fb95022] text-[#3fb950]": sentiment === "positive",
      "bg-[#f8514922] text-[#f85149]": sentiment === "negative",
      "bg-[#21262d] text-[#8b949e]": sentiment === "neutral",
    })}>
      {sentiment}
    </span>
  );
}

export default function NewsFeed({ ticker, id }: Props) {
  const { removeWidget } = useLayoutStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["news", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/market/news/${ticker}`);
      return res.json() as Promise<{ articles: NewsItem[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const articles = data?.articles ?? [];
  const pos = articles.filter((a) => a.sentiment === "positive").length;
  const neg = articles.filter((a) => a.sentiment === "negative").length;
  const overall = pos > neg ? "positive" : neg > pos ? "negative" : "neutral";

  const askAI = articles.length > 0
    ? `Recent news sentiment for ${ticker}: ${pos} positive, ${neg} negative, ${articles.length - pos - neg} neutral. Top headlines: ${articles.slice(0, 3).map((a) => a.title).join("; ")}. What's the market narrative?`
    : undefined;

  return (
    <WidgetShell
      title="News Feed"
      id={id}
      onRemove={removeWidget}
      onRefresh={() => refetch()}
      loading={isLoading}
      error={error ? "Failed to load news" : null}
      askAIContext={askAI}
    >
      <div className="flex flex-col h-full">
        {articles.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#21262d]">
            <span className="text-[11px] text-[#8b949e]">Sentiment:</span>
            <SentimentBadge sentiment={overall} />
            <span className="text-[11px] text-[#8b949e] ml-auto">{articles.length} articles</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2.5 border-b border-[#21262d] hover:bg-[#21262d] transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs text-[#e6edf3] group-hover:text-white leading-tight line-clamp-2">
                  {a.title}
                </span>
                <ExternalLink className="w-3 h-3 text-[#8b949e] shrink-0 mt-0.5" />
              </div>
              <div className="flex items-center gap-2">
                <SentimentBadge sentiment={a.sentiment} />
                <span className="text-[10px] text-[#8b949e]">{a.source}</span>
                <span className="text-[10px] text-[#8b949e] ml-auto">
                  {new Date(a.publishedAt).toLocaleDateString()}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}
