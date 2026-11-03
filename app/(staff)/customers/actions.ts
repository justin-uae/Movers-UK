"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { findDuplicateCustomer, type DuplicateCustomerMatch } from "@/lib/customerDuplicates";

export async function createCustomerAction(
  _prevState: { error: string | null; duplicate?: DuplicateCustomerMatch | null },
  formData: FormData,
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_ADD);
  if (!allowed) return { error: "You do not have permission to add customers." };

  const contactName = String(formData.get("contactName") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!contactName) {
    return { error: "Contact name is required." };
  }

  const supabase = await createClient();

  if (formData.get("confirmedDuplicate") !== "true") {
    const duplicate = await findDuplicateCustomer(supabase, actor.tenant_id, email, phone);
    if (duplicate) return { error: null, duplicate };
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: actor.tenant_id,
      contact_name: contactName,
      company_name: companyName,
      email,
      phone,
      country,
      notes,
      account_manager_id: actor.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "customer_created",
    entityType: "customer",
    entityId: customer.id,
    newValue: { contactName, companyName },
  });

  revalidatePath("/customers");
  return { error: null };
}

export interface UpdateCustomerInput {
  reason: string;
  contactName?: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Corrects a customer's identity/contact fields — separate from
 * createCustomerAction because it touches an existing shared record (the
 * same customer can be linked to many leads/quotes). Gated by enquiries.edit
 * OR ownership of the lead this edit came from (pass `leadId` when calling
 * from the Lead detail page) — mirrors the customers_update RLS policy in
 * 0078_customer_edit_by_lead_owner.sql, which carries the same two paths so
 * a Sales User can fix a typo'd name/email on their own lead's customer
 * without needing the blanket permission.
 */
export async function updateCustomerAction(customerId: string, input: UpdateCustomerInput, leadId?: string) {
  const actor = await requireProfile();
  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required to edit a customer." };

  const supabase = await createClient();

  let allowed = await hasPermission(actor, PERMISSIONS.ENQUIRIES_EDIT);
  if (!allowed && leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("assigned_user_id")
      .eq("id", leadId)
      .eq("customer_id", customerId)
      .maybeSingle();
    allowed = lead?.assigned_user_id === actor.id;
  }
  if (!allowed) return { error: "You do not have permission to edit customer details." };

  const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).single();
  if (!customer) return { error: "Customer not found." };

  const update: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const fields: { key: keyof UpdateCustomerInput; column: string }[] = [
    { key: "contactName", column: "contact_name" },
    { key: "companyName", column: "company_name" },
    { key: "email", column: "email" },
    { key: "phone", column: "phone" },
  ];
  for (const { key, column } of fields) {
    if (!(key in input)) continue;
    const newValue = input[key];
    const oldValue = (customer as Record<string, unknown>)[column];
    if (newValue === oldValue) continue;
    update[column] = newValue;
    changes[column] = { from: oldValue, to: newValue };
  }

  if (Object.keys(update).length === 0) {
    return { error: "Change at least one field." };
  }

  const { error: updateError } = await supabase.from("customers").update(update).eq("id", customerId);
  if (updateError) return { error: updateError.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "customer_updated",
    entityType: "customer",
    entityId: customerId,
    reason,
    newValue: changes,
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { error: null };
}

/**
 * Existing-customer search for CustomerCombobox (New Lead, Complex Booking).
 * Searches every customer in the database — the pages only preload the first
 * page of customers, and PostgREST caps a single read at 1,000 rows, so a
 * purely in-browser filter silently missed everyone past that point.
 * Read through the viewer's own client, so RLS decides who they can see.
 */
export async function searchCustomersAction(query: string) {
  await requireProfile();
  const clean = query.replace(/[,()*%\\]/g, " ").trim();
  if (clean.length < 2) return { customers: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, company_name, contact_name, email, phone")
    .or(["contact_name", "company_name", "email", "phone"].map((col) => `${col}.ilike.*${clean}*`).join(","))
    .order("contact_name")
    .limit(25);
  if (error) {
    console.error("searchCustomersAction failed", error.message);
    return { customers: [] };
  }
  return { customers: data ?? [] };
}
