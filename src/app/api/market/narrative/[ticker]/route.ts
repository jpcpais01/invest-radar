export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getNews } from "@/lib/market/news";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const articles = await getNews(ticker.toUpperCase());

    if (!articles.length) {
      return NextResponse.json({ stage: "unknown", coverage: [], sentimentTrend: 0, totalArticles: 0 });
    }

    // Sort oldest → newest
    const sorted = [...articles].sort(
      (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
    );

    // Group into two halves: older vs recent
    const mid = Math.floor(sorted.length / 2);
    const older  = sorted.slice(0, mid);
    const recent = sorted.slice(mid);

    const avgSentiment = (arr: typeof articles) =>
      arr.length ? arr.reduce((s, a) => s + a.sentimentScore, 0) / arr.length : 0;

    const olderSentiment  = avgSentiment(older);
    const recentSentiment = avgSentiment(recent);
    const sentimentTrend  = recentSentiment - olderSentiment;

    // Coverage velocity: recent half has more articles per unit time = growing
    const totalArticles  = articles.length;
    const recentFraction = recent.length / totalArticles;

    // Group by week for sparkline
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weeks = [3, 2, 1, 0].map((weeksAgo) => {
      const from = now - (weeksAgo + 1) * weekMs;
      const to   = now - weeksAgo * weekMs;
      const inWindow = articles.filter((a) => {
        const t = new Date(a.publishedAt).getTime();
        return t >= from && t < to;
      });
      return {
        label: weeksAgo === 0 ? "This wk" : `${weeksAgo}w ago`,
        count: inWindow.length,
        sentiment: avgSentiment(inWindow),
      };
    });

    // Classify stage
    let stage: "emerging" | "building" | "consensus" | "fading";
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
      coverage: weeks,
      sentimentTrend: Math.round(sentimentTrend * 100) / 100,
      olderSentiment: Math.round(olderSentiment * 100) / 100,
      recentSentiment: Math.round(recentSentiment * 100) / 100,
      totalArticles,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
