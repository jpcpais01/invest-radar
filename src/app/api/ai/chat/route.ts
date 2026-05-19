import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { AI_TOOLS } from "@/lib/ai/tools";
import { executeTool } from "@/lib/ai/tool-executor";

export const runtime = "nodejs";
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are InvestRadar AI, a senior investment analyst. The user's current view context (ticker, live price, date) is injected below — use it directly rather than calling tools to retrieve data you already have.

TOOL USE: When a question requires multiple data sources, call all relevant tools simultaneously in a single response — never make sequential single calls when parallel ones suffice. For a full analysis, batch get_price_data + get_technical_indicators + get_fundamentals + get_earnings in one round, then get_business_quality + get_news_sentiment + get_insider_activity in the next if needed.

WRITING STYLE: Write like an analyst on a call — conversational, direct, grounded in data. Weave numbers into prose; avoid tables. Use bullet points only when comparing 3+ discrete items. Lead with your read, back it with key figures, flag the main risk at the end. Never give a definitive buy/sell call — frame everything as analysis and leave the decision to the investor.

RESPONSE LENGTH: Match length to complexity. A quick question gets 2–4 sentences. A full analysis gets 3–5 focused paragraphs. Never pad.

FOLLOW-UPS: At the very end of every response, after your analysis, append exactly this block (no extra text after it):
<followups>["Question one?","Question two?","Question three?"]</followups>
Make the follow-ups specific to the ticker and your analysis — not generic. They should be things the user would naturally want to ask next.`;

// Convert OpenAI tool format to Anthropic format
const ANTHROPIC_TOOLS: Anthropic.Tool[] = AI_TOOLS.map((t) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (t as any).function;
  return {
    name: fn.name as string,
    description: (fn.description ?? "") as string,
    input_schema: fn.parameters as Anthropic.Tool["input_schema"],
  };
});

type AnthropicMsg = Anthropic.MessageParam;

export async function POST(req: NextRequest) {
  const { messages, ticker, viewContext } = await req.json();

  const systemWithContext = viewContext
    ? `${SYSTEM_PROMPT}\n\n<view_context>\n${viewContext}\n</view_context>`
    : SYSTEM_PROMPT;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const apiMessages: AnthropicMsg[] = messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        );

        const conversationMessages: AnthropicMsg[] = [...apiMessages];
        const MAX_TOOL_ROUNDS = 5;
        let textSent = false;

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const forceFinal = round === MAX_TOOL_ROUNDS;

          const response = await client.messages.stream({
            model: MODEL,
            system: systemWithContext,
            messages: conversationMessages,
            tools: forceFinal ? undefined : ANTHROPIC_TOOLS,
            tool_choice: forceFinal ? undefined : { type: "auto" },
            max_tokens: 4000,
          });

          let fullText = "";
          // Map from block index to tool_use accumulator
          const toolBlocks: Record<number, { id: string; name: string; inputJson: string }> = {};
          let currentBlockIndex = -1;
          let currentBlockType = "";

          for await (const event of response) {
            if (event.type === "content_block_start") {
              currentBlockIndex = event.index;
              currentBlockType = event.content_block.type;
              if (event.content_block.type === "tool_use") {
                toolBlocks[event.index] = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  inputJson: "",
                };
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                fullText += event.delta.text;
                send({ type: "text_chunk", content: event.delta.text });
              } else if (event.delta.type === "input_json_delta" && toolBlocks[currentBlockIndex]) {
                toolBlocks[currentBlockIndex].inputJson += event.delta.partial_json;
              }
            } else if (event.type === "content_block_stop") {
              currentBlockType = "";
            }
          }

          const toolCalls = Object.values(toolBlocks).filter((t) => t.name);

          if (toolCalls.length > 0 && !forceFinal) {
            // Retract any streamed text (model decided to call tools instead)
            if (fullText) send({ type: "retract_text" });

            // Build assistant message with tool_use content blocks
            conversationMessages.push({
              role: "assistant",
              content: toolCalls.map((tc) => ({
                type: "tool_use" as const,
                id: tc.id,
                name: tc.name,
                input: (() => { try { return JSON.parse(tc.inputJson || "{}"); } catch { return {}; } })(),
              })),
            });

            const toolResults = await Promise.all(
              toolCalls.map(async (tc) => {
                send({ type: "tool_start", toolName: tc.name, toolCallId: tc.id });
                try {
                  const args = (() => { try { return JSON.parse(tc.inputJson || "{}"); } catch { return {}; } })();
                  if (!args.ticker && ticker) args.ticker = ticker;
                  const result = await executeTool(tc.name, args);
                  send({ type: "tool_result", toolName: tc.name, toolCallId: tc.id, data: result });
                  const resultStr = JSON.stringify(result);
                  return {
                    id: tc.id,
                    content: resultStr.length > 4000 ? resultStr.slice(0, 4000) + "…[truncated]" : resultStr,
                  };
                } catch (e) {
                  const err = String(e);
                  send({ type: "tool_error", toolName: tc.name, toolCallId: tc.id, error: err });
                  return { id: tc.id, content: `Error: ${err}` };
                }
              })
            );

            // Tool results go as a user message in Anthropic format
            conversationMessages.push({
              role: "user",
              content: toolResults.map((tr) => ({
                type: "tool_result" as const,
                tool_use_id: tr.id,
                content: tr.content,
              })),
            });
          } else {
            // No tool calls — we have the final text
            if (fullText) textSent = true;

            // Extract and strip <followups> block
            const followupsMatch = fullText.match(/<followups>(\[[\s\S]*?\])<\/followups>/);
            if (followupsMatch) {
              try {
                const questions: string[] = JSON.parse(followupsMatch[1]);
                const trimChars = followupsMatch[0].length;
                send({ type: "trim", chars: trimChars });
                send({ type: "followups", questions });
              } catch {
                // ignore malformed followups
              }
            }
            break;
          }
        }

        if (!textSent) {
          const fallback = await client.messages.create({
            model: MODEL,
            system: `${systemWithContext}\n\nYou have gathered all the data above. Now write your analysis directly — no more tool calls.`,
            messages: conversationMessages,
            max_tokens: 1200,
          });
          const fallbackText = fallback.content.find((b) => b.type === "text")?.text ?? "";
          send({ type: "text", content: fallbackText || "I retrieved the data. What would you like to know?" });
        }

        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
