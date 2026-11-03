import "server-only";
import OpenAI from "openai";

/**
 * Server-only xAI (Grok) client — xAI's API is OpenAI-compatible, so this
 * reuses the `openai` package already installed rather than adding a new
 * one, just pointed at xAI's base URL. Grok only supports the older Chat
 * Completions shape, not OpenAI's newer Responses API (lib/aiProviders.ts's
 * Grok adapter calls `chat.completions.create`, not `responses.create`).
 */
export function getGrokClient() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured — switch this feature back to OpenAI in Settings -> AI Models, or set the key.");
  }
  return new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1", fetch: globalThis.fetch });
}
