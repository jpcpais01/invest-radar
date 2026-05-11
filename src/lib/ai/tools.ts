import type OpenAI from "openai";

export const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_price_data",
      description: "Fetch OHLCV price history and current quote for a ticker. Use for price trends, chart analysis, support/resistance, and momentum.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker symbol, e.g. AAPL" },
          timeframe: {
            type: "string",
            enum: ["1D", "5D", "1M", "3M", "6M", "1Y", "2Y"],
            description: "Lookback timeframe",
          },
        },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_technical_indicators",
      description: "Compute RSI, MACD, Bollinger Bands, and EMAs for a ticker. Use for overbought/oversold analysis, momentum, and trend following.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          timeframe: { type: "string", enum: ["1M", "3M", "6M", "1Y"], default: "3M" },
        },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fundamentals",
      description: "Get key fundamental metrics: P/E, EV/EBITDA, market cap, revenue, earnings growth, dividend yield, beta, 52-week range.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string" },
        },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news_sentiment",
      description: "Fetch recent news articles and sentiment scores for a ticker. Use for event-driven analysis, catalyst identification.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string" },
        },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_earnings",
      description: "Get historical earnings data: EPS estimates vs actuals, beat/miss history, revenue data. Use for earnings analysis.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string" },
        },
        required: ["ticker"],
      },
    },
  },
];
