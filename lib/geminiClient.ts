import "server-only";
import { GoogleGenAI } from "@google/genai";

/**
 * Server-only Google Gemini client — only import from Server
 * Actions/Route Handlers, never a Client Component. Same pattern as
 * lib/openai.ts.
 */
export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured — switch this feature back to OpenAI in Settings -> AI Models, or set the key.");
  }
  return new GoogleGenAI({ apiKey });
}
