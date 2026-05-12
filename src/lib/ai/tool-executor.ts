import { getQuote, getHistory, getFundamentals, getEarnings, getQualityData, getInsiderTransactions } from "@/lib/market/yahoo";
import { computeIndicators } from "@/lib/market/indicators";
import { getNews } from "@/lib/market/news";
import { TIMEFRAMES } from "@/types/market";

// ── Quality scoring helpers (mirrors /api/market/quality) ─────────────────────
function _scoreMargin(v?: number) { return v==null?0.5:v<0?0:v<0.05?0.25:v<0.15?0.55:v<0.25?0.78:1; }
function _scoreROE(v?: number)    { return v==null?0.5:v<0?0:v<0.05?0.2:v<0.10?0.45:v<0.20?0.72:1; }
function _scoreROA(v?: number)    { return v==null?0.5:v<0?0:v<0.03?0.3:v<0.07?0.62:1; }
function _scoreGrowth(v?: number) { return v==null?0.5:v<-0.1?0:v<0?0.2:v<0.05?0.4:v<0.15?0.68:v<0.30?0.85:1; }
function _scoreD2E(v?: number)    { return v==null?0.5:v>300?0:v>200?0.2:v>100?0.5:v>50?0.75:1; }
function _scoreCR(v?: number)     { return v==null?0.5:v<1?0.1:v<1.5?0.5:v<2.5?0.85:1; }
function _scoreFCF(fcf?: number, ocf?: number) {
  if (!fcf||!ocf||ocf===0) return 0.5;
  const r=fcf/ocf; return r<0?0:r<0.3?0.3:r<0.6?0.6:r<0.85?0.82:1;
}
function _avg(...vals: number[]) {
  const v=vals.filter(x=>!isNaN(x)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:0.5;
}
function _clamp(v: number) { return Math.max(0, Math.min(1, v)); }

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

    case "get_business_quality": {
      const d = await getQualityData(args.ticker);
      const profitability = _clamp(_avg(_scoreMargin(d.profitMargins), _scoreMargin(d.operatingMargins), _scoreROE(d.returnOnEquity), _scoreROA(d.returnOnAssets)));
      const growth       = _clamp(_avg(_scoreGrowth(d.revenueGrowth), _scoreGrowth(d.earningsGrowth)));
      const health       = _clamp(_avg(_scoreD2E(d.debtToEquity), _scoreCR(d.currentRatio)));
      const efficiency   = _clamp(_avg(_scoreFCF(d.freeCashflow, d.operatingCashflow), _scoreROA(d.returnOnAssets)));
      const overall      = _clamp(_avg(profitability, growth, health, efficiency));
      return {
        ticker: args.ticker,
        scores: {
          overall:       Math.round(overall * 100),
          profitability: Math.round(profitability * 100),
          growth:        Math.round(growth * 100),
          health:        Math.round(health * 100),
          efficiency:    Math.round(efficiency * 100),
        },
        rawMetrics: {
          profitMargins:    d.profitMargins,
          operatingMargins: d.operatingMargins,
          returnOnEquity:   d.returnOnEquity,
          returnOnAssets:   d.returnOnAssets,
          revenueGrowth:    d.revenueGrowth,
          earningsGrowth:   d.earningsGrowth,
          debtToEquity:     d.debtToEquity,
          currentRatio:     d.currentRatio,
          freeCashflow:     d.freeCashflow,
          operatingCashflow:d.operatingCashflow,
        },
      };
    }

    case "get_narrative": {
      const articles = await getNews(args.ticker);
      if (!articles.length) return { ticker: args.ticker, stage: "unknown", totalArticles: 0 };
      const sorted = [...articles].sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
      const mid = Math.floor(sorted.length / 2);
      const avgSent = (arr: typeof sorted) => arr.length ? arr.reduce((s,a) => s + a.sentimentScore, 0) / arr.length : 0;
      const olderSentiment  = avgSent(sorted.slice(0, mid));
      const recentSentiment = avgSent(sorted.slice(mid));
      const sentimentTrend  = recentSentiment - olderSentiment;
      const totalArticles   = articles.length;
      const recentFraction  = sorted.slice(mid).length / totalArticles;
      const positive = articles.filter(a => a.sentiment === "positive").length;
      const negative = articles.filter(a => a.sentiment === "negative").length;
      let stage: string;
      if (totalArticles <= 4) { stage = recentFraction > 0.6 ? "emerging" : "fading"; }
      else if (recentFraction > 0.6 && sentimentTrend >= 0) { stage = totalArticles > 12 ? "building" : "emerging"; }
      else if (recentFraction > 0.5 && totalArticles > 10) { stage = "consensus"; }
      else if (recentFraction < 0.4) { stage = "fading"; }
      else { stage = "building"; }
      return {
        ticker: args.ticker,
        stage,
        totalArticles,
        positive,
        negative,
        neutral: totalArticles - positive - negative,
        sentimentTrend: Math.round(sentimentTrend * 100) / 100,
        recentSentiment: Math.round(recentSentiment * 100) / 100,
        recentHeadlines: articles.slice(0, 5).map(n => ({ title: n.title, sentiment: n.sentiment, publishedAt: n.publishedAt })),
      };
    }

    case "get_insider_activity": {
      const transactions = await getInsiderTransactions(args.ticker);
      const netShares = transactions.reduce((acc, t) => acc + (t.isBuy ? Math.abs(t.shares) : -Math.abs(t.shares)), 0);
      const recentBuys  = transactions.filter(t => t.isBuy).slice(0, 5);
      const recentSells = transactions.filter(t => !t.isBuy).slice(0, 5);
      return {
        ticker: args.ticker,
        netShares,
        signal: netShares > 0 ? "Net buying" : netShares < 0 ? "Net selling" : "Neutral",
        totalTransactions: transactions.length,
        buyCount:  transactions.filter(t => t.isBuy).length,
        sellCount: transactions.filter(t => !t.isBuy).length,
        recentBuys:  recentBuys.map(t => ({ name: t.name, relation: t.relation, shares: t.shares, value: t.value, date: t.date })),
        recentSells: recentSells.map(t => ({ name: t.name, relation: t.relation, shares: t.shares, value: t.value, date: t.date })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
