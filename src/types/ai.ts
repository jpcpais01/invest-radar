export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  followups?: string[];
  timestamp: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  data: unknown;
  error?: string;
}

export type AITool =
  | "get_price_data"
  | "get_technical_indicators"
  | "get_options_chain"
  | "get_fundamentals"
  | "get_news_sentiment"
  | "get_earnings"
  | "get_insider_trades"
  | "get_analyst_ratings"
  | "get_short_interest"
  | "get_sector_data"
  | "get_yield_curve"
  | "get_support_resistance"
  | "get_max_pain"
  | "get_put_call_ratio"
  | "get_social_sentiment";
