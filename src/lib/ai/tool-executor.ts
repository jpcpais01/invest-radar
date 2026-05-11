import { getQuote, getHistory, getFundamentals, getEarnings } from "@/lib/market/yahoo";
import { computeIndicators } from "@/lib/market/indicators";
import { getNews } from "@/lib/market/news";
import { TIMEFRAMES } from "@/types/market";

function getTimeframeDates(tf = "3M") {
  const frame = TIMEFRAMES.find((t) => t.value === tf) ?? TIMEFRAMES[3];
  const now = new Date();
  const from = new Date(now.getTime() - frame.days * 24 * 60 * 60 * 1000);
  const interval = frame.interval as Parameters<typeof getHistory>[1];
  return { from, interval };
}

export async function executeTool(name: string, args: Record<string, string>): Promise<unknown> {
  switch (name) {
    case "get_price_data": {
      const { from, interval } = getTimeframeDates(args.timeframe);
      const [quote, bars] = await Promise.all([
        getQuote(args.ticker),
        getHistory(args.ticker, interval, from),
      ]);
      return {
        quote,
        recentBars: bars.slice(-20).map((b) => ({
          date: new Date(b.time * 1000).toISOString().split("T")[0],
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        })),
        totalBars: bars.length,
        timeframe: args.timeframe ?? "3M",
      };
    }

    case "get_technical_indicators": {
      const { from, interval } = getTimeframeDates(args.timeframe ?? "3M");
      const bars = await getHistory(args.ticker, interval, from);
      const quote = await getQuote(args.ticker);
      const indicators = computeIndicators(bars);
      const lastN = (arr?: number[], n = 5) =>
        arr ? arr.slice(-n).map((v) => (isNaN(v) ? null : +v.toFixed(4))) : [];
      return {
        ticker: args.ticker,
        price: quote.price,
        rsi: {
          current: lastN(indicators.rsi, 1)[0],
          recent: lastN(indicators.rsi, 5),
          interpretation:
            (indicators.rsi?.slice(-1)[0] ?? 50) > 70
              ? "Overbought"
              : (indicators.rsi?.slice(-1)[0] ?? 50) < 30
              ? "Oversold"
              : "Neutral",
        },
        macd: {
          macd: lastN(indicators.macd?.macd, 1)[0],
          signal: lastN(indicators.macd?.signal, 1)[0],
          histogram: lastN(indicators.macd?.histogram, 1)[0],
          crossover:
            (indicators.macd?.histogram?.slice(-1)[0] ?? 0) > 0 ? "Bullish" : "Bearish",
        },
        bollinger: {
          upper: lastN(indicators.bollinger?.upper, 1)[0],
          middle: lastN(indicators.bollinger?.middle, 1)[0],
          lower: lastN(indicators.bollinger?.lower, 1)[0],
          pricePosition:
            quote.price > (indicators.bollinger?.upper?.slice(-1)[0] ?? Infinity)
              ? "Above Upper Band"
              : quote.price < (indicators.bollinger?.lower?.slice(-1)[0] ?? 0)
              ? "Below Lower Band"
              : "Within Bands",
        },
        ema: {
          ema9: lastN(indicators.ema9, 1)[0],
          ema21: lastN(indicators.ema21, 1)[0],
          ema50: lastN(indicators.ema50, 1)[0],
          ema200: lastN(indicators.ema200, 1)[0],
          trend:
            (indicators.ema50?.slice(-1)[0] ?? 0) > (indicators.ema200?.slice(-1)[0] ?? 0)
              ? "Golden Cross (Bullish)"
              : "Death Cross (Bearish)",
        },
      };
    }

    case "get_fundamentals": {
      const f = await getFundamentals(args.ticker);
      return f;
    }

    case "get_news_sentiment": {
      const news = await getNews(args.ticker);
      const pos = news.filter((n) => n.sentiment === "positive").length;
      const neg = news.filter((n) => n.sentiment === "negative").length;
      return {
        ticker: args.ticker,
        overallSentiment: pos > neg ? "Positive" : neg > pos ? "Negative" : "Neutral",
        positiveCount: pos,
        negativeCount: neg,
        neutralCount: news.length - pos - neg,
        recentHeadlines: news.slice(0, 5).map((n) => ({
          title: n.title,
          source: n.source,
          sentiment: n.sentiment,
          publishedAt: n.publishedAt,
        })),
      };
    }

    case "get_earnings": {
      const earnings = await getEarnings(args.ticker);
      const beats = earnings.filter((e) => e.beat === true).length;
      const total = earnings.filter((e) => e.beat != null).length;
      return {
        ticker: args.ticker,
        beatRate: total > 0 ? `${Math.round((beats / total) * 100)}%` : "N/A",
        recentEarnings: earnings.slice(-8),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
