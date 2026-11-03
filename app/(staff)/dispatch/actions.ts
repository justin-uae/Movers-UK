"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { sendTemplatedEmail } from "@/lib/emailTemplates";
import { sendWhatsAppTemplate, normalizeWhatsAppNumber, WHATSAPP_TEMPLATE_HEADER_IMAGE_URL } from "@/lib/whatsapp360";
import { cancelAllocation } from "@/lib/dispatchAllocations";
import type { Database, Profile } from "@/lib/supabase/database.types";
import { BRAND } from "@/lib/brandConfig";

// The user who created the job (i.e. the sales user who marked its quote as
// paid) can always dispatch its allocations themselves — this is the normal
// path in the simplified flow (one person carries a booking from enquiry
// through to supplier assignment). dispatch.send_manual additionally covers
// a dedicated operations role dispatching jobs they didn't personally create.
async function canDispatch(actor: Profile, job: { created_by: string | null }) {
  if (job.created_by === actor.id) return true;
  return hasPermission(actor, PERMISSIONS.DISPATCH_SEND_MANUAL);
}

interface AllocationContext {
  jobId: string;
  tenantId: string;
  createdBy: string | null;
  allocationStatus: string;
  agreedCost: number | null;
}

async function loadAllocationContext(
  supabase: SupabaseClient<Database>,
  allocationId: string,
): Promise<AllocationContext | null> {
  const { data } = await supabase
    .from("job_allocations")
    .select("job_id, status, agreed_cost, jobs(tenant_id, created_by)")
    .eq("id", allocationId)
    .single();
  if (!data) return null;
  const job = data.jobs as unknown as { tenant_id: string; created_by: string | null } | null;
  if (!job) return null;
  return {
    jobId: data.job_id,
    tenantId: job.tenant_id,
    createdBy: job.created_by,
    allocationStatus: data.status,
    agreedCost: data.agreed_cost,
  };
}

export async function createAllocationAction(
  jobId: string,
  legIds: string[],
  vehicleNotes: string,
  agreedCost: number | null,
  currency: string,
) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (legIds.length === 0) throw new Error("Select at least one journey leg.");

  const { data: job } = await supabase
    .from("jobs")
    .select("tenant_id, status, created_by, quotes(enquiry_id)")
    .eq("id", jobId)
    .single();
  if (!job || job.tenant_id !== actor.tenant_id) throw new Error("Job not found.");
  if (!(await canDispatch(actor, job))) throw new Error("You do not have permission to dispatch this job.");
  if (job.status === "cancelled") throw new Error("This booking has been cancelled.");

  const enquiryId = (job.quotes as unknown as { enquiry_id: string } | null)?.enquiry_id ?? "";
  const { data: validLegs } = await supabase.from("enquiry_legs").select("id").eq("enquiry_id", enquiryId).in("id", legIds);
  if (!validLegs || validLegs.length !== legIds.length) throw new Error("One or more selected legs are invalid.");

  const { data: alreadyClaimed } = await supabase.from("job_allocation_legs").select("enquiry_leg_id").in("enquiry_leg_id", legIds);
  if (alreadyClaimed && alreadyClaimed.length > 0) {
    throw new Error("One or more selected legs are already part of another allocation.");
  }

  const { data: allocation, error: allocationError } = await supabase
    .from("job_allocations")
    .insert({
      tenant_id: actor.tenant_id,
      job_id: jobId,
      vehicle_notes: vehicleNotes.trim() || null,
      agreed_cost: agreedCost,
      currency: currency || BRAND.defaultCurrency,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (allocationError || !allocation) throw new Error(allocationError?.message ?? "Could not create the allocation.");

  const { error: legsError } = await supabase
    .from("job_allocation_legs")
    .insert(legIds.map((legId) => ({ job_allocation_id: allocation.id, enquiry_leg_id: legId })));
  if (legsError) throw new Error(legsError.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_allocation_created",
    entityType: "job_allocation",
    entityId: allocation.id,
    newValue: { jobId, legIds, vehicleNotes, agreedCost, currency },
  });

  revalidatePath(`/dispatch/${jobId}`);
  revalidatePath("/dispatch");
}

