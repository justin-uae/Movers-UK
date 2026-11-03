// Pure data/types shared by lib/aiProviders.ts (the server-only adapter
// layer) AND the Settings -> AI Models client form
// (app/(staff)/settings/ai-models/AiModelsForm.tsx) — deliberately has no
// `server-only` import and no vendor SDK imports, so it's safe to bundle
// into client code. Model ids/labels aren't secrets; the actual API keys
// and vendor SDK calls live only in lib/aiProviders.ts and the per-provider
// client files, which this file never touches.

export type AiProvider = "openai" | "anthropic" | "gemini" | "grok";

export type AiFeatureKey = "whatsapp_intake" | "pricing_engine" | "email_intake" | "complex_booking";

export interface AiModelChoice {
  provider: AiProvider;
  model: string;
}

/** Model ids change faster than the adapter logic does — this registry is
    the one place to add/rename a selectable model. supportsImages/
    supportsPdf gate which providers the Complex Booking card (the one
    multimodal feature) offers, and let the Grok adapter in
    lib/aiProviders.ts fail clearly instead of silently mishandling a PDF. */
export const AI_PROVIDER_REGISTRY: Record<
  AiProvider,
  { label: string; models: { id: string; label: string }[]; supportsImages: boolean; supportsPdf: boolean }
> = {
  openai: {
    label: "OpenAI",
    models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
    supportsImages: true,
    supportsPdf: true,
  },
  anthropic: {
    label: "Anthropic (Claude)",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    ],
    supportsImages: true,
    supportsPdf: true,
  },
  gemini: {
    label: "Google (Gemini)",
    models: [
      { id: "gemini-pro-latest", label: "Gemini Pro" },
      { id: "gemini-flash-latest", label: "Gemini Flash" },
    ],
    supportsImages: true,
    supportsPdf: true,
  },
  grok: {
    label: "xAI (Grok)",
    models: [{ id: "grok-4.6", label: "Grok 4.6" }],
    supportsImages: true,
    // Unlike the other 3, Grok's PDF-document support isn't confirmed to
    // work the same way as its image input — the Complex Booking adapter
    // (lib/aiProviders.ts) throws a clear error instead of silently
    // mishandling an upload.
    supportsPdf: false,
  },
};

export const DEFAULT_MODEL_SETTING: AiModelChoice = { provider: "openai", model: "gpt-5.5" };

/** Resolves a stored {provider, model} pair (e.g. a quote's own `ai_model`
    column, 0099_quote_ai_model.sql) to its display label (e.g. "Claude
    Opus 5.5") — falls back to the raw model id if the registry no longer
    lists it, so an old quote's label never just breaks because a model got
    renamed/retired from the registry later. */
export function getAiModelLabel(aiModel?: { provider: string; model: string } | null): string | null {
  if (!aiModel) return null;
  const providerInfo = AI_PROVIDER_REGISTRY[aiModel.provider as AiProvider] as (typeof AI_PROVIDER_REGISTRY)[AiProvider] | undefined;
  const modelInfo = providerInfo?.models.find((m) => m.id === aiModel.model);
  return modelInfo?.label ?? aiModel.model;
}
