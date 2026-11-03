"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { sendTemplatedEmail } from "@/lib/emailTemplates";
import { createAndSendQuote, getAiProfileId, LEAD_FOR_SWEEP_COLUMNS, type LeadForSweep } from "@/lib/aiAutoQuote";
import { formatDateAndTime } from "@/lib/formatDate";

export async function claimLeadAction(leadId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS);
  if (!allowed) {
    return { error: "You do not have permission to claim leads." };
  }
  const supabase = await createClient();

  const { data: lead, error } = await supabase.rpc("claim_lead", { p_lead_id: leadId });

  if (error || !lead) {
    return { error: error?.message ?? "This lead has already been claimed." };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_claimed",
    entityType: "lead",
    entityId: leadId,
  });

  revalidatePath("/leads");
  return { error: null };
}

export async function releaseLeadAction(leadId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_RETURN_TO_POOL);
  if (!allowed) {
    return { error: "You do not have permission to release leads back to the pool." };
  }
  const supabase = await createClient();

  const { data: lead, error } = await supabase.rpc("release_lead", { p_lead_id: leadId });

  if (error || !lead) {
    return { error: error?.message ?? "This lead cannot be released right now." };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_released",
    entityType: "lead",
    entityId: leadId,
  });

  revalidatePath("/leads");
  return { error: null };
}

/**
 * A manager (enquiries.reassign) hand-picking who a lead goes to — unlike
 * claim_lead()'s atomic self-claim (open pool only, RPC-guarded race), this
 * is a plain RLS-gated update: leads_update already allows it for anyone
 * holding the permission (0002_sales_crm.sql), on any lead regardless of its
 * current owner or status, since moving a lead off one rep onto another is
 * as much "assign" as picking one up from the open pool is.
 */
