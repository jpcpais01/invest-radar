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

  const prompt = `You are a sharp portfolio analyst. Review this watchlist data and write a 3-paragraph analysis.

Data:
${statLines}

Equal-weight portfolio return: ${portfolio.avgRet >= 0 ? "+" : ""}${portfolio.avgRet.toFixed(1)}%
Tickers positive: ${portfolio.winCount}/${stats.length}
Average pairwise correlation: ${portfolio.avgCorr.toFixed(2)}
Most correlated pair: ${portfolio.maxPair[0]} / ${portfolio.maxPair[1]} (r = ${portfolio.maxCorrVal.toFixed(2)})
Least correlated pair: ${portfolio.minPair[0]} / ${portfolio.minPair[1]} (r = ${portfolio.minCorrVal.toFixed(2)})
Best risk-adjusted: ${portfolio.bestSharpeTicker} (Sharpe ${portfolio.bestSharpeVal?.toFixed(2)})

Write exactly 3 paragraphs separated by a blank line:
1. Performance narrative — who is driving returns, who is lagging, what the spread reveals
2. Risk picture — which names carry outsized risk vs their return, drawdown concerns, vol distribution
3. Key insights — based purely on the numbers, which position(s) look worth adding to or trimming, what setup or inflection point stands out, what a sharp investor would act on or watch closely

Rules:
- Reference specific tickers and numbers throughout all 3 paragraphs
- No disclaimers, no "it's important to note", no generic advice
- You may use **bold** to emphasise specific ticker names or key numbers
- Do NOT use markdown headers (###), bullet points, or numbered lists
- Write as if briefing a sophisticated investor in 3 plain paragraphs`;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
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
