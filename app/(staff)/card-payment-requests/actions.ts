"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendTemplatedEmail } from "@/lib/emailTemplates";

/**
 * Master Admin's decision on a staff request to offer card payment on a
 * quote that's normally bank-transfer-only above STRIPE_PRICE_THRESHOLD
 * (lib/quoteMoney.ts) — see requestCardPaymentOverrideAction
 * (app/(staff)/quotes/actions.ts) for how the request itself is created.
 * Approving only ever ADDS `stripe: true` to the quote's current version's
 * payment_methods — bank transfer stays available too, never removed.
 */
export async function decideCardPaymentOverrideAction(requestId: string, approve: boolean, note: string) {
  const actor = await requireProfile();
  if (!actor.is_master_admin) return { error: "Only Master Admin can decide this." };

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("card_payment_override_requests")
    .select("id, quote_id, requested_by, amount_gbp, status, quotes(quote_number, current_version_id, enquiries(lead_id))")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "Request not found." };
  if (request.status !== "pending") return { error: "This request has already been decided." };

  const quoteInfo = request.quotes as unknown as { quote_number: string; current_version_id: string | null; enquiries: { lead_id: string | null } | null } | null;
  const trimmedNote = note.trim();
  const status = approve ? "approved" : "rejected";

  const { error: updateError } = await supabase
    .from("card_payment_override_requests")
    .update({ status, decided_by: actor.id, decided_at: new Date().toISOString(), decision_note: trimmedNote || null })
    .eq("id", requestId);
  if (updateError) return { error: updateError.message };

  // quote_versions has no update RLS policy for the request-scoped client at
  // all (only quote_versions_insert, 0002_sales_crm.sql) — admin client,
  // same reasoning as the quote_events inserts below.
  const admin = createAdminClient();

  if (approve && quoteInfo?.current_version_id) {
    await admin.from("quote_versions").update({ payment_methods: { stripe: true, bank_transfer: true } }).eq("id", quoteInfo.current_version_id);
  }

  const decidedByName = actor.full_name ?? "Master Admin";
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: approve ? "card_payment_override_approved" : "card_payment_override_rejected",
    entityType: "quote",
    entityId: request.quote_id,
    newValue: { amountGbp: request.amount_gbp, note: trimmedNote || null },
  });

  const leadId = quoteInfo?.enquiries?.lead_id;
  if (leadId) {
    await recordAudit({
      tenantId: actor.tenant_id,
      actorId: actor.id,
      action: approve ? "card_payment_override_approved" : "card_payment_override_rejected",
      entityType: "lead",
      entityId: leadId,
      newValue: { quoteNumber: quoteInfo?.quote_number, amountGbp: request.amount_gbp, note: trimmedNote || null },
    });
  }

  await admin.from("quote_events").insert({
    quote_id: request.quote_id,
    event: approve ? "card_payment_approved" : "card_payment_rejected",
    detail: `${decidedByName} ${approve ? "approved" : "rejected"} card payment (£${Number(request.amount_gbp).toFixed(2)})${trimmedNote ? ` — ${trimmedNote}` : ""}`,
  });

  if (request.requested_by) {
    const { data: requester } = await admin.from("profiles").select("email, full_name").eq("id", request.requested_by).maybeSingle();
    if (requester?.email) {
      await sendTemplatedEmail(admin, {
        tenantId: actor.tenant_id,
        key: "card_payment_override_decided",
        to: requester.email,
        variables: {
          requested_by: requester.full_name ?? "there",
          quote_number: quoteInfo?.quote_number ?? "",
          decision: status,
          decided_by: decidedByName,
          decision_note: trimmedNote ? `Note: ${trimmedNote}` : "",
          link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/quotes/${request.quote_id}`,
        },
      });
    }
  }

  revalidatePath("/card-payment-requests");
  revalidatePath(`/quotes/${request.quote_id}`);
  return { error: null };
}