export async function assignLeadAction(leadId: string, targetUserId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_REASSIGN);
  if (!allowed) {
    return { error: "You do not have permission to assign leads." };
  }
  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("id, full_name, email").eq("id", targetUserId).maybeSingle();
  if (!target) return { error: "That user could not be found." };

  const { data: lead, error } = await supabase
    .from("leads")
    .update({ assigned_user_id: targetUserId, status: "assigned", claimed_at: new Date().toISOString() })
    .eq("id", leadId)
    .select(
      "id, source, pickup_text, destination_text, travel_date, pickup_time, passenger_count, vehicle_requested, notes, brands(name)",
    )
    .maybeSingle();

  if (error || !lead) {
    return { error: error?.message ?? "Could not assign this lead." };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_assigned_by_manager",
    entityType: "lead",
    entityId: leadId,
    newValue: { assignedTo: targetUserId, assignedToName: target.full_name },
  });

  // Same "lead_assigned" template auto-routing already sends
  // (app/api/leads/website/route.ts) — reused here so a manager's manual
  // assign/reassign notifies the new owner exactly the same way an
  // automatic pool routing does. Never blocks the assignment itself on a
  // mail failure (sendTemplatedEmail logs and swallows).
  const brand = lead.brands as unknown as { name: string } | null;
  await sendTemplatedEmail(supabase, {
    tenantId: actor.tenant_id,
    key: "lead_assigned",
    to: target.email,
    variables: {
      staff_name: target.full_name,
      brand_name: brand?.name ?? "",
      source: lead.source,
      pickup: lead.pickup_text ?? "Not specified",
      destination: lead.destination_text ?? "Not specified",
      travel_date: lead.travel_date ? formatDateAndTime(lead.travel_date, lead.pickup_time) : "Not specified",
      passenger_count: lead.passenger_count ? String(lead.passenger_count) : "Not specified",
      vehicle_requested: lead.vehicle_requested ?? "Not specified",
      notes: lead.notes ?? "",
      link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/leads/${leadId}`,
    },
  });

  // Assigning directly to the AI role's profile is treated the same as an
  // SLA breach (lib/aiAutoQuote.ts) — a quote is priced and sent
  // immediately rather than waiting for the time limit. Uses the admin
  // client, same as the SLA sweep and the WhatsApp webhook, since this is
  // the system acting on the AI profile's behalf, not the actor's own
  // session — best-effort throughout: the assignment above has already
  // succeeded regardless of anything below, so a failure here is reported
  // back as a warning, never as the action's own error.
  let warning: string | null = null;
  let quoted = false;
  const admin = createAdminClient();
  const aiProfileId = await getAiProfileId(admin, actor.tenant_id);
  if (aiProfileId && targetUserId === aiProfileId) {
    const { data: fullLead } = await admin.from("leads").select(LEAD_FOR_SWEEP_COLUMNS).eq("id", leadId).single();
    const l = fullLead as LeadForSweep | null;
    if (!l) {
      warning = "Lead assigned to AI, but it could not be re-read to create a quote automatically.";
    } else if (!l.pickup_text || !l.destination_text || !l.customer_id || !l.brand_id) {
      warning = "Lead assigned to AI, but it's missing pickup, destination or customer details, so no quote was created automatically.";
    } else if (l.travel_date && l.travel_date < new Date().toISOString().slice(0, 10)) {
      warning = "Lead assigned to AI, but its travel date has already passed, so no quote was created automatically.";
    } else {
      try {
        await createAndSendQuote(admin, l, aiProfileId, { trigger: "manual_assign", alsoSendWhatsApp: true, actorId: actor.id });
        quoted = true;
      } catch (err) {
        console.error(`assignLeadAction: instant AI auto-quote failed for lead ${leadId}:`, err);
        warning = "Lead assigned to AI, but the automatic quote could not be created — quote it manually instead.";
      }
    }
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/quotes");
  return { error: null, warning, quoted };
}

export interface EditLeadInput {
  reason: string;
  pickupText?: string | null;
  destinationText?: string | null;
  travelDate?: string | null;
  pickupTime?: string | null;
  returnTrip?: boolean;
  returnDate?: string | null;
  returnTime?: string | null;
  passengerCount?: number | null;
  luggageCount?: number | null;
  vehicleRequested?: string | null;
  notes?: string | null;
}

const EDITABLE_FIELDS: { key: keyof EditLeadInput; column: string }[] = [
  { key: "pickupText", column: "pickup_text" },
  { key: "destinationText", column: "destination_text" },
  { key: "travelDate", column: "travel_date" },
  { key: "pickupTime", column: "pickup_time" },
  { key: "returnTrip", column: "return_trip" },
  { key: "returnDate", column: "return_date" },
  { key: "returnTime", column: "return_time" },
  { key: "passengerCount", column: "passenger_count" },
  { key: "luggageCount", column: "luggage_count" },
  { key: "vehicleRequested", column: "vehicle_requested" },
  { key: "notes", column: "notes" },
];

/**
 * Lets a lead's assigned owner correct its journey/intake details after
 * capture — required reason, logged append-only to lead_edits (see
 * 0076_lead_edits.sql) so the lead detail page can show a proper history.
 * No customer/supplier notification: a lead is pre-quote and internal-only,
 * unlike amendBookingAction's post-payment edits which have to tell people
 * who already committed to something.
 */
export async function editLeadAction(leadId: string, input: EditLeadInput) {
  const actor = await requireProfile();
  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required to edit a lead." };

  const supabase = await createClient();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (!lead) return { error: "Lead not found." };
  if (lead.assigned_user_id !== actor.id) {
    return { error: "Only this lead's assigned owner can edit it." };
  }

  const update: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const { key, column } of EDITABLE_FIELDS) {
    if (!(key in input)) continue;
    const newValue = input[key];
    const oldValue = (lead as Record<string, unknown>)[column];
    if (newValue === oldValue) continue;
    update[column] = newValue;
    changes[column] = { from: oldValue, to: newValue };
  }

  if (Object.keys(update).length === 0) {
    return { error: "Change at least one field." };
  }

  const { error: updateError } = await supabase.from("leads").update(update).eq("id", leadId);
  if (updateError) return { error: updateError.message };

  const { error: editError } = await supabase.from("lead_edits").insert({
    tenant_id: actor.tenant_id,
    lead_id: leadId,
    edited_by: actor.id,
    reason,
    changes,
  });
  if (editError) return { error: editError.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_edited",
    entityType: "lead",
    entityId: leadId,
    reason,
    newValue: changes,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}

export interface EditLeadLegInput {
  reason: string;
  pickupAddress?: string;
  destinationAddress?: string;
  pickupDate?: string | null;
  pickupTime?: string | null;
  returnDate?: string | null;
  returnTime?: string | null;
  passengerCount?: number | null;
  luggageCount?: number | null;
  specialRequirements?: string | null;
}

const EDITABLE_LEG_FIELDS: { key: keyof EditLeadLegInput; column: string }[] = [
  { key: "pickupAddress", column: "pickup_address" },
  { key: "destinationAddress", column: "destination_address" },
  { key: "pickupDate", column: "pickup_date" },
  { key: "pickupTime", column: "pickup_time" },
  { key: "returnDate", column: "return_date" },
  { key: "returnTime", column: "return_time" },
  { key: "passengerCount", column: "passenger_count" },
  { key: "luggageCount", column: "luggage_count" },
  { key: "specialRequirements", column: "special_requirements" },
];

/**
 * Same idea as editLeadAction, but for one leg of a multi-leg (complex
 * booking) itinerary — editLeadAction only ever touched the leads table's
 * own single pickup/destination/date snapshot (in practice just leg 1's
 * values at creation time), leaving every other enquiry_legs row, and even
 * leg 1's *real* row, with no edit path at all. This updates the actual
 * enquiry_legs row instead — the one the quote is built from — and logs to
 * the same lead_edits history, prefixed with which leg changed.
 */
export async function editLeadLegAction(legId: string, input: EditLeadLegInput) {
  const actor = await requireProfile();
  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required to edit a journey leg." };

  const supabase = await createClient();

  const { data: leg } = await supabase
    .from("enquiry_legs")
    .select("*, enquiries(id, lead_id, assigned_user_id, tenant_id)")
    .eq("id", legId)
    .single();
  if (!leg) return { error: "Journey leg not found." };

  const enquiry = leg.enquiries as unknown as {
    id: string;
    lead_id: string | null;
    assigned_user_id: string | null;
    tenant_id: string;
  } | null;
  if (!enquiry) return { error: "Journey leg not found." };
  if (enquiry.assigned_user_id !== actor.id) {
    return { error: "Only this lead's assigned owner can edit its journey legs." };
  }
  if (!enquiry.lead_id) {
    return { error: "This journey leg is no longer linked to a lead." };
  }

  const update: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const { key, column } of EDITABLE_LEG_FIELDS) {
    if (!(key in input)) continue;
    const newValue = input[key];
    const oldValue = (leg as Record<string, unknown>)[column];
    if (newValue === oldValue) continue;
    update[column] = newValue;
    changes[`leg_${leg.sequence}_${column}`] = { from: oldValue, to: newValue };
  }

  if (Object.keys(update).length === 0) {
    return { error: "Change at least one field." };
  }

  const { error: updateError } = await supabase.from("enquiry_legs").update(update).eq("id", legId);
  if (updateError) return { error: updateError.message };

  const { error: editError } = await supabase.from("lead_edits").insert({
    tenant_id: actor.tenant_id,
    lead_id: enquiry.lead_id,
    edited_by: actor.id,
    reason,
    changes,
  });
  if (editError) return { error: editError.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_leg_edited",
    entityType: "enquiry_leg",
    entityId: legId,
    reason,
    newValue: changes,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${enquiry.lead_id}`);
  return { error: null };
}

/**
 * Fast path from an already-assigned lead straight into the quote builder —
 * creates the enquiry + first journey leg pre-filled from the lead's
 * captured details (customer is already resolved on the lead by the
 * website webhook) and redirects into /quotes/new. The manual 4-step
 * enquiry wizard at /leads/new stays for phone/walk-in enquiries with no
 * originating lead.
 *
 * A lead only flips to "converted" once a real quote exists for it (see
 * createQuoteAction) — not just because an enquiry was started. If the
 * enquiry was already created on a previous click (e.g. the user left the
 * quote builder without saving), this resumes that same enquiry instead of
 * creating a duplicate.
 */
export async function createEnquiryFromLeadAction(leadId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) {
    return { error: "You do not have permission to create enquiries." };
  }

  const supabase = await createClient();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (!lead || lead.assigned_user_id !== actor.id) {
    return { error: "This lead is not assigned to you." };
  }
  if (!lead.customer_id) {
    return { error: "This lead has no linked customer yet." };
  }

  const { data: existingEnquiry } = await supabase
    .from("enquiries")
    .select("id")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingEnquiry) {
    redirect(`/quotes/new?enquiryId=${existingEnquiry.id}`);
  }

  const { data: enquiry, error: enquiryError } = await supabase
    .from("enquiries")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: lead.brand_id,
      lead_id: lead.id,
      customer_id: lead.customer_id,
      assigned_user_id: actor.id,
      status: "new",
      created_by: actor.id,
    })
    .select()
    .single();

  if (enquiryError || !enquiry) {
    return { error: enquiryError?.message ?? "Could not create the enquiry." };
  }

  // Website-submitted pickup/return time is free text (sites send whatever
  // their <input type="time"> gives them, usually "HH:MM" but not
  // guaranteed) — enquiry_legs.pickup_time/return_time are a real Postgres
  // `time`, so only carry a value across when it actually parses as one;
  // anything else stays visible on the lead itself rather than breaking
  // quote creation.
  const asPgTime = (value: string | null) => (value && /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : null);

  const { error: legError } = await supabase.from("enquiry_legs").insert({
    enquiry_id: enquiry.id,
    sequence: 1,
    journey_type: lead.return_trip ? "return" : "one_way",
    pickup_address: lead.pickup_text ?? "Unknown",
    destination_address: lead.destination_text ?? "Unknown",
    pickup_date: lead.travel_date,
    pickup_time: asPgTime(lead.pickup_time),
    return_date: lead.return_trip ? lead.return_date : null,
    return_time: lead.return_trip ? asPgTime(lead.return_time) : null,
    passenger_count: lead.passenger_count,
    luggage_count: lead.luggage_count,
    special_requirements:
      [lead.vehicle_requested ? `Vehicle requested: ${lead.vehicle_requested}` : null, lead.notes]
        .filter(Boolean)
        .join(" — ") || null,
  });

  if (legError) {
    return { error: legError.message };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "enquiry_created_from_lead",
    entityType: "enquiry",
    entityId: enquiry.id,
    previousValue: { leadId: lead.id },
  });

  revalidatePath("/leads");
  redirect(`/quotes/new?enquiryId=${enquiry.id}`);
}
