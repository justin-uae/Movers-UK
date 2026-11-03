"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

/**
 * Staff controls for a quote's automatic reminders (Reminders panel on the
 * quote page). Gated to Master Admin, the quote's own salesperson/creator,
 * or anyone who can send quotes — then written with the admin client, since
 * the customer-level opt-out lives on the customer row, whose own RLS
 * (customers_update, 0078) is narrower than "can manage this quote".
 */
async function loadManageableQuote(quoteId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, tenant_id, quote_number, customer_id, created_by, reminders_paused_at, enquiries(assigned_user_id)")
    .eq("id", quoteId)
    .single();
  if (!quote) return { actor, quote: null, error: "Quote not found." };

  const assignedUserId = (quote.enquiries as unknown as { assigned_user_id: string | null } | null)?.assigned_user_id;
  const allowed =
    actor.is_master_admin ||
    assignedUserId === actor.id ||
    quote.created_by === actor.id ||
    (await hasPermission(actor, PERMISSIONS.QUOTES_SEND));
  if (!allowed) return { actor, quote: null, error: "You can't change reminders on this quote." };
  return { actor, quote, error: null };
}

export async function pauseQuoteRemindersAction(quoteId: string) {
  const { actor, quote, error } = await loadManageableQuote(quoteId);
  if (!quote) return { error };
  if (quote.reminders_paused_at) return { error: null };

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("quotes")
    .update({ reminders_paused_at: new Date().toISOString(), reminders_pause_reason: `Paused by ${actor.full_name}` })
    .eq("id", quoteId);
  if (updateError) return { error: updateError.message };
  await admin.from("quote_events").insert({ quote_id: quoteId, event: "reminders_paused", detail: `Paused by ${actor.full_name}` });
  await recordAudit({ tenantId: actor.tenant_id, actorId: actor.id, action: "quote_reminders_paused", entityType: "quote", entityId: quoteId });

  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}

export async function resumeQuoteRemindersAction(quoteId: string) {
  const { actor, quote, error } = await loadManageableQuote(quoteId);
  if (!quote) return { error };
  if (!quote.reminders_paused_at) return { error: null };

  const admin = createAdminClient();
  // reminders_resumed_at moves the "has the customer replied?" check forward
  // so the reply that caused an automatic pause doesn't re-pause it straight away.
  const { error: updateError } = await admin
    .from("quotes")
    .update({ reminders_paused_at: null, reminders_pause_reason: null, reminders_resumed_at: new Date().toISOString() })
    .eq("id", quoteId);
  if (updateError) return { error: updateError.message };
  await admin.from("quote_events").insert({ quote_id: quoteId, event: "reminders_resumed", detail: `Resumed by ${actor.full_name}` });
  await recordAudit({ tenantId: actor.tenant_id, actorId: actor.id, action: "quote_reminders_resumed", entityType: "quote", entityId: quoteId });

  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}

/** Undo a customer's "Stop reminders" — only on the customer's own say-so (e.g. they asked to hear from us again). */
export async function clearReminderOptOutAction(quoteId: string) {
  const { actor, quote, error } = await loadManageableQuote(quoteId);
  if (!quote) return { error };

  const admin = createAdminClient();
  const { error: updateError } = await admin.from("customers").update({ reminders_opted_out_at: null }).eq("id", quote.customer_id);
  if (updateError) return { error: updateError.message };
  await admin.from("quote_events").insert({ quote_id: quoteId, event: "reminders_opt_out_cleared", detail: `Allowed again by ${actor.full_name}` });
  await recordAudit({ tenantId: actor.tenant_id, actorId: actor.id, action: "quote_reminders_opt_out_cleared", entityType: "customer", entityId: quote.customer_id });

  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}
