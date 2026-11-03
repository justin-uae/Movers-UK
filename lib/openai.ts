import "server-only";
import OpenAI from "openai";

/**
 * Server-only OpenAI client. Only import from Server Actions/Route Handlers
 * — never a Client Component. Throws a clear error rather than silently
 * disabling the feature if the API key hasn't been configured yet (same
 * pattern as lib/stripe.ts).
 */
export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured — the Complex Booking form is unavailable until it's set.");
  }
  // The SDK's bundled node-fetch has a known gzip-decompression race ("Premature
  // close") on larger/slower responses (e.g. file uploads) — force native fetch.
  return new OpenAI({ apiKey, fetch: globalThis.fetch });
}
