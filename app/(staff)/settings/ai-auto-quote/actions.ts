"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { CURRENCIES } from "@/lib/currencies";

export interface AiAutoQuoteSettingsInput {
  enabled: boolean;
  slaHours: number;
  markupPercent: number;
  /** ISO currency every AI-priced quote is created in — 0109_ai_quote_currency.sql. */
  quoteCurrency: string;
  /** Instant quote for a brand-new lead, per source — 0094 (WhatsApp), 0106 (website/email/manual). */
  whatsappAutoQuoteEnabled: boolean;
  websiteAutoQuoteEnabled: boolean;
  emailAutoQuoteEnabled: boolean;
  manualAutoQuoteEnabled: boolean;
}

export async function updateAiAutoQuoteSettingsAction(input: AiAutoQuoteSettingsInput) {
  const { enabled, slaHours, markupPercent, quoteCurrency, whatsappAutoQuoteEnabled, websiteAutoQuoteEnabled, emailAutoQuoteEnabled, manualAutoQuoteEnabled } = input;
  const actor = await requireProfile();
  // tenants_update's RLS policy (0001_foundation.sql) is is_master_admin()
  // only, so this mirrors that at the app layer rather than introducing a
  // permission key nobody but Master Admin could actually use to save.
  if (!actor.is_master_admin) {
    return { error: "Only Master Admin can change this setting." };
  }
  if (!Number.isFinite(slaHours) || slaHours < 1 || slaHours > 500) {
    return { error: "Enter an SLA between 1 and 500 hours." };
  }
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 100) {
    return { error: "Enter a price increase between 0 and 100%." };
  }
  const currencyCode = quoteCurrency.trim().toUpperCase();
  if (!CURRENCIES.some((c) => c.code === currencyCode)) {
    return { error: "Pick a currency for AI quotes." };
  }
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("tenants")
    .select("ai_auto_quote_enabled")
    .eq("id", actor.tenant_id)
    .single();

  // Only stamp ai_auto_quote_enabled_at on the off -> on transition — a
  // resave while already enabled (e.g. just changing the SLA hours) must
  // never push this forward, or every lead's countdown would keep resetting
  // and the SLA would never actually breach.
  const justEnabled = enabled && !current?.ai_auto_quote_enabled;

  const { error } = await supabase
    .from("tenants")
    .update({
      ai_auto_quote_enabled: enabled,
      ai_auto_quote_sla_hours: Math.round(slaHours),
      ...(justEnabled ? { ai_auto_quote_enabled_at: new Date().toISOString() } : {}),
      // No backlog-floor timestamp needed for this one — it only ever fires
      // once, at the instant a brand-new WhatsApp lead is created, so there's
      // no pre-existing backlog flipping it on could suddenly sweep up.
      whatsapp_auto_quote_enabled: whatsappAutoQuoteEnabled,
      website_auto_quote_enabled: websiteAutoQuoteEnabled,
      email_auto_quote_enabled: emailAutoQuoteEnabled,
      manual_auto_quote_enabled: manualAutoQuoteEnabled,
      ai_auto_quote_markup_percent: markupPercent,
      ai_quote_currency: currencyCode,
    })
    .eq("id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "ai_auto_quote_settings_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
    newValue: { enabled, slaHours: Math.round(slaHours), markupPercent, quoteCurrency: currencyCode, whatsappAutoQuoteEnabled, websiteAutoQuoteEnabled, emailAutoQuoteEnabled, manualAutoQuoteEnabled },
  });

  revalidatePath("/settings/ai-auto-quote");
  return { error: null };
}
