/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinanceClass from "yahoo-finance2";
import { OHLCVBar, Quote, Fundamentals, EarningsEvent } from "@/types/market";

// v3: must instantiate the class
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

export async function getQuote(ticker: string): Promise<Quote> {
  const q: any = await yf.quote(ticker);
  return {
    ticker,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePercent: q.regularMarketChangePercent ?? 0,
    open: q.regularMarketOpen ?? 0,
    high: q.regularMarketDayHigh ?? 0,
    low: q.regularMarketDayLow ?? 0,
    previousClose: q.regularMarketPreviousClose ?? 0,
    volume: q.regularMarketVolume ?? 0,
    marketCap: q.marketCap,
    regularMarketTime: q.regularMarketTime
      ? new Date(q.regularMarketTime).getTime() / 1000
      : undefined,
  };
}

export async function getHistory(
  ticker: string,
  interval: "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo",
  period1: Date,
  period2 = new Date()
): Promise<OHLCVBar[]> {
  const result: any = await yf.chart(ticker, { period1, period2, interval });

  return ((result.quotes ?? []) as any[])
    .filter((q: any) => q.open != null && q.close != null)
    .map((q: any) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume ?? 0,
    }));
}

export async function getFundamentals(ticker: string): Promise<Fundamentals> {
  const [quote, summary] = await Promise.all([
    yf.quote(ticker) as Promise<any>,
    yf.quoteSummary(ticker, {
      modules: ["summaryDetail", "defaultKeyStatistics", "assetProfile", "financialData"],
    }).catch(() => null),
  ]);

  const detail = summary?.summaryDetail;
  const stats = summary?.defaultKeyStatistics;
  const profile = summary?.assetProfile;
  const financial = summary?.financialData;

  const safeNum = (val: any): number | undefined => {
    if (val == null) return undefined;
    if (typeof val === "number") return val;
    if (typeof val === "object" && "raw" in val) return val.raw as number;
    return undefined;
  };

  return {
    ticker,
    name: quote.longName ?? quote.shortName ?? ticker,
    sector: profile?.sector,
    industry: profile?.industry,
    description: profile?.longBusinessSummary,
    pe: safeNum(detail?.trailingPE),
    forwardPE: safeNum(detail?.forwardPE),
    ps: safeNum(stats?.priceToSalesTrailing12Months),
    pb: safeNum(detail?.priceToBook),
    evEbitda: safeNum(stats?.enterpriseToEbitda),
    marketCap: quote.marketCap,
    revenue: safeNum(financial?.totalRevenue),
    revenueGrowth: safeNum(financial?.revenueGrowth),
    eps: safeNum(stats?.trailingEps),
    epsGrowth: safeNum(financial?.earningsGrowth),
    dividendYield: safeNum(detail?.dividendYield),
    beta: safeNum(detail?.beta),
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
  };
}

export async function getEarnings(ticker: string): Promise<EarningsEvent[]> {
  try {
    const summary: any = await yf.quoteSummary(ticker, {
      modules: ["earningsHistory"],
    });
    const history: any[] = summary?.earningsHistory?.history ?? [];
    return history
      .map((e: any) => {
        // v3: quarter is an ISO string or Date, epsActual/epsEstimate are plain numbers
        const quarter = e.quarter;
        const date = quarter
          ? new Date(quarter).toISOString().split("T")[0]
          : "";
        const epsActual: number | undefined =
          typeof e.epsActual === "number" ? e.epsActual : undefined;
        const epsEstimate: number | undefined =
          typeof e.epsEstimate === "number" ? e.epsEstimate : undefined;
        return {
          date,
          epsEstimate,
          epsActual,
          beat:
            epsActual != null && epsEstimate != null
              ? epsActual > epsEstimate
              : undefined,
        };
      })
      .filter((e) => e.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export async function searchTickers(query: string) {
  const results: any = await yf.search(query);
  return ((results.quotes ?? []) as any[])
    .filter((r: any) => r.quoteType === "EQUITY" || r.quoteType === "ETF")
    .slice(0, 10)
    .map((r: any) => ({
      symbol: r.symbol,
      name: r.longname ?? r.shortname ?? r.symbol,
      type: r.quoteType,
      exchange: r.exchange,
    }));
}
