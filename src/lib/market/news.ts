/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinanceClass from "yahoo-finance2";
import { NewsItem } from "@/types/market";

const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });
const NEWSAPI_KEY = process.env.NEWSAPI_KEY;

function scoreSentiment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const positive = ["surge", "soar", "beat", "record", "gain", "rally", "profit", "growth", "upgrade", "bullish", "strong", "exceed", "outperform"];
  const negative = ["fall", "drop", "miss", "decline", "loss", "downgrade", "bearish", "weak", "crash", "plunge", "disappoint", "cut", "warn"];
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of positive) if (lower.includes(w)) score++;
  for (const w of negative) if (lower.includes(w)) score--;
  return {
    sentiment: score > 0 ? "positive" : score < 0 ? "negative" : "neutral",
    score,
  };
}

async function getYahooNews(ticker: string): Promise<NewsItem[]> {
  const result: any = await yf.search(ticker, { newsCount: 20, quotesCount: 0 });
  const articles: any[] = result?.news ?? [];
  return articles
    .filter((a) => a.title && a.link)
    .map((a) => {
      const { sentiment, score } = scoreSentiment(a.title);
      return {
        title: a.title as string,
        url: a.link as string,
        source: (a.publisher as string) ?? "Yahoo Finance",
        publishedAt: a.providerPublishTime instanceof Date
          ? a.providerPublishTime.toISOString()
          : new Date(a.providerPublishTime).toISOString(),
        sentiment,
        sentimentScore: score,
      };
    });
}

export async function getNews(ticker: string): Promise<NewsItem[]> {
  if (NEWSAPI_KEY) {
    try {
      const query = encodeURIComponent(ticker);
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const url = `https://newsapi.org/v2/everything?q=${query}&from=${from}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${NEWSAPI_KEY}`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      const data = await res.json();
      if (data.articles?.length) {
        return data.articles
          .filter((a: any) => a.title && a.url)
          .map((a: any) => {
            const text = `${a.title} ${a.description ?? ""}`;
            const { sentiment, score } = scoreSentiment(text);
            return {
              title: a.title as string,
              url: a.url as string,
              source: a.source?.name ?? "Unknown",
              publishedAt: a.publishedAt as string,
              sentiment,
              sentimentScore: score,
              summary: a.description as string | undefined,
            };
          });
      }
    } catch {
      // fall through to Yahoo Finance
    }
  }

  return getYahooNews(ticker);
}
