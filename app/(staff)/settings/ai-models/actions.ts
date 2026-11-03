"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { AI_PROVIDER_REGISTRY, type AiFeatureKey, type AiProvider } from "@/lib/aiProviders";

const FEATURE_KEYS: AiFeatureKey[] = ["whatsapp_intake", "pricing_engine", "email_intake", "complex_booking"];

export async function updateAiModelSettingsAction(settings: Record<AiFeatureKey, { provider: AiProvider; model: string }>) {
  const actor = await requireProfile();
  // tenants_update's RLS policy (0001_foundation.sql) is is_master_admin()
  // only, so this mirrors that at the app layer rather than introducing a
  // permission key nobody but Master Admin could actually use to save —
  // same pattern as updateAiAutoQuoteSettingsAction.
  if (!actor.is_master_admin) {
    return { error: "Only Master Admin can change this setting." };
  }

  for (const key of FEATURE_KEYS) {
    const choice = settings[key];
    if (!choice) return { error: `Missing a selection for ${key}.` };
    const providerInfo = AI_PROVIDER_REGISTRY[choice.provider];
    if (!providerInfo) return { error: `Unknown AI provider for ${key}.` };
    if (!providerInfo.models.some((m) => m.id === choice.model)) {
      return { error: `"${choice.model}" isn't a valid model for ${providerInfo.label}.` };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update({ ai_model_settings: settings }).eq("id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "ai_model_settings_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
    newValue: settings,
  });

  revalidatePath("/settings/ai-models");
  return { error: null };
}
