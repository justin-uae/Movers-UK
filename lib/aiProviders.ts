import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { getOpenAIClient } from "./openai";
import { getAnthropicClient } from "./anthropicClient";
import { getGeminiClient } from "./geminiClient";
import { getGrokClient } from "./grokClient";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { type AiProvider, type AiFeatureKey, type AiModelChoice, DEFAULT_MODEL_SETTING } from "./aiProviderRegistry";

// The adapter layer behind Settings -> AI Models. Every AI-powered feature
// in the CRM used to call OpenAI directly, each in its own OpenAI-specific
// shape (lib/whatsappAiIntake.ts, lib/aiAutoQuote.ts, lib/emailLeadIntake.ts,
// lib/complexBookingExtraction.ts). Those 4 call-sites now go through
// runAiStructuredTask() below instead, which resolves whichever
// provider/model this tenant has configured for that feature
// (tenants.ai_model_settings, migration 0098) and dispatches to the matching
// vendor SDK — the business logic in each of those 4 files is unchanged,
// only the "ask the model" step is swapped out.
//
// The provider/model registry and plain types live in
// lib/aiProviderRegistry.ts instead of here — that file has no
// `server-only`/vendor-SDK imports, so the Settings -> AI Models client
// form can import it directly without pulling this whole server-only
// adapter layer (and every vendor SDK) into the browser bundle.

export * from "./aiProviderRegistry";

type AiModelSettings = Partial<Record<AiFeatureKey, AiModelChoice>>;

/** Reads this tenant's configured provider/model for one feature, falling
    back to OpenAI/gpt-5.5 (today's hardcoded behaviour) if nothing has been
    set yet — a tenant that never touches Settings -> AI Models sees no
    change at all. Takes whichever Supabase client the caller already has in
    scope (admin or the regular server client — tenants is readable by any
    signed-in member of the tenant, see 0001_foundation.sql's tenants_select
    policy) rather than creating its own. */
export async function getAiModelSetting(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  featureKey: AiFeatureKey,
): Promise<AiModelChoice> {
  const { data } = await supabase.from("tenants").select("ai_model_settings").eq("id", tenantId).single();
  const settings = (data?.ai_model_settings ?? {}) as AiModelSettings;
  return settings[featureKey] ?? DEFAULT_MODEL_SETTING;
}

export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: Buffer; mimeType: string }
  | { type: "pdf"; data: Buffer; fileName: string };

export interface AiHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiTaskParams {
  provider: AiProvider;
  model: string;
  /** System prompt. */
  instructions: string;
  /** Prior turns of a multi-turn conversation — only the WhatsApp intake
      feature uses this; everything else is a single-shot classification. */
  history?: AiHistoryMessage[];
  /** This turn's content — almost always a single text part; Complex
      Booking extraction is the one feature that also sends images/PDFs. */
  content: AiContentPart[];
  schema: Record<string, unknown>;
  schemaName: string;
  timeoutMs: number;
}

function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/** A model occasionally returns malformed/truncated JSON despite strict
    schema mode — without this, that surfaces to the end user (e.g. the
    Complex Booking "Extract with AI" button) as a raw `SyntaxError:
    Unexpected token...` instead of a message that makes sense to someone
    who isn't reading a stack trace. */
function parseJson<T>(raw: string, providerLabel: string, schemaName: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${providerLabel}'s response for ${schemaName} could not be read — try again, or try a different AI provider in Settings -> AI Models.`);
  }
}

async function runOpenAiTask<T>(p: AiTaskParams): Promise<T> {
  const client = getOpenAIClient();
  const turnContent: ResponseInputContent[] = p.content.map((part) => {
    if (part.type === "text") return { type: "input_text", text: part.text };
    if (part.type === "image") return { type: "input_image", detail: "auto", image_url: bufferToDataUrl(part.data, part.mimeType) };
    return { type: "input_file", filename: part.fileName, file_data: bufferToDataUrl(part.data, "application/pdf") };
  });

  const response = await client.responses.create(
    {
      model: p.model,
      instructions: p.instructions,
      input: [...(p.history ?? []).map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: turnContent }],
      text: { format: { type: "json_schema", name: p.schemaName, strict: true, schema: p.schema } },
    },
    { timeout: p.timeoutMs, maxRetries: 0 },
  );

  const raw = response.output_text;
  if (!raw) throw new Error(`OpenAI returned no output for ${p.schemaName}.`);
  return parseJson<T>(raw, "OpenAI", p.schemaName);
}

