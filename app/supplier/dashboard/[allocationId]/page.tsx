import { notFound } from "next/navigation";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupplierJobDetail } from "@/components/pages/SupplierJobDetail";
import { legRouteDistances } from "@/lib/tripDistance";
import type { JobAllocationOfferView, JobSupplierInvoice } from "@/lib/supabase/database.types";

export default async function SupplierJobDetailPage({ params }: { params: Promise<{ allocationId: string }> }) {
  const { allocationId } = await params;
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const [{ data: job }, { data: invoice }, { data: pendingAmendment }, { data: payments }, { data: adjustments }, { data: refunds }] =
    await Promise.all([
      supabase.from("job_allocation_offer_view").select("*").eq("job_allocation_id", allocationId).maybeSingle(),
      supabase.from("job_supplier_invoices").select("*").eq("job_allocation_id", allocationId).eq("supplier_id", supplier.id).maybeSingle(),
      // booking_amendments' RLS is staff-only (bookings.view) — a supplier has
      // no profiles/permissions row to satisfy it, so this goes through the
      // admin client. Safe to do unconditionally: the `job` fetch above is
      // still RLS-scoped to this supplier, and we 404 below if it's empty, so
      // this reason/changes text is only ever rendered once that's confirmed.
      createAdminClient()
        .from("booking_amendments")
        .select("reason, changes")
        .eq("job_allocation_id", allocationId)
        .eq("supplier_approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // These three now scope supplier visibility through job_supplier_invoices.supplier_id
      // (0073_supplier_refunds.sql) rather than job_allocations.assigned_supplier_id, so
      // they still resolve correctly even once a rejected allocation's
      // assigned_supplier_id has gone null — the same history a rejected,
      // already-paid job leaves behind should still be visible to the
      // supplier it happened to, not just to staff.
      supabase.from("supplier_payments").select("id, amount, bank_reference, paid_at").eq("job_allocation_id", allocationId),
      supabase.from("job_allocation_adjustments").select("id, amount, reason, created_at").eq("job_allocation_id", allocationId),
      supabase.from("supplier_refunds").select("id, amount, bank_reference, received_at").eq("job_allocation_id", allocationId),
    ]);

  if (!job) notFound();

  const offerView = job as JobAllocationOfferView;
  const legDistancesPromise = legRouteDistances(offerView.legs ?? []);

  let invoiceUrl: string | null = null;
  if (invoice) {
    const { data: signed } = await supabase.storage.from("job-invoices").createSignedUrl(invoice.storage_path, 3600);
    invoiceUrl = signed?.signedUrl ?? null;
  }

  const legDistances = await legDistancesPromise;

  return (
    <SupplierJobDetail
      job={offerView}
      legDistances={legDistances}
      invoice={invoice as JobSupplierInvoice | null}
      invoiceUrl={invoiceUrl}
      supplierId={supplier.id}
      pendingAmendment={pendingAmendment as { reason: string; changes: Record<string, { from: unknown; to: unknown }> } | null}
      payments={payments ?? []}
      adjustments={adjustments ?? []}
      refunds={refunds ?? []}
    />
  );
}
