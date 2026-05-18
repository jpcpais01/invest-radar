export interface Quote {
  ticker: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap?: number;
  regularMarketTime?: number;
}

export interface OHLCVBar {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Fundamentals {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  pe?: number;
  forwardPE?: number;
  ps?: number;
  pb?: number;
  evEbitda?: number;
  marketCap?: number;
  revenue?: number;
  revenueGrowth?: number;
  eps?: number;
  epsGrowth?: number;
  dividendYield?: number;
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  description?: string;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  summary?: string;
}

export interface OptionsContract {
  strike: number;
  expiry: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  inTheMoney: boolean;
}

export interface OptionsChain {
  ticker: string;
  expiry: string;
  calls: OptionsContract[];
  puts: OptionsContract[];
  underlyingPrice: number;
}

export interface TechnicalIndicators {
  rsi?: number[];
  stochastic?: { k: number[]; d: number[] };
  macd?: { macd: number[]; signal: number[]; histogram: number[] };
  bollinger?: { upper: number[]; middle: number[]; lower: number[] };
  ema9?: number[];
  ema21?: number[];
  ema50?: number[];
  ema200?: number[];
  adx?: { adx: number[]; pdi: number[]; mdi: number[] };
  psar?: number[];
  cci?: number[];
  obv?: number[];
}

export interface Timeframe {
  label: string;
  value: string;
  days: number;
  interval: string;
}

export const TIMEFRAMES: Timeframe[] = [
  { label: "1D", value: "1D", days: 1, interval: "5m" },
  { label: "5D", value: "5D", days: 5, interval: "15m" },
  { label: "1M", value: "1M", days: 30, interval: "1d" },
  { label: "3M", value: "3M", days: 90, interval: "1d" },
  { label: "6M", value: "6M", days: 180, interval: "1d" },
  { label: "1Y", value: "1Y", days: 365, interval: "1d" },
  { label: "2Y",  value: "2Y",  days: 730,  interval: "1wk" },
  { label: "5Y",  value: "5Y",  days: 1825, interval: "1wk" },
  { label: "10Y", value: "10Y", days: 3650, interval: "1mo" },
];

export interface EarningsEvent {
  date: string;
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimate?: number;
  revenueActual?: number;
  beat?: boolean;
}
