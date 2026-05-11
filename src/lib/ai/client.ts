import OpenAI from "openai";

export const AI_MODEL = "moonshotai/Kimi-K2.6";

let _client: OpenAI | null = null;

export function getTogetherClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.TOGETHER_API_KEY ?? "placeholder",
      baseURL: "https://api.together.xyz/v1",
    });
  }
  return _client;
}