export async function editAllocationLegsAction(allocationId: string, legIds: string[]) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (legIds.length === 0) throw new Error("Select at least one journey leg.");

  const ctx = await loadAllocationContext(supabase, allocationId);
  if (!ctx || ctx.tenantId !== actor.tenant_id) throw new Error("Allocation not found.");
  if (!(await canDispatch(actor, { created_by: ctx.createdBy }))) throw new Error("You do not have permission to dispatch this job.");
  if (ctx.allocationStatus !== "unassigned") throw new Error("Legs can only be edited before this allocation is offered.");

  const { data: job } = await supabase.from("jobs").select("quotes(enquiry_id)").eq("id", ctx.jobId).single();
  const enquiryId = (job?.quotes as unknown as { enquiry_id: string } | null)?.enquiry_id ?? "";
  const { data: validLegs } = await supabase.from("enquiry_legs").select("id").eq("enquiry_id", enquiryId).in("id", legIds);
  if (!validLegs || validLegs.length !== legIds.length) throw new Error("One or more selected legs are invalid.");

  const { data: claimedElsewhere } = await supabase
    .from("job_allocation_legs")
    .select("enquiry_leg_id")
    .in("enquiry_leg_id", legIds)
    .neq("job_allocation_id", allocationId);
  if (claimedElsewhere && claimedElsewhere.length > 0) {
    throw new Error("One or more selected legs are already part of another allocation.");
  }

  const { error: deleteError } = await supabase.from("job_allocation_legs").delete().eq("job_allocation_id", allocationId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await supabase
    .from("job_allocation_legs")
    .insert(legIds.map((legId) => ({ job_allocation_id: allocationId, enquiry_leg_id: legId })));
  if (insertError) throw new Error(insertError.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_allocation_legs_updated",
    entityType: "job_allocation",
    entityId: allocationId,
    newValue: { legIds },
  });

  revalidatePath(`/dispatch/${ctx.jobId}`);
}

export async function updateAllocationTermsAction(
  allocationId: string,
  vehicleNotes: string,
  agreedCost: number | null,
  currency: string,
) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const ctx = await loadAllocationContext(supabase, allocationId);
  if (!ctx || ctx.tenantId !== actor.tenant_id) throw new Error("Allocation not found.");
  if (!(await canDispatch(actor, { created_by: ctx.createdBy }))) throw new Error("You do not have permission to dispatch this job.");
  if (["completed", "cancelled"].includes(ctx.allocationStatus)) {
    throw new Error("This allocation is already closed out.");
  }
  // Terms are otherwise locked once a supplier has accepted/confirmed, to
  // avoid quietly renegotiating an agreed rate after the fact — except when
  // no cost was ever entered at all, which is a data-entry gap, not a
  // renegotiation, and the only way to unblock a supplier who's already
  // accepted and is stuck unable to invoice.
  if (!["unassigned", "offered"].includes(ctx.allocationStatus) && ctx.agreedCost != null) {
    throw new Error("Terms can only be edited before this allocation is confirmed.");
  }

  const { error } = await supabase
    .from("job_allocations")
    .update({ vehicle_notes: vehicleNotes.trim() || null, agreed_cost: agreedCost, currency: currency || BRAND.defaultCurrency })
    .eq("id", allocationId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_allocation_terms_updated",
    entityType: "job_allocation",
    entityId: allocationId,
    newValue: { vehicleNotes, agreedCost, currency },
  });

  revalidatePath(`/dispatch/${ctx.jobId}`);
}

