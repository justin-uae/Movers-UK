"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { BRAND } from "@/lib/brandConfig";

export async function recordSupplierPaymentAction(
  allocationId: string,
  data: {
    amount: number;
    currency: string;
    bankReference: string;
    notes: string;
    proofStoragePath: string | null;
    proofFileName: string | null;
  },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_PAY_SUPPLIERS);
  if (!allowed) return { error: "You do not have permission to pay suppliers." };

  if (!data.amount || data.amount <= 0) {
    return { error: "Enter a payment amount greater than zero." };
  }

  const supabase = await createClient();

  const [{ data: invoice }, { data: paidRows }, { data: allocation }] = await Promise.all([
    supabase.from("job_supplier_invoices").select("amount").eq("job_allocation_id", allocationId).single(),
    supabase.from("supplier_payments").select("amount").eq("job_allocation_id", allocationId),
    supabase.from("job_allocations").select("job_id").eq("id", allocationId).single(),
  ]);
  const alreadyPaid = (paidRows ?? []).reduce((sum, p) => sum + p.amount, 0);
  const willFullySettle = invoice != null && alreadyPaid + data.amount >= invoice.amount;
  if (willFullySettle && !data.proofStoragePath) {
    return { error: "Attach proof of payment before marking this supplier as fully paid." };
  }

  const { error } = await supabase.from("supplier_payments").insert({
    tenant_id: actor.tenant_id,
    job_allocation_id: allocationId,
    amount: data.amount,
    currency: data.currency || BRAND.defaultCurrency,
    bank_reference: data.bankReference.trim() || null,
    notes: data.notes.trim() || null,
    paid_by: actor.id,
    proof_storage_path: data.proofStoragePath,
    proof_file_name: data.proofFileName,
  });
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_payment_recorded",
    entityType: "job_allocation",
    entityId: allocationId,
    newValue: { amount: data.amount, currency: data.currency, bankReference: data.bankReference },
  });

  revalidatePath("/accounting/supplier-payments");
  if (allocation) revalidatePath(`/dispatch/${allocation.job_id}`);
  return { error: null };
}

/**
 * The reverse of recordSupplierPaymentAction — logs money actually received
 * back from a supplier, typically to settle a "refund owed" balance left by
 * a negative job_allocation_adjustments entry (e.g. rejectAmendedAllocationAction's
 * automatic refund when a paid job is rejected after being edited). Kept as
 * its own supplier_refunds row rather than a negative payment or another
 * adjustment, since this is a genuinely different kind of event — money that
 * actually moved, the same distinction supplier_payments already draws.
 */
export async function recordSupplierRefundAction(
  allocationId: string,
  data: {
    amount: number;
    currency: string;
    bankReference: string;
    notes: string;
    proofStoragePath: string | null;
    proofFileName: string | null;
  },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.FINANCE_PAY_SUPPLIERS);
  if (!allowed) return { error: "You do not have permission to record supplier refunds." };

  if (!data.amount || data.amount <= 0) {
    return { error: "Enter a refund amount greater than zero." };
  }

  const supabase = await createClient();

  const { data: allocation } = await supabase.from("job_allocations").select("job_id").eq("id", allocationId).single();

  const { error } = await supabase.from("supplier_refunds").insert({
    tenant_id: actor.tenant_id,
    job_allocation_id: allocationId,
    amount: data.amount,
    currency: data.currency || BRAND.defaultCurrency,
    bank_reference: data.bankReference.trim() || null,
    notes: data.notes.trim() || null,
    received_by: actor.id,
    proof_storage_path: data.proofStoragePath,
    proof_file_name: data.proofFileName,
  });
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_refund_recorded",
    entityType: "job_allocation",
    entityId: allocationId,
    newValue: { amount: data.amount, currency: data.currency, bankReference: data.bankReference },
  });

  revalidatePath("/accounting/supplier-payments");
  if (allocation) revalidatePath(`/dispatch/${allocation.job_id}`);
  return { error: null };
}
