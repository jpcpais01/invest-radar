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
  {
    type: "function",
    function: {
      name: "get_business_quality",
      description: "Score a company's business quality across profitability, growth, financial health, and capital efficiency. Returns 0-100 scores and the underlying raw metrics. Use for quality investing analysis, moat assessment, or comparing companies.",
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
      name: "get_narrative",
      description: "Analyse the media narrative around a ticker: coverage stage (emerging/building/consensus/fading), sentiment trend, weekly coverage breakdown. Use to understand if a story is gaining or losing momentum.",
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
      name: "get_insider_activity",
      description: "Get insider buying and selling activity: recent transactions, net share direction, and quarterly buy/sell breakdown. Use to gauge insider conviction.",
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
      name: "get_fair_value",
      description: "Compute Peter Lynch fair value (EPS × expected 5-year growth rate) and PEG ratio. Returns fair price estimate, current price, upside/downside %, and PEG. Use to assess whether a growth stock is cheap or expensive relative to its earnings growth.",
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
      name: "get_dcf_valuation",
      description: "Run a discounted cash flow (DCF) model with bear/base/bull scenarios using the live 10-year Treasury yield as the risk-free rate. Returns intrinsic value per share for each scenario, WACC, FCF per share, growth rate assumption, and upside/downside vs current price. Use for fundamental valuation and margin-of-safety analysis.",
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
      name: "get_technical_heatmap",
      description: "Analyze technical signals across five timeframes (1M, 3M, 6M, 1Y, 2Y) for trend (EMA50), momentum (RSI), MACD crossover, volume (OBV), and price position. Returns a grid of bullish/bearish/neutral ratings and an overall bias with agreement score. Use to quickly understand whether multiple timeframes are aligned.",
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
