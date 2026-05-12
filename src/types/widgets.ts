export type WidgetType =
  | "candlestick"
  | "rsi"
  | "stochastic"
  | "macd"
  | "bollinger"
  | "ema"
  | "signal-summary"
  | "adx"
  | "cci"
  | "psar"
  | "obv"
  | "options-chain"
  | "iv-rank"
  | "max-pain"
  | "prob-cone"
  | "put-call-ratio"
  | "pl-simulator"
  | "key-metrics"
  | "earnings"
  | "insider-trading"
  | "news-feed"
  | "analyst-ratings"
  | "sector-heatmap"
  | "yield-curve"
  | "quality-score"
  | "valuation-context"
  | "timeframe-heatmap"
  | "conviction-tracker"
  | "narrative-index"
  | "price-prediction";

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  i: string; // react-grid-layout key
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type PresetLayout = "overview" | "options" | "technical";

export const WIDGET_CATALOG: { type: WidgetType; title: string; defaultW: number; defaultH: number }[] = [
  { type: "candlestick", title: "Price Chart", defaultW: 8, defaultH: 6 },
  { type: "rsi", title: "RSI (14)", defaultW: 4, defaultH: 3 },
  { type: "stochastic", title: "Stochastic (14,3)", defaultW: 4, defaultH: 3 },
  { type: "macd", title: "MACD", defaultW: 4, defaultH: 3 },
  { type: "bollinger", title: "Bollinger Bands", defaultW: 4, defaultH: 3 },
  { type: "ema", title: "EMA Panel", defaultW: 4, defaultH: 3 },
  { type: "signal-summary", title: "Signal Summary", defaultW: 4, defaultH: 3 },
  { type: "options-chain", title: "Options Chain", defaultW: 8, defaultH: 6 },
  { type: "iv-rank", title: "IV Rank", defaultW: 4, defaultH: 3 },
  { type: "max-pain", title: "Max Pain", defaultW: 4, defaultH: 3 },
  { type: "prob-cone", title: "Probability Cone", defaultW: 4, defaultH: 3 },
  { type: "put-call-ratio", title: "Put/Call Ratio", defaultW: 4, defaultH: 3 },
  { type: "key-metrics", title: "Key Metrics", defaultW: 4, defaultH: 4 },
  { type: "earnings", title: "Earnings", defaultW: 4, defaultH: 4 },
  { type: "insider-trading", title: "Insider Trading", defaultW: 4, defaultH: 4 },
  { type: "news-feed", title: "News Feed", defaultW: 4, defaultH: 6 },
  { type: "analyst-ratings", title: "Analyst Ratings", defaultW: 4, defaultH: 3 },
  { type: "sector-heatmap", title: "Sector Heatmap", defaultW: 8, defaultH: 5 },
  { type: "yield-curve", title: "Yield Curve", defaultW: 4, defaultH: 4 },
  { type: "quality-score", title: "Quality Score", defaultW: 4, defaultH: 4 },
  { type: "valuation-context", title: "Valuation Context", defaultW: 4, defaultH: 4 },
  { type: "timeframe-heatmap", title: "Timeframe Heatmap", defaultW: 8, defaultH: 4 },
  { type: "conviction-tracker", title: "Management Conviction", defaultW: 4, defaultH: 5 },
  { type: "narrative-index",   title: "Narrative Index",     defaultW: 4, defaultH: 4 },
  { type: "price-prediction", title: "AI Price Prediction",  defaultW: 6, defaultH: 5 },
];
