import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic (Claude) client — only import from Server
 * Actions/Route Handlers, never a Client Component. Same pattern as
 * lib/openai.ts: throws a clear error rather than silently disabling a
 * feature if the key hasn't been configured, naming the Settings page where
 * a Master Admin can switch the affected feature back to OpenAI instead.
 */
export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured — switch this feature back to OpenAI in Settings -> AI Models, or set the key.");
  }
  return new Anthropic({ apiKey });
}