export async function offerAllocationToSuppliersAction(allocationId: string, supplierIds: string[]) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (supplierIds.length === 0) throw new Error("Select at least one supplier.");

  const { data: allocation } = await supabase
    .from("job_allocations")
    .select("id, status, job_id, jobs(tenant_id, created_by, region, quotes(brands(name)))")
    .eq("id", allocationId)
    .single();
  const job = allocation?.jobs as unknown as {
    tenant_id: string;
    created_by: string | null;
    region: string | null;
    quotes: { brands: { name: string } | null } | null;
  } | null;
  if (!allocation || !job || job.tenant_id !== actor.tenant_id) throw new Error("Allocation not found.");
  if (!(await canDispatch(actor, job))) throw new Error("You do not have permission to dispatch this job.");

  const { data: legRows } = await supabase
    .from("job_allocation_legs")
    .select("enquiry_legs(sequence, pickup_date, pickup_time, passenger_count)")
    .eq("job_allocation_id", allocationId);
  const legs = (legRows ?? [])
    .map(
      (r) =>
        r.enquiry_legs as unknown as {
          sequence: number;
          pickup_date: string | null;
          pickup_time: string | null;
          passenger_count: number | null;
        } | null,
    )
    .filter((l): l is NonNullable<typeof l> => !!l)
    .sort((a, b) => a.sequence - b.sequence);
  const firstLeg = legs[0];

  const { error: offersError } = await supabase.from("job_allocation_offers").upsert(
    supplierIds.map((supplierId) => ({
      tenant_id: actor.tenant_id,
      job_allocation_id: allocationId,
      supplier_id: supplierId,
      status: "sent" as const,
      offered_at: new Date().toISOString(),
      responded_at: null,
    })),
    { onConflict: "job_allocation_id,supplier_id" },
  );
  if (offersError) throw new Error(offersError.message);

  const { error } = await supabase
    .from("job_allocations")
    .update({
      assigned_supplier_id: null,
      status: "offered",
      offered_at: new Date().toISOString(),
      responded_at: null,
      confirmed_at: null,
    })
    .eq("id", allocationId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_allocation_offered_to_suppliers",
    entityType: "job_allocation",
    entityId: allocationId,
    previousValue: { status: allocation.status },
    newValue: { supplierIds, status: "offered" },
  });

  const { data: suppliers } = await supabase.from("suppliers").select("id, name, email, phone, whatsapp").in("id", supplierIds);

  for (const supplier of suppliers ?? []) {
    await sendTemplatedEmail(supabase, {
      tenantId: actor.tenant_id,
      key: "job_offered",
      to: supplier.email,
      variables: {
        supplier_name: supplier.name,
        brand_name: job.quotes?.brands?.name ?? "",
        region: job.region ?? "—",
        pickup_date: firstLeg?.pickup_date ?? "TBC",
        pickup_time: firstLeg?.pickup_time ?? "",
        passenger_count: String(firstLeg?.passenger_count ?? "—"),
        link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/supplier/dashboard/${allocationId}`,
      },
    });

    const supplierWhatsapp = supplier.whatsapp || supplier.phone;
    if (supplierWhatsapp) {
      const waResult = await sendWhatsAppTemplate(
        normalizeWhatsAppNumber(supplierWhatsapp),
        "job_offered_supplier",
        [
          supplier.name,
          job.quotes?.brands?.name ?? "",
          job.region ?? "—",
          firstLeg?.pickup_date ?? "TBC",
          firstLeg?.pickup_time ?? "TBC",
          String(firstLeg?.passenger_count ?? "—"),
        ],
        allocationId,
        WHATSAPP_TEMPLATE_HEADER_IMAGE_URL,
      );
      if (!waResult.ok) {
        console.error(`offerAllocationToSuppliersAction: job_offered_supplier WhatsApp send failed for supplier ${supplier.id}: ${waResult.error}`);
      }
    }
  }

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${allocation.job_id}`);
}

export async function withdrawAllocationOffersAction(allocationId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const ctx = await loadAllocationContext(supabase, allocationId);
  if (!ctx || ctx.tenantId !== actor.tenant_id) throw new Error("Allocation not found.");
  if (!(await canDispatch(actor, { created_by: ctx.createdBy }))) throw new Error("You do not have permission to dispatch this job.");
  if (ctx.allocationStatus !== "offered") throw new Error("This allocation has no outstanding offers to withdraw.");

  const { error: offersError } = await supabase
    .from("job_allocation_offers")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("job_allocation_id", allocationId)
    .eq("status", "sent");
  if (offersError) throw new Error(offersError.message);

  const { error } = await supabase
    .from("job_allocations")
    .update({ status: "unassigned" })
    .eq("id", allocationId)
    .eq("status", "offered");
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_allocation_offers_withdrawn",
    entityType: "job_allocation",
    entityId: allocationId,
  });

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${ctx.jobId}`);
}

export async function cancelAllocationAction(allocationId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const ctx = await loadAllocationContext(supabase, allocationId);
  if (!ctx || ctx.tenantId !== actor.tenant_id) throw new Error("Allocation not found.");
  if (!(await canDispatch(actor, { created_by: ctx.createdBy }))) throw new Error("You do not have permission to dispatch this job.");
  if (["completed", "cancelled"].includes(ctx.allocationStatus)) throw new Error("This allocation cannot be cancelled.");

  await cancelAllocation(supabase, allocationId);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_allocation_cancelled",
    entityType: "job_allocation",
    entityId: allocationId,
    previousValue: { status: ctx.allocationStatus },
  });

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${ctx.jobId}`);
}

export async function transferSupplierInvoiceToAccountingAction(allocationId: string) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.DISPATCH_TRANSFER_SUPPLIER_INVOICE);
  if (!allowed) throw new Error("You do not have permission to transfer this invoice to accounting.");

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("job_supplier_invoices")
    .select("id, tenant_id, status")
    .eq("job_allocation_id", allocationId)
    .single();
  if (!invoice || invoice.tenant_id !== actor.tenant_id) throw new Error("No supplier invoice found for this allocation.");
  if (invoice.status === "forwarded_to_accounting") throw new Error("This invoice has already been forwarded.");

  const { error } = await supabase
    .from("job_supplier_invoices")
    .update({ status: "forwarded_to_accounting", forwarded_by: actor.id, forwarded_at: new Date().toISOString() })
    .eq("id", invoice.id);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "supplier_invoice_forwarded",
    entityType: "job_allocation",
    entityId: allocationId,
  });

  const ctx = await loadAllocationContext(supabase, allocationId);
  revalidatePath("/dispatch");
  if (ctx) revalidatePath(`/dispatch/${ctx.jobId}`);
}

export async function attachManualInvoiceNoteAction(allocationId: string, note: string, url: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const ctx = await loadAllocationContext(supabase, allocationId);
  if (!ctx || ctx.tenantId !== actor.tenant_id) throw new Error("Allocation not found.");
  if (!(await canDispatch(actor, { created_by: ctx.createdBy }))) throw new Error("You do not have permission to update this allocation.");

  const { error } = await supabase
    .from("job_allocations")
    .update({ manual_invoice_note: note || null, manual_invoice_url: url || null })
    .eq("id", allocationId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "job_allocation_manual_invoice_attached",
    entityType: "job_allocation",
    entityId: allocationId,
    newValue: { note, url },
  });

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${ctx.jobId}`);
}
