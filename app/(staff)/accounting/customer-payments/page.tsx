import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { CustomerPaymentsPage, type AcceptedQuoteRow, type CustomerRefundRow } from "@/components/pages/CustomerPaymentsPage";

export default async function Page() {
  const profile = await requireProfile();
  const canMarkPaid = await hasPermission(profile, PERMISSIONS.FINANCE_RECORD_PAYMENTS);
  if (!canMarkPaid) redirect("/dashboard");
  const canVerify = await hasPermission(profile, PERMISSIONS.FINANCE_VERIFY_BANK_TRANSFERS);
  const canProcessRefunds = await hasPermission(profile, PERMISSIONS.FINANCE_PROCESS_REFUNDS);

  const supabase = await createClient();

  const [{ data: quotes }, { data: refundsRaw }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_number, status, currency, decided_at, invoice_number, invoiced_at, customers(company_name, contact_name, phone, email), enquiries(enquiry_legs(pickup_address, destination_address, pickup_date)), quote_versions!quotes_current_version_id_fkey(selling_price, deposit_percentage), customer_payments(id, amount, method, paid_at, proof_storage_path, verification_status)",
      )
      .in("status", ["accepted", "partially_paid", "paid"])
      .order("decided_at", { ascending: false }),
    // Tenant-wide, not scoped to any one quote — so Finance can action every
    // pending customer refund from one place instead of hunting through
    // individual cancelled bookings.
    supabase
      .from("refunds")
      .select(
        "id, quote_id, amount, currency, reason, status, created_at, processed_at, quotes(quote_number, customers(company_name, contact_name)), requested_by_profile:profiles!refunds_requested_by_fkey(full_name), processed_by_profile:profiles!refunds_processed_by_fkey(full_name)",
      )
      .order("created_at", { ascending: false }),
  ]);

  const rows = (quotes ?? []) as unknown as AcceptedQuoteRow[];
  const refunds = (refundsRaw ?? []) as unknown as CustomerRefundRow[];

  const signedProofUrls = await Promise.all(
    rows
      .flatMap((q) => q.customer_payments ?? [])
      .filter((p) => p.proof_storage_path)
      .map(async (p) => {
        const { data } = await supabase.storage
          .from("customer-payment-proofs")
          .createSignedUrl(p.proof_storage_path as string, 3600);
        return { id: p.id, url: data?.signedUrl ?? null };
      }),
  );
  const proofUrls = Object.fromEntries(signedProofUrls.map((s) => [s.id, s.url]));

  return (
    <CustomerPaymentsPage
      quotes={rows}
      refunds={refunds}
      proofUrls={proofUrls}
      currentUserId={profile.id}
      canVerify={canVerify}
      canProcessRefunds={canProcessRefunds}
    />
  );
}
