import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierShell } from "@/components/layout/SupplierShell";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { count } = await supabase
    .from("job_allocation_offer_view")
    .select("offer_id", { count: "exact", head: true })
    .eq("offer_status", "sent");

  return (
    <SupplierShell supplierName={supplier.name} supplierStatus={supplier.status} newJobsCount={count ?? 0}>
      {children}
    </SupplierShell>
  );
}
