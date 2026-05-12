import Together from "together-ai";

export const AI_MODEL = "deepseek-ai/DeepSeek-V4-Pro";

let _client: Together | null = null;

export function getTogetherClient(): Together {
  if (!_client) {
    _client = new Together({ apiKey: process.env.TOGETHER_API_KEY ?? "placeholder" });
  }
  return _client;
}
