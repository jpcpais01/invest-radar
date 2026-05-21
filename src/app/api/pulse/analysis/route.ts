export const runtime = "nodejs";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { stats, portfolio } = await req.json();

  const statLines = (stats as { ticker: string; ret: number; vol: number; dd: number; sharpe: number }[])
    .sort((a, b) => b.ret - a.ret)
    .map(s =>
      `  ${s.ticker}: 1M ${s.ret >= 0 ? "+" : ""}${s.ret.toFixed(1)}% return, ` +
      `${s.vol.toFixed(0)}% annualised vol, -${s.dd.toFixed(1)}% max drawdown, Sharpe ${s.sharpe.toFixed(2)}`
    )
    .join("\n");

  const prompt = `You are a sharp portfolio analyst. Review this watchlist data and write a concise 3-paragraph analysis.

Data:
${statLines}

Equal-weight portfolio return: ${portfolio.avgRet >= 0 ? "+" : ""}${portfolio.avgRet.toFixed(1)}%
Tickers positive: ${portfolio.winCount}/${stats.length}
Average pairwise correlation: ${portfolio.avgCorr.toFixed(2)}
Most correlated pair: ${portfolio.maxPair[0]} / ${portfolio.maxPair[1]} (r = ${portfolio.maxCorrVal.toFixed(2)})
Least correlated pair: ${portfolio.minPair[0]} / ${portfolio.minPair[1]} (r = ${portfolio.minCorrVal.toFixed(2)})
Best risk-adjusted: ${portfolio.bestSharpeTicker} (Sharpe ${portfolio.bestSharpeVal?.toFixed(2)})

Write exactly 3 paragraphs:
1. Performance narrative — who is driving returns, who is dragging, what the spread reveals about the current market environment
2. Risk picture — which names carry outsized risk relative to their return, any drawdown concerns, what the volatility distribution means
3. One specific, direct observation that follows from this exact data — something actionable or noteworthy that a sharp analyst would flag

Rules: reference specific tickers and actual numbers throughout. No disclaimers. No generic advice. No "it's important to note." Write as if briefing a sophisticated investor.`;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 520,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
