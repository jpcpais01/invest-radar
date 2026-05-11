import { NextRequest } from "next/server";
import { getTogetherClient, AI_MODEL } from "@/lib/ai/client";
import { AI_TOOLS } from "@/lib/ai/tools";
import { executeTool } from "@/lib/ai/tool-executor";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are InvestRadar AI, an expert investment analyst assistant. You have access to real-time market data tools and can analyze stocks, options, technicals, fundamentals, and market sentiment.

Guidelines:
- Be concise and data-driven. Lead with the key insight, then support it with numbers.
- When you have tool data, reference the specific numbers, not vague generalities.
- For trade setups, always mention risk (stop loss, max loss) not just potential upside.
- Distinguish between short-term signals (RSI, MACD) and longer-term fundamentals.
- Never give definitive buy/sell advice — frame as analysis and let the user decide.
- Use bullet points for multi-part answers. Be terse.`;

type ApiMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: ToolCallSpec[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCallSpec {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

function stripThinking(text: string): string {
  // Remove <think>...</think> blocks emitted by Kimi K2.6
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

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
        const apiMessages: ApiMessage[] = messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        );

        const conversationMessages: ApiMessage[] = [...apiMessages];
        let iterations = 0;

        while (iterations < 5) {
          iterations++;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const response = await getTogetherClient().chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "system", content: systemWithContext },
              ...conversationMessages,
            ] as any,
            tools: AI_TOOLS,
            tool_choice: "auto",
            stream: true,
            max_tokens: 2000,
          });

          // Buffer the full content — we only emit text to the client on the
          // final (no-tool-call) iteration so intermediate reasoning and
          // pre-tool commentary never appear in the UI.
          let fullContent = "";
          const toolCallMap: Record<number, { id: string; name: string; arguments: string }> = {};

          for await (const chunk of response) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (delta?.content) fullContent += delta.content;

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallMap[idx]) toolCallMap[idx] = { id: "", name: "", arguments: "" };
                if (tc.id) toolCallMap[idx].id = tc.id;
                if (tc.function?.name) toolCallMap[idx].name += tc.function.name;
                if (tc.function?.arguments) toolCallMap[idx].arguments += tc.function.arguments;
              }
            }
          }

          const toolCalls = Object.values(toolCallMap).filter((tc) => tc.name);
          // Strip <think>...</think> reasoning tokens before showing anything
          const cleanContent = stripThinking(fullContent);

          if (toolCalls.length > 0) {
            conversationMessages.push({
              role: "assistant",
              content: cleanContent || null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });

            const toolResults = await Promise.all(
              toolCalls.map(async (tc) => {
                send({ type: "tool_start", toolName: tc.name, toolCallId: tc.id });
                try {
                  const args = JSON.parse(tc.arguments || "{}");
                  if (!args.ticker && ticker) args.ticker = ticker;
                  const result = await executeTool(tc.name, args);
                  send({ type: "tool_result", toolName: tc.name, toolCallId: tc.id, data: result });
                  return { id: tc.id, content: JSON.stringify(result) };
                } catch (e) {
                  const err = String(e);
                  send({ type: "tool_error", toolName: tc.name, toolCallId: tc.id, error: err });
                  return { id: tc.id, content: `Error: ${err}` };
                }
              })
            );

            for (const tr of toolResults) {
              conversationMessages.push({
                role: "tool",
                tool_call_id: tr.id,
                content: tr.content,
              });
            }
          } else {
            // Final answer — emit the clean content and stop
            if (cleanContent) {
              send({ type: "text", content: cleanContent });
            } else if (iterations > 1) {
              // Tools ran but model gave no text — ask it to summarise
              send({ type: "text", content: "I've retrieved the data above. Let me know if you'd like a specific analysis." });
            }
            break;
          }
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
