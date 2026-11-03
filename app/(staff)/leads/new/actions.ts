"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { findDuplicateCustomer, type DuplicateCustomerMatch } from "@/lib/customerDuplicates";
import { createAdminClient } from "@/lib/supabase/admin";
import { instantAutoQuoteNewLead } from "@/lib/aiAutoQuote";

export async function createEnquiryAction(
  _prevState: { error: string | null; duplicate?: DuplicateCustomerMatch | null },
  formData: FormData,
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { error: "You do not have permission to add enquiries." };

  const supabase = await createClient();

  let customerId = String(formData.get("existingCustomerId") ?? "").trim();
  if (!customerId) {
    const contactName = String(formData.get("newContactName") ?? "").trim();
    if (!contactName) {
      return { error: "Select an existing customer or enter a new contact name." };
    }

    const newEmail = String(formData.get("newEmail") ?? "").trim() || null;
    const newPhone = String(formData.get("newPhone") ?? "").trim() || null;

    if (formData.get("confirmedDuplicateCustomer") !== "true") {
      const duplicate = await findDuplicateCustomer(supabase, actor.tenant_id, newEmail, newPhone);
      if (duplicate) return { error: null, duplicate };
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        tenant_id: actor.tenant_id,
        contact_name: contactName,
        company_name: String(formData.get("newCompanyName") ?? "").trim() || null,
        email: newEmail,
        phone: newPhone,
        account_manager_id: actor.id,
      })
      .select()
      .single();

    if (customerError || !customer) {
      return { error: customerError?.message ?? "Could not create the customer." };
    }
    customerId = customer.id;
  }

  const pickupAddress = String(formData.get("pickupAddress") ?? "").trim();
  const destinationAddress = String(formData.get("destinationAddress") ?? "").trim();
  if (!pickupAddress || !destinationAddress) {
    return { error: "Pickup and destination are required." };
  }

  const pickupDate = String(formData.get("pickupDate") ?? "").trim() || null;
  const pickupTime = String(formData.get("pickupTime") ?? "").trim() || null;
  const journeyType = String(formData.get("journeyType") ?? "one_way");
  const returnDate = journeyType === "return" ? String(formData.get("returnDate") ?? "").trim() || null : null;
  const returnTime = journeyType === "return" ? String(formData.get("returnTime") ?? "").trim() || null : null;
  const luggageCount = Number(formData.get("luggageCount") ?? 0) || null;
  const passengerCount = Number(formData.get("passengerCount") ?? 0) || null;
  const specialRequirements = String(formData.get("specialRequirements") ?? "").trim() || null;

  // Manual/walk-in entries create a real lead — assigned directly to the
  // creator (status "assigned" rather than "new" skips route_lead()'s
  // auto-routing) — so it shows up on the Leads page like any other lead,
  // instead of only existing as an enquiry reachable nowhere else.
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: actor.default_brand_id,
      source: "manual",
      status: "assigned",
      customer_id: customerId,
      assigned_user_id: actor.id,
      claimed_at: new Date().toISOString(),
      pickup_text: pickupAddress,
      destination_text: destinationAddress,
      travel_date: pickupDate,
      // Mirrored onto the lead (not just the enquiry leg below) because the
      // instant AI quote prices from the lead's own fields, same as every
      // other lead source — without these a return trip would price one-way.
      pickup_time: pickupTime,
      return_trip: journeyType === "return",
      return_date: returnDate,
      return_time: returnTime,
      luggage_count: luggageCount,
      passenger_count: passengerCount,
      notes: specialRequirements,
    })
    .select()
    .single();

  if (leadError || !lead) {
    return { error: leadError?.message ?? "Could not create the lead." };
  }

  const { data: enquiry, error: enquiryError } = await supabase
    .from("enquiries")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: actor.default_brand_id,
      lead_id: lead.id,
      customer_id: customerId,
      assigned_user_id: actor.id,
      status: "new",
      internal_notes: String(formData.get("internalNotes") ?? "").trim() || null,
      created_by: actor.id,
    })
    .select()
    .single();

  if (enquiryError || !enquiry) {
    return { error: enquiryError?.message ?? "Could not create the enquiry." };
  }

  const childSeats = Number(formData.get("childSeats") ?? 0) || 0;

  const pickupLat = formData.get("pickupLat") ? Number(formData.get("pickupLat")) : null;
  const pickupLng = formData.get("pickupLng") ? Number(formData.get("pickupLng")) : null;
  const destinationLat = formData.get("destinationLat") ? Number(formData.get("destinationLat")) : null;
  const destinationLng = formData.get("destinationLng") ? Number(formData.get("destinationLng")) : null;

  const { error: legError } = await supabase.from("enquiry_legs").insert({
    enquiry_id: enquiry.id,
    sequence: 1,
    journey_type: journeyType,
    pickup_address: pickupAddress,
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    destination_address: destinationAddress,
    destination_lat: destinationLat,
    destination_lng: destinationLng,
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    return_date: returnDate,
    return_time: returnTime,
    passenger_count: passengerCount,
    luggage_count: luggageCount,
    vehicle_type_id: String(formData.get("vehicleTypeId") ?? "").trim() || null,
    wheelchair_required: formData.get("wheelchairRequired") === "on",
    child_seats: childSeats,
    special_requirements: specialRequirements,
  });

  if (legError) {
    return { error: legError.message };
  }

  // The lead flips to "converted" once a real quote exists for it (see
  // createQuoteAction), not just because an enquiry was started — so if the
  // quote builder is abandoned, "Create Quote" is still reachable from here.
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_created_manually",
    entityType: "lead",
    entityId: lead.id,
    newValue: { customerId, pickupAddress, destinationAddress, enquiryId: enquiry.id },
  });

  // Optional instant AI quote (Settings -> AI Assistant -> "Instant quote for
  // manually added leads", off by default) — same as a WhatsApp lead. Run
  // inline, like an assign-to-AI, so staff land on the lead with its quote
  // already there; if it's off or can't quote this one, they go straight to
  // the quote builder as before (never both — that would mean two quotes).
  const instant = await instantAutoQuoteNewLead(createAdminClient(), lead.id, "manual", { actorId: actor.id });

  revalidatePath("/leads");
  if (instant.quoted) {
    revalidatePath("/quotes");
    redirect(`/leads/${lead.id}`);
  }
  redirect(`/quotes/new?enquiryId=${enquiry.id}`);
}
