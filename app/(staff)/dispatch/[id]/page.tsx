import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import { legRouteDistances } from "@/lib/tripDistance";
import { DispatchJobDetail, type JobDetailRow, type JobAllocationRow, type JobRejectionRecord } from "@/components/pages/DispatchJobDetail";
import type { SupplierOption } from "@/components/pages/DispatchBoard";
import type { BookingEditRecord } from "@/components/pages/BookingEditHistory";

export default async function DispatchJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const supabase = await createClient();

  const [{ data: job }, { data: allocations }, { data: suppliers }, canTransfer, canDispatchManual, canEditBookingPermission, canCancelPermission, canAssign, { data: amendmentsRaw }, { data: rejectionsRaw }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, status, region, created_at, created_by, quotes(id, status, quote_number, currency, customers(company_name, contact_name, phone, whatsapp, email), enquiries(assigned_user_id, enquiry_legs(id, sequence, journey_type, pickup_address, destination_address, via_points, pickup_date, pickup_time, return_date, return_time, passenger_count, luggage_count, wheelchair_required, child_seats, special_requirements, vehicle_types(name))), quote_versions!quotes_current_version_id_fkey(selling_price, supplier_estimated_cost), profiles!quotes_created_by_fkey(full_name))",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("job_allocations")
      .select(
        "id, status, assigned_supplier_id, vehicle_notes, agreed_cost, currency, supplier_payment_status, manual_invoice_note, manual_invoice_url, offered_at, confirmed_at, completed_at, created_at, suppliers(id, name, region, phone, whatsapp, email), job_allocation_legs(enquiry_leg_id), job_allocation_offers(id, status, offered_at, responded_at, suppliers(id, name, region)), job_supplier_invoices(*), supplier_payments(id, amount, currency, bank_reference, paid_at)",
      )
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("suppliers").select("id, name, region").eq("status", "approved").order("name"),
    hasPermission(actor, PERMISSIONS.DISPATCH_TRANSFER_SUPPLIER_INVOICE),
    hasPermission(actor, PERMISSIONS.DISPATCH_SEND_MANUAL),
    hasPermission(actor, PERMISSIONS.BOOKINGS_AMEND),
    hasPermission(actor, PERMISSIONS.QUOTES_CANCEL),
    hasPermission(actor, PERMISSIONS.ENQUIRIES_REASSIGN),
    supabase
      .from("booking_amendments")
      .select(
        "id, reason, changes, customer_charge_amount, supplier_adjustment_amount, supplier_approval_status, supplier_responded_at, created_at, profiles(full_name), job_allocation_adjustments(amount, reason, created_at)",
      )
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_rejection_log")
      .select("id, job_allocation_id, context, reason, rejected_at, suppliers(name)")
      .eq("job_id", id)
      .order("rejected_at", { ascending: false }),
  ]);

  if (!job) notFound();
  const jobRow = job as unknown as JobDetailRow;
  const jobLegs = jobRow.quotes?.enquiries?.enquiry_legs ?? [];
  const [assignableUsers, distances] = await Promise.all([
    canAssign ? getAssignableSalesUsers(supabase) : Promise.resolve([]),
    legRouteDistances(jobLegs),
  ]);
  // Keyed by leg id — DispatchJobDetail re-sorts the legs itself.
  const legDistances = Object.fromEntries(jobLegs.map((leg, i) => [leg.id, distances[i]!]));

  // Mirrors canDispatch() in app/(staff)/dispatch/actions.ts — owning the
  // job (it was created from a quote this user handled) is enough even
  // without the blanket dispatch.send_manual permission.
  const canDispatchJobs = job.created_by === actor.id || canDispatchManual;

  // Mirrors the same check on the Quote detail page — Master Admin, or the
  // enquiry's assigned owner with bookings.amend.
  const canEditBooking =
    actor.is_master_admin || (canEditBookingPermission && jobRow.quotes?.enquiries?.assigned_user_id === actor.id);
  // Same gate as the Quote detail page's Cancel Booking button — owner or
  // Master Admin only, not just anyone holding quotes.cancel.
  const canCancel =
    actor.is_master_admin || (canCancelPermission && jobRow.quotes?.enquiries?.assigned_user_id === actor.id);

  const allocationRows = (allocations ?? []) as unknown as JobAllocationRow[];
  const invoiceUrls: Record<string, string | null> = {};
  await Promise.all(
    allocationRows.map(async (a) => {
      if (!a.job_supplier_invoices) return;
      const { data: signed } = await supabase.storage
        .from("job-invoices")
        .createSignedUrl(a.job_supplier_invoices.storage_path, 3600);
      invoiceUrls[a.id] = signed?.signedUrl ?? null;
    }),
  );

  return (
    <DispatchJobDetail
      job={jobRow}
      allocations={allocationRows}
      invoiceUrls={invoiceUrls}
      suppliers={(suppliers ?? []) as unknown as SupplierOption[]}
      canTransferInvoice={canTransfer}
      canDispatchJobs={canDispatchJobs}
      canEditBooking={canEditBooking}
      canCancel={canCancel}
      canAssign={canAssign}
      assignableUsers={assignableUsers}
      amendments={(amendmentsRaw ?? []) as unknown as BookingEditRecord[]}
      rejections={(rejectionsRaw ?? []) as unknown as JobRejectionRecord[]}
      legDistances={legDistances}
    />
  );
}
