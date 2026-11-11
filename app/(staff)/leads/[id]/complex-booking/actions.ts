"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { extractComplexBooking, type ComplexBookingExtraction } from "@/lib/complexBookingExtraction";
import { getAiModelSetting } from "@/lib/aiProviders";
import type { ComplexBookingMoveInput } from "@/app/(staff)/leads/complex-booking/actions";
import { moveDetailsSummary, parseMoveDetails, type MoveDetails } from "@/lib/moveDetails";

/**
 * Turns everything already captured on a lead (move details, notes,
 * customer info) into the same loose free-text shape the complex-booking
 * extraction expects from a pasted email — so messy/under-structured intake
 * can be run through the exact same AI extraction the paste/upload flow
 * uses, instead of writing a second, parallel extraction prompt.
 */
function buildLeadSummaryText(lead: MoveDetails & {
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  notes: string | null;
  customers: { company_name: string | null; contact_name: string; email: string | null; phone: string | null } | null;
}): string {
  const lines: string[] = [];
  const c = lead.customers;
  if (c) {
    lines.push(`Customer: ${c.company_name || c.contact_name}`);
    if (c.company_name && c.contact_name) lines.push(`Contact: ${c.contact_name}`);
    if (c.email) lines.push(`Email: ${c.email}`);
    if (c.phone) lines.push(`Phone: ${c.phone}`);
  }
  if (lead.pickup_text) lines.push(`Moving from: ${lead.pickup_text}`);
  if (lead.destination_text) lines.push(`Moving to: ${lead.destination_text}`);
  if (lead.travel_date) lines.push(`Move date: ${lead.travel_date}${lead.pickup_time ? ` at ${lead.pickup_time}` : ""}`);
  const details = moveDetailsSummary(lead);
  if (details) lines.push(details);
  if (lead.notes) lines.push(`Notes: ${lead.notes}`);
  return lines.join("\n");
}

const LEAD_SELECT =
  "id, tenant_id, brand_id, assigned_user_id, customer_id, pickup_text, destination_text, travel_date, pickup_time, move_type, property_type, rooms, estimated_boxes, pickup_floor, destination_floor, lift_available, packing_needed, dismantling_needed, assembly_needed, storage_needed, fragile_items, notes, raw_payload, customers(company_name, contact_name, email, phone)";

async function loadOwnedLead(leadId: string, actorId: string) {
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select(LEAD_SELECT).eq("id", leadId).maybeSingle();
  if (!lead || lead.assigned_user_id !== actorId) return { supabase, lead: null };
  return { supabase, lead };
}

/**
 * A lead commonly gets a quick enquiry via "Create Quote" before anyone
 * realises its details need a proper AI read — blocking conversion just
 * because *an* enquiry exists would make this feature useless for exactly
 * the case it's for. The only thing that actually can't be undone is a
 * quote: once one's been sent, the move it was built from is a commitment,
 * not a draft. So conversion stays available right up until that point,
 * reusing the existing (quote-less) enquiry and replacing its move rather
 * than creating a second enquiry on the same lead.
 */
async function getLeadEnquiryState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<{ enquiryId: string | null; hasQuote: boolean }> {
  const { data: enquiry } = await supabase
    .from("enquiries")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!enquiry) return { enquiryId: null, hasQuote: false };

  const { data: quote } = await supabase.from("quotes").select("id").eq("enquiry_id", enquiry.id).limit(1).maybeSingle();
  return { enquiryId: enquiry.id, hasQuote: !!quote };
}

export async function extractComplexBookingFromLeadAction(
  leadId: string,
): Promise<{ data: ComplexBookingExtraction | null; warning: string | null; error: string | null }> {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { data: null, warning: null, error: "You do not have permission to add enquiries." };

  const { supabase, lead } = await loadOwnedLead(leadId, actor.id);
  if (!lead) return { data: null, warning: null, error: "This lead is not assigned to you." };
  if (!lead.customer_id) return { data: null, warning: null, error: "This lead has no linked customer yet." };
  if ((await getLeadEnquiryState(supabase, leadId)).hasQuote) {
    return { data: null, warning: null, error: "This lead already has a quote — convert it before quoting starts, not after." };
  }

  const summary = buildLeadSummaryText(lead as unknown as Parameters<typeof buildLeadSummaryText>[0]);
  if (!summary.trim()) {
    return { data: null, warning: null, error: "This lead has no details yet for AI to work from." };
  }

  try {
    const aiModel = await getAiModelSetting(supabase, actor.tenant_id, "complex_booking");
    const data = await extractComplexBooking({ pastedText: summary, file: null, aiModel });
    const warning =
      !data.move.pickup_address.trim() || !data.move.destination_address.trim()
        ? "Couldn't find both addresses in this lead's details — fill them in below."
        : null;
    return { data, warning, error: null };
  } catch (err) {
    return { data: null, warning: null, error: err instanceof Error ? err.message : "Could not process this lead." };
  }
}

