"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { extractComplexBooking, type ComplexBookingExtraction } from "@/lib/complexBookingExtraction";
import { findDuplicateCustomer, type DuplicateCustomerMatch } from "@/lib/customerDuplicates";
import { getAiModelSetting } from "@/lib/aiProviders";
import { parseMoveDetails } from "@/lib/moveDetails";
import type { MoveDetails } from "@/lib/moveDetails";

export interface ComplexBookingFileRef {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
}

const DUPLICATE_SUBMISSION_WINDOW_MINUTES = 15;

/**
 * Unlike website/email intake, this form has no built-in "did I already
 * submit this" feedback beyond a redirect — resubmitting (e.g. after a slow
 * page, or not noticing the first submit went through) silently creates a
 * second identical lead with nothing to stop it. Matched on the same
 * customer plus the exact same pasted enquiry text or uploaded file,
 * within a short window — narrow enough that a genuinely new booking using
 * a similar template later doesn't get blocked.
 */
async function findRecentDuplicateComplexBooking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  customerId: string,
  pastedText: string | null,
  sourceFile: ComplexBookingFileRef | null,
): Promise<string | null> {
  if (!pastedText?.trim() && !sourceFile) return null;

  const since = new Date(Date.now() - DUPLICATE_SUBMISSION_WINDOW_MINUTES * 60000).toISOString();
  const { data: candidates } = await supabase
    .from("leads")
    .select("id, raw_payload")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("is_complex_booking", true)
    .gte("created_at", since);

  for (const lead of candidates ?? []) {
    const payload = lead.raw_payload as { pastedText?: string | null; sourceFile?: { storagePath: string } | null } | null;
    const sameText = Boolean(pastedText?.trim() && payload?.pastedText?.trim() === pastedText.trim());
    const sameFile = Boolean(sourceFile && payload?.sourceFile?.storagePath === sourceFile.storagePath);
    if (sameText || sameFile) return lead.id;
  }
  return null;
}

export async function extractComplexBookingAction(input: {
  pastedText: string;
  file: ComplexBookingFileRef | null;
}): Promise<{ data: ComplexBookingExtraction | null; warning: string | null; error: string | null }> {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { data: null, warning: null, error: "You do not have permission to add enquiries." };

  const pastedText = input.pastedText.trim();
  if (!pastedText && !input.file) {
    return { data: null, warning: null, error: "Paste the enquiry text or upload a file first." };
  }

  try {
    const supabase = await createClient();
    const aiModel = await getAiModelSetting(supabase, actor.tenant_id, "complex_booking");
    const data = await extractComplexBooking({ pastedText: pastedText || null, file: input.file, aiModel });
    // A partial read (e.g. the customer's details came through but no
    // addresses were recognisable) still goes to review rather than being
    // thrown away — the review form lets staff fill the rest in by hand.
    const warning =
      !data.move.pickup_address.trim() || !data.move.destination_address.trim()
        ? "Couldn't find both addresses in that enquiry — fill them in below."
        : null;
    return { data, warning, error: null };
  } catch (err) {
    return { data: null, warning: null, error: err instanceof Error ? err.message : "Could not read this enquiry." };
  }
}

export interface ComplexBookingMoveInput {
  pickupAddress: string;
  destinationAddress: string;
  moveDate: string | null;
  moveTime: string | null;
  moveDetails: MoveDetails;
  vanSize: string | null;
  specialRequirements: string | null;
}

export interface CreateComplexBookingInput {
  existingCustomerId: string | null;
  newCustomer: { contactName: string; companyName: string; email: string; phone: string } | null;
  move: ComplexBookingMoveInput;
  internalNotes: string | null;
  pastedText: string | null;
  sourceFile: ComplexBookingFileRef | null;
  confirmedDuplicateCustomer?: boolean;
}

export async function createComplexBookingLeadAction(
  input: CreateComplexBookingInput,
): Promise<{ error: string | null; duplicate?: DuplicateCustomerMatch }> {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { error: "You do not have permission to add enquiries." };

  const supabase = await createClient();

  let customerId = input.existingCustomerId?.trim() || "";
  if (!customerId) {
    const contactName = input.newCustomer?.contactName.trim() ?? "";
    if (!contactName) {
      return { error: "Select an existing customer or enter a new contact name." };
    }
    const newEmail = input.newCustomer?.email.trim() || null;
    const newPhone = input.newCustomer?.phone.trim() || null;

    if (!input.confirmedDuplicateCustomer) {
      const duplicate = await findDuplicateCustomer(supabase, actor.tenant_id, newEmail, newPhone);
      if (duplicate) return { error: null, duplicate };
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        tenant_id: actor.tenant_id,
        contact_name: contactName,
        company_name: input.newCustomer?.companyName.trim() || null,
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

  if (!input.move.pickupAddress.trim() || !input.move.destinationAddress.trim()) {
    return { error: "Enter both the moving-from and moving-to address." };
  }

  const duplicateLeadId = await findRecentDuplicateComplexBooking(supabase, actor.tenant_id, customerId, input.pastedText, input.sourceFile);
  if (duplicateLeadId) {
    return { error: "It looks like this enquiry was already submitted a few minutes ago for this customer — check My Leads before submitting again." };
  }

  const move = input.move;

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
      pickup_text: move.pickupAddress,
      destination_text: move.destinationAddress,
      travel_date: move.moveDate,
      pickup_time: move.moveTime,
      ...parseMoveDetails(move.moveDetails),
      notes: input.internalNotes,
      is_complex_booking: true,
      raw_payload: {
        source: "complex_booking",
        pastedText: input.pastedText,
        sourceFile: input.sourceFile,
      },
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
      internal_notes: input.internalNotes,
      created_by: actor.id,
      is_complex_booking: true,
    })
    .select()
    .single();

  if (enquiryError || !enquiry) {
    return { error: enquiryError?.message ?? "Could not create the enquiry." };
  }

  const { error: legsError } = await supabase.from("enquiry_legs").insert({
    enquiry_id: enquiry.id,
    sequence: 1,
    pickup_address: move.pickupAddress,
    destination_address: move.destinationAddress,
    pickup_date: move.moveDate,
    pickup_time: move.moveTime,
    ...parseMoveDetails(move.moveDetails),
    van_size: move.vanSize,
    special_requirements: move.specialRequirements,
  });

  if (legsError) {
    return { error: legsError.message };
  }

  if (input.sourceFile) {
    // Best-effort: the lead/enquiry are already created, so a failure here
    // shouldn't roll any of that back — it just means the source file stays
    // reachable only via Storage directly instead of the Documents module.
    await supabase.from("documents").insert({
      tenant_id: actor.tenant_id,
      doc_type: "inventory_list",
      label: input.sourceFile.fileName,
      storage_path: input.sourceFile.storagePath,
      file_name: input.sourceFile.fileName,
      file_size: input.sourceFile.fileSize ?? null,
      customer_id: customerId,
      lead_id: lead.id,
      uploaded_by: actor.id,
    });
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "lead_created_complex_booking",
    entityType: "lead",
    entityId: lead.id,
    newValue: { customerId, enquiryId: enquiry.id },
  });

  revalidatePath("/leads");
  redirect(`/quotes/new?enquiryId=${enquiry.id}`);
}
