"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { renderAndSendTemplate } from "@/lib/emailTemplates";
import type { SupplierType } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

function buildInviteLink(hashedToken: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?token_hash=${hashedToken}&type=invite&next=/accept-invite`;
}

/** Sends (or resends) the branded supplier-invite email — errors are returned, not swallowed, so both call sites can tell the admin whether it actually went out (the link is still handed back either way, as a copy/paste fallback). */
async function sendSupplierInviteEmail(
  admin: AdminClient,
  input: { tenantId: string; supplierName: string; email: string; link: string },
) {
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", input.tenantId).maybeSingle();
  return renderAndSendTemplate(admin, {
    tenantId: input.tenantId,
    key: "supplier_invited",
    to: input.email,
    variables: { supplier_name: input.supplierName, brand_name: tenant?.name ?? "", link: input.link },
  });
}

export async function createSupplierAction(
  _prevState: { error: string | null; link: string | null; emailError: string | null },
  formData: FormData,
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_ADD);
  if (!allowed) return { error: "You do not have permission to add suppliers.", link: null, emailError: null };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const type = (String(formData.get("type") ?? "company") as SupplierType) ?? "company";
  const contactName = String(formData.get("contactName") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const whatsapp = String(formData.get("whatsapp") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name || !email) {
    return { error: "Supplier name and email are required.", link: null, emailError: null };
  }

  const admin = createAdminClient();

  // Same generateLink pattern as the staff invite flow (settings/users/actions.ts)
  // — creates the auth user without Supabase's own hosted email, we build
  // the /auth/confirm link ourselves and send it through this app's own
  // branded template via sendSupplierInviteEmail below (still handed back
  // as `link` too, for a copy/paste fallback if the email fails to send).
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Could not create the invite.", link: null, emailError: null };
  }

  const { error: supplierError } = await admin.from("suppliers").insert({
    id: invited.user.id,
    tenant_id: actor.tenant_id,
    name,
    type,
    contact_name: contactName,
    email,
    phone,
    whatsapp,
    region,
    notes,
    status: "invited",
    created_by: actor.id,
  });

  if (supplierError) {
    return { error: supplierError.message, link: null, emailError: null };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_invited",
    entityType: "supplier",
    entityId: invited.user.id,
    newValue: { name, email, type, region },
  });

  revalidatePath("/suppliers");

  const inviteLink = buildInviteLink(invited.properties.hashed_token);
  const { error: emailError } = await sendSupplierInviteEmail(admin, {
    tenantId: actor.tenant_id,
    supplierName: name,
    email,
    link: inviteLink,
  });

  return { error: null, link: inviteLink, emailError };
}

/** Re-sends the branded invite email to a supplier who hasn't accepted yet, with a fresh link (the original token may have expired). */
export async function resendSupplierInviteAction(supplierId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_ADD);
  if (!allowed) return { error: "You do not have permission to manage suppliers.", link: null };

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("suppliers")
    .select("tenant_id, name, email, status")
    .eq("id", supplierId)
    .single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "Supplier not found.", link: null };
  }
  if (target.status !== "invited") {
    return { error: "This supplier has already accepted their invite.", link: null };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: target.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.properties) {
    return { error: inviteError?.message ?? "Could not generate a new invite link.", link: null };
  }

  const inviteLink = buildInviteLink(invited.properties.hashed_token);
  const { error: emailError } = await sendSupplierInviteEmail(admin, {
    tenantId: actor.tenant_id,
    supplierName: target.name,
    email: target.email,
    link: inviteLink,
  });

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_invite_resent",
    entityType: "supplier",
    entityId: supplierId,
    newValue: { email: target.email },
  });

  return { error: emailError, link: inviteLink };
}

export interface EditSupplierInput {
  reason: string;
  name?: string;
  type?: SupplierType;
  contactName?: string | null;
  email?: string;
  phone?: string | null;
  whatsapp?: string | null;
  region?: string | null;
  registrationNumber?: string | null;
  vatNumber?: string | null;
  insuranceDetails?: string | null;
  licenseNumber?: string | null;
  notes?: string | null;
}

const EDITABLE_SUPPLIER_FIELDS: { key: keyof EditSupplierInput; column: string }[] = [
  { key: "name", column: "name" },
  { key: "type", column: "type" },
  { key: "contactName", column: "contact_name" },
  { key: "email", column: "email" },
  { key: "phone", column: "phone" },
  { key: "whatsapp", column: "whatsapp" },
  { key: "region", column: "region" },
  { key: "registrationNumber", column: "registration_number" },
  { key: "vatNumber", column: "vat_number" },
  { key: "insuranceDetails", column: "insurance_details" },
  { key: "licenseNumber", column: "license_number" },
  { key: "notes", column: "notes" },
];

/**
 * Lets a suppliers.edit holder correct a supplier's business details after
 * onboarding — required reason, logged append-only to supplier_edits (see
 * 0081_supplier_edits.sql) so the supplier detail page can show a proper
 * history. Status/approval fields aren't editable here — those stay on
 * decideSupplierAction and the suspend action, which have their own
 * dedicated audit trail via recordAudit.
 */
export async function editSupplierAction(supplierId: string, input: EditSupplierInput) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_EDIT);
  if (!allowed) return { error: "You do not have permission to edit suppliers." };

  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required to edit a supplier." };

  const supabase = await createClient();

  const { data: supplier } = await supabase.from("suppliers").select("*").eq("id", supplierId).single();
  if (!supplier || supplier.tenant_id !== actor.tenant_id) return { error: "Supplier not found." };

  const update: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const { key, column } of EDITABLE_SUPPLIER_FIELDS) {
    if (!(key in input)) continue;
    const newValue = input[key];
    const oldValue = (supplier as Record<string, unknown>)[column];
    if (newValue === oldValue) continue;
    update[column] = newValue;
    changes[column] = { from: oldValue, to: newValue };
  }

  if (Object.keys(update).length === 0) {
    return { error: "Change at least one field." };
  }

  const { error: updateError } = await supabase.from("suppliers").update(update).eq("id", supplierId);
  if (updateError) return { error: updateError.message };

  const { error: editError } = await supabase.from("supplier_edits").insert({
    tenant_id: actor.tenant_id,
    supplier_id: supplierId,
    edited_by: actor.id,
    reason,
    changes,
  });
  if (editError) return { error: editError.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_edited",
    entityType: "supplier",
    entityId: supplierId,
    reason,
    newValue: changes,
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  return { error: null };
}

/**
 * Returns { error } instead of throwing — a thrown Server Action error gets
 * the same production redaction as a Server Component render error (Next.js
 * replaces the real message with a generic digest-only one), so the caller
 * never actually saw *why* it failed, just a scary "An error occurred"
 * banner. Every other action in this codebase already follows the
 * return-not-throw pattern for exactly this reason.
 */
export async function decideSupplierAction(supplierId: string, decision: "approved" | "rejected") {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_APPROVE);
  if (!allowed) return { error: "You do not have permission to approve suppliers." };

  const supabase = await createClient();
  const { data: supplier } = await supabase.from("suppliers").select("status, tenant_id").eq("id", supplierId).single();
  if (!supplier || supplier.tenant_id !== actor.tenant_id) return { error: "Supplier not found." };

  const { error } = await supabase
    .from("suppliers")
    .update({ status: decision, approved_by: actor.id, approved_at: new Date().toISOString() })
    .eq("id", supplierId);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: decision === "approved" ? "supplier_approved" : "supplier_rejected",
    entityType: "supplier",
    entityId: supplierId,
    previousValue: { status: supplier.status },
    newValue: { status: decision },
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  return { error: null };
}

/**
 * Temporarily takes a supplier out of rotation — dispatch's own supplier
 * query already only offers jobs to status='approved' suppliers
 * (app/(staff)/dispatch/[id]/page.tsx), so flipping status to 'suspended'
 * alone is enough to stop new jobs reaching them; nothing dispatch-side
 * needs to change. A reason is required and shown on the supplier's own page
 * for as long as the suspension stands.
 */
export async function suspendSupplierAction(supplierId: string, reason: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_SUSPEND);
  if (!allowed) return { error: "You do not have permission to suspend suppliers." };

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "A reason is required to suspend a supplier." };

  const supabase = await createClient();
  const { data: supplier } = await supabase.from("suppliers").select("status, tenant_id").eq("id", supplierId).single();
  if (!supplier || supplier.tenant_id !== actor.tenant_id) return { error: "Supplier not found." };

  const { error } = await supabase
    .from("suppliers")
    .update({
      status: "suspended",
      suspension_reason: trimmedReason,
      suspended_by: actor.id,
      suspended_at: new Date().toISOString(),
    })
    .eq("id", supplierId);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_suspended",
    entityType: "supplier",
    entityId: supplierId,
    reason: trimmedReason,
    previousValue: { status: supplier.status },
    newValue: { status: "suspended" },
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  return { error: null };
}

/** Removes a suspension and puts the supplier back in dispatch rotation — always restores to 'approved' (the only status a supplier is ever suspended from). */
export async function unsuspendSupplierAction(supplierId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.SUPPLIERS_SUSPEND);
  if (!allowed) return { error: "You do not have permission to suspend suppliers." };

  const supabase = await createClient();
  const { data: supplier } = await supabase.from("suppliers").select("status, tenant_id").eq("id", supplierId).single();
  if (!supplier || supplier.tenant_id !== actor.tenant_id) return { error: "Supplier not found." };
  if (supplier.status !== "suspended") return { error: "This supplier isn't suspended." };

  const { error } = await supabase
    .from("suppliers")
    .update({ status: "approved", suspension_reason: null, suspended_by: null, suspended_at: null })
    .eq("id", supplierId);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_unsuspended",
    entityType: "supplier",
    entityId: supplierId,
    previousValue: { status: "suspended" },
    newValue: { status: "approved" },
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  return { error: null };
}