export async function convertLeadToComplexBookingAction(
  leadId: string,
  input: { move: ComplexBookingMoveInput; internalNotes: string | null },
): Promise<{ error: string | null }> {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { error: "You do not have permission to add enquiries." };

  const { supabase, lead } = await loadOwnedLead(leadId, actor.id);
  if (!lead) return { error: "This lead is not assigned to you." };
  if (!lead.customer_id) return { error: "This lead has no linked customer yet." };

  const move = input.move;
  if (!move.pickupAddress.trim() || !move.destinationAddress.trim()) {
    return { error: "Enter both the moving-from and moving-to address." };
  }
  const moveDetails = parseMoveDetails(move.moveDetails);

  // Re-checked here, not just when the AI step ran — the review step can sit
  // open for a while, long enough for a quote to have been started from this
  // lead in the meantime.
  const { enquiryId: existingEnquiryId, hasQuote } = await getLeadEnquiryState(supabase, leadId);
  if (hasQuote) {
    return { error: "This lead already has a quote — convert it before quoting starts, not after." };
  }

  const existingPayload = (lead.raw_payload as Record<string, unknown> | null) ?? {};

  const { error: leadUpdateError } = await supabase
    .from("leads")
    .update({
      is_complex_booking: true,
      pickup_text: move.pickupAddress,
      destination_text: move.destinationAddress,
      travel_date: move.moveDate,
      pickup_time: move.moveTime,
      ...moveDetails,
      notes: input.internalNotes,
      raw_payload: { ...existingPayload, convertedToComplexBooking: true, convertedAt: new Date().toISOString() },
    })
    .eq("id", leadId);
  if (leadUpdateError) return { error: leadUpdateError.message };

  let enquiryId = existingEnquiryId;
  if (enquiryId) {
    // A quote-less enquiry already exists (typically from an earlier
    // "Create Quote" click) — reuse it and replace its move rather than
    // leaving a second, orphaned enquiry behind.
    const { error: enquiryUpdateError } = await supabase
      .from("enquiries")
      .update({ internal_notes: input.internalNotes, is_complex_booking: true })
      .eq("id", enquiryId);
    if (enquiryUpdateError) return { error: enquiryUpdateError.message };

    const { error: deleteLegsError } = await supabase.from("enquiry_legs").delete().eq("enquiry_id", enquiryId);
    if (deleteLegsError) return { error: deleteLegsError.message };
  } else {
    const { data: enquiry, error: enquiryError } = await supabase
      .from("enquiries")
      .insert({
        tenant_id: lead.tenant_id,
        brand_id: lead.brand_id,
        lead_id: leadId,
        customer_id: lead.customer_id,
        assigned_user_id: actor.id,
        status: "new",
        internal_notes: input.internalNotes,
        created_by: actor.id,
        is_complex_booking: true,
      })
      .select()
      .single();
    if (enquiryError || !enquiry) return { error: enquiryError?.message ?? "Could not create the enquiry." };
    enquiryId = enquiry.id;
  }

  const { error: legsError } = await supabase.from("enquiry_legs").insert({
    enquiry_id: enquiryId!,
    sequence: 1,
    pickup_address: move.pickupAddress,
    destination_address: move.destinationAddress,
    pickup_date: move.moveDate,
    pickup_time: move.moveTime,
    ...moveDetails,
    van_size: move.vanSize,
    special_requirements: move.specialRequirements,
  });
  if (legsError) return { error: legsError.message };

  await recordAudit({
    tenantId: lead.tenant_id,
    actorId: actor.id,
    action: "lead_converted_to_complex_booking",
    entityType: "lead",
    entityId: leadId,
    newValue: { enquiryId },
  });

  // Reuses lead_edits (LeadEditHistory) rather than a new table/panel — it's
  // already the lead detail page's visible, ungated timeline of what
  // happened to this lead, and a before/after diff is exactly its shape.
  await supabase.from("lead_edits").insert({
    tenant_id: lead.tenant_id,
    lead_id: leadId,
    edited_by: actor.id,
    reason: "Converted to a complex booking using AI",
    changes: {
      is_complex_booking: { from: false, to: true },
    },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  redirect(`/quotes/new?enquiryId=${enquiryId}`);
}
