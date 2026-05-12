export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getNews } from "@/lib/market/news";

type Stage = "emerging" | "building" | "consensus" | "fading" | "unknown";

interface WeekCoverage {
  label: string;
  count: number;
  positive: number;
  neutral: number;
  negative: number;
}

function avgSentiment(arr: { sentimentScore: number }[]) {
  return arr.length ? arr.reduce((s, a) => s + a.sentimentScore, 0) / arr.length : 0;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const articles = await getNews(ticker.toUpperCase());

    if (!articles.length) {
      return NextResponse.json({ stage: "unknown", coverage: [], sentimentTrend: 0, olderSentiment: 0, recentSentiment: 0, totalArticles: 0, positive: 0, neutral: 0, negative: 0 });
    }

    const sorted = [...articles].sort(
      (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
    );

    // Older vs recent halves for trend
    const mid = Math.floor(sorted.length / 2);
    const olderSentiment  = avgSentiment(sorted.slice(0, mid));
    const recentSentiment = avgSentiment(sorted.slice(mid));
    const sentimentTrend  = recentSentiment - olderSentiment;

    const totalArticles   = articles.length;
    const recentFraction  = sorted.slice(mid).length / totalArticles;

    // Overall sentiment counts
    const positive = articles.filter((a) => a.sentiment === "positive").length;
    const neutral  = articles.filter((a) => a.sentiment === "neutral").length;
    const negative = articles.filter((a) => a.sentiment === "negative").length;

    // Group by week (4 weeks back)
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const coverage: WeekCoverage[] = [3, 2, 1, 0].map((weeksAgo) => {
      const from = now - (weeksAgo + 1) * weekMs;
      const to   = now - weeksAgo * weekMs;
      const inWindow = articles.filter((a) => {
        const t = new Date(a.publishedAt).getTime();
        return t >= from && t < to;
      });
      return {
        label: weeksAgo === 0 ? "This wk" : `${weeksAgo}w ago`,
        count: inWindow.length,
        positive: inWindow.filter((a) => a.sentiment === "positive").length,
        neutral:  inWindow.filter((a) => a.sentiment === "neutral").length,
        negative: inWindow.filter((a) => a.sentiment === "negative").length,
      };
    });

    // Classify stage
    let stage: Stage;
    if (totalArticles <= 4) {
      stage = recentFraction > 0.6 ? "emerging" : "fading";
    } else if (recentFraction > 0.6 && sentimentTrend >= 0) {
      stage = totalArticles > 12 ? "building" : "emerging";
    } else if (recentFraction > 0.5 && totalArticles > 10) {
      stage = "consensus";
    } else if (recentFraction < 0.4) {
      stage = "fading";
    } else {
      stage = "building";
    }

    return NextResponse.json({
      stage,
      coverage,
      sentimentTrend: Math.round(sentimentTrend * 100) / 100,
      olderSentiment: Math.round(olderSentiment * 100) / 100,
      recentSentiment: Math.round(recentSentiment * 100) / 100,
      totalArticles,
      positive,
      neutral,
      negative,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
