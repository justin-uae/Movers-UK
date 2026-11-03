"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { extractComplexBooking, type ComplexBookingExtraction } from "@/lib/complexBookingExtraction";
import { getAiModelSetting } from "@/lib/aiProviders";
import type { ComplexBookingLegInput } from "@/app/(staff)/leads/complex-booking/actions";

/**
 * Turns everything already captured on a lead (journey details, notes,
 * customer info) into the same loose free-text shape the complex-booking
 * extraction expects from a pasted email — so one lead with several trips
 * mentioned in its notes, or just messy/under-structured intake, can be run
 * through the exact same AI leg-extraction the paste/upload flow uses,
 * instead of writing a second, parallel extraction prompt.
 */
function buildLeadSummaryText(lead: {
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  return_trip: boolean;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  vehicle_requested: string | null;
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
  if (lead.pickup_text) lines.push(`Pickup: ${lead.pickup_text}`);
  if (lead.destination_text) lines.push(`Destination: ${lead.destination_text}`);
  if (lead.travel_date) lines.push(`Travel date: ${lead.travel_date}${lead.pickup_time ? ` at ${lead.pickup_time}` : ""}`);
  if (lead.return_trip) {
    lines.push(`Return trip: yes${lead.return_date ? ` — ${lead.return_date}${lead.return_time ? ` at ${lead.return_time}` : ""}` : ""}`);
  }
  if (lead.passenger_count != null) lines.push(`Passengers: ${lead.passenger_count}`);
  if (lead.luggage_count != null) lines.push(`Luggage: ${lead.luggage_count}`);
  if (lead.vehicle_requested) lines.push(`Vehicle requested: ${lead.vehicle_requested}`);
  if (lead.notes) lines.push(`Notes: ${lead.notes}`);
  return lines.join("\n");
}

const LEAD_SELECT =
  "id, tenant_id, brand_id, assigned_user_id, customer_id, pickup_text, destination_text, travel_date, pickup_time, return_trip, return_date, return_time, passenger_count, luggage_count, vehicle_requested, notes, raw_payload, customers(company_name, contact_name, email, phone)";

async function loadOwnedLead(leadId: string, actorId: string) {
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select(LEAD_SELECT).eq("id", leadId).maybeSingle();
  if (!lead || lead.assigned_user_id !== actorId) return { supabase, lead: null };
  return { supabase, lead };
}

/**
 * A lead commonly gets a quick single-leg enquiry via "Create Quote" before
 * anyone realises it's actually a multi-day/multi-leg booking — blocking
 * conversion just because *an* enquiry exists would make this feature
 * useless for exactly the case it's for. The only thing that actually can't
 * be undone is a quote: once one's been sent, the legs it was built from are
 * a commitment, not a draft. So conversion stays available right up until
 * that point, reusing the existing (quote-less) enquiry and replacing its
 * legs rather than creating a second enquiry on the same lead.
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
    const warning = data.legs.length === 0 ? "Couldn't turn this lead's details into a journey leg — add one manually below." : null;
    return { data, warning, error: null };
  } catch (err) {
    return { data: null, warning: null, error: err instanceof Error ? err.message : "Could not process this lead." };
  }
}

export async function convertLeadToComplexBookingAction(
  leadId: string,
  input: { legs: ComplexBookingLegInput[]; internalNotes: string | null },
): Promise<{ error: string | null }> {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { error: "You do not have permission to add enquiries." };

  const { supabase, lead } = await loadOwnedLead(leadId, actor.id);
  if (!lead) return { error: "This lead is not assigned to you." };
  if (!lead.customer_id) return { error: "This lead has no linked customer yet." };

  if (input.legs.length === 0) return { error: "Add at least one journey leg." };
  for (const leg of input.legs) {
    if (!leg.pickupAddress.trim() || !leg.destinationAddress.trim()) {
      return { error: "Every leg needs a pickup and destination address." };
    }
  }

  // Re-checked here, not just when the AI step ran — the review step can sit
  // open for a while, long enough for a quote to have been started from this
  // lead in the meantime.
  const { enquiryId: existingEnquiryId, hasQuote } = await getLeadEnquiryState(supabase, leadId);
  if (hasQuote) {
    return { error: "This lead already has a quote — convert it before quoting starts, not after." };
  }

  const firstLeg = input.legs[0]!;
  const existingPayload = (lead.raw_payload as Record<string, unknown> | null) ?? {};

  const { error: leadUpdateError } = await supabase
    .from("leads")
    .update({
      is_complex_booking: true,
      pickup_text: firstLeg.pickupAddress,
      destination_text: firstLeg.destinationAddress,
      travel_date: firstLeg.pickupDate,
      passenger_count: firstLeg.passengerCount,
      notes: input.internalNotes,
      raw_payload: { ...existingPayload, convertedToComplexBooking: true, convertedAt: new Date().toISOString() },
    })
    .eq("id", leadId);
  if (leadUpdateError) return { error: leadUpdateError.message };

  let enquiryId = existingEnquiryId;
  if (enquiryId) {
    // A quote-less enquiry already exists (typically from an earlier
    // "Create Quote" click) — reuse it and replace its legs rather than
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

  const { error: legsError } = await supabase.from("enquiry_legs").insert(
    input.legs.map((leg, i) => ({
      enquiry_id: enquiryId,
      sequence: i + 1,
      journey_type: leg.journeyType,
      pickup_address: leg.pickupAddress,
      destination_address: leg.destinationAddress,
      pickup_date: leg.pickupDate,
      pickup_time: leg.pickupTime,
      return_date: leg.journeyType === "return" ? leg.returnDate : null,
      return_time: leg.journeyType === "return" ? leg.returnTime : null,
      passenger_count: leg.passengerCount,
      luggage_count: leg.luggageCount,
      vehicle_description: leg.vehicleDescription,
      wheelchair_required: leg.wheelchairRequired,
      child_seats: leg.childSeats,
      special_requirements: leg.specialRequirements,
    })),
  );
  if (legsError) return { error: legsError.message };

  await recordAudit({
    tenantId: lead.tenant_id,
    actorId: actor.id,
    action: "lead_converted_to_complex_booking",
    entityType: "lead",
    entityId: leadId,
    newValue: { legCount: input.legs.length, enquiryId },
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
      journey_legs: { from: 1, to: input.legs.length },
    },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  redirect(`/quotes/new?enquiryId=${enquiryId}`);
}