const CLAUDE_MAX_TOKENS = 4096;

async function runAnthropicTask<T>(p: AiTaskParams): Promise<T> {
  const client = getAnthropicClient();

  const blocks = p.content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    if (part.type === "image") {
      return {
        type: "image" as const,
        source: { type: "base64" as const, media_type: part.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: part.data.toString("base64") },
      };
    }
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: part.data.toString("base64") },
    };
  });

  const message = await client.messages.parse(
    {
      model: p.model,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: p.instructions,
      messages: [...(p.history ?? []).map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: blocks }],
      output_config: { format: jsonSchemaOutputFormat(p.schema as Parameters<typeof jsonSchemaOutputFormat>[0]) },
    },
    { timeout: p.timeoutMs, maxRetries: 0 },
  );

  if (!message.parsed_output) throw new Error(`Claude returned no parsed output for ${p.schemaName}.`);
  return message.parsed_output as T;
}

async function runGeminiTask<T>(p: AiTaskParams): Promise<T> {
  const client = getGeminiClient();

  const historyContents = (p.history ?? []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const turnParts = p.content.map((part) => {
    if (part.type === "text") return { text: part.text };
    if (part.type === "image") return { inlineData: { data: part.data.toString("base64"), mimeType: part.mimeType } };
    return { inlineData: { data: part.data.toString("base64"), mimeType: "application/pdf" } };
  });

  const response = await client.models.generateContent({
    model: p.model,
    contents: [...historyContents, { role: "user", parts: turnParts }],
    config: {
      systemInstruction: p.instructions,
      responseMimeType: "application/json",
      // The installed SDK (>=1.9.0) accepts a plain JSON Schema here and
      // forwards it to the backend's native JSON-schema support — no
      // OpenAPI-subset translation needed for the nullable `type: [..,
      // "null"]` unions this app's schemas already use.
      responseSchema: p.schema as never,
      httpOptions: { timeout: p.timeoutMs },
    },
  });

  const raw = response.text;
  if (!raw) throw new Error(`Gemini returned no output for ${p.schemaName}.`);
  return parseJson<T>(raw, "Gemini", p.schemaName);
}

async function runGrokTask<T>(p: AiTaskParams): Promise<T> {
  const client = getGrokClient();

  const turnContent = p.content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    if (part.type === "image") return { type: "image_url" as const, image_url: { url: bufferToDataUrl(part.data, part.mimeType) } };
    throw new Error("Grok doesn't support PDF uploads for this feature yet — choose another provider in Settings -> AI Models, or upload an image/paste text instead.");
  });

  const response = await client.chat.completions.create(
    {
      model: p.model,
      messages: [
        { role: "system", content: p.instructions },
        ...(p.history ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: turnContent },
      ],
      response_format: { type: "json_schema", json_schema: { name: p.schemaName, strict: true, schema: p.schema } },
    },
    { timeout: p.timeoutMs, maxRetries: 0 },
  );

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error(`Grok returned no output for ${p.schemaName}.`);
  return parseJson<T>(raw, "Grok", p.schemaName);
}

/** The one call every AI feature now goes through instead of hitting a
    vendor SDK directly. */
export async function runAiStructuredTask<T>(params: AiTaskParams): Promise<T> {
  switch (params.provider) {
    case "openai":
      return runOpenAiTask<T>(params);
    case "anthropic":
      return runAnthropicTask<T>(params);
    case "gemini":
      return runGeminiTask<T>(params);
    case "grok":
      return runGrokTask<T>(params);
  }
}
