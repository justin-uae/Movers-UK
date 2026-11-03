import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierJobListPage } from "@/components/pages/SupplierJobListPage";
import type { JobAllocationOfferView } from "@/lib/supabase/database.types";

const PAGE_SIZE = 20;

export default async function ActiveJobsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  await requireSupplier();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // offer_status stays 'accepted' from before even once an allocation moves
  // to 'pending_reapproval' — a re-approval doesn't touch
  // job_allocation_offers at all — so the offer_status filter already
  // covers it; only the allocation_status list needs the new value added.
  let query = supabase
    .from("job_allocation_offer_view")
    .select("*", { count: "exact" })
    .eq("offer_status", "accepted")
    .in("allocation_status", ["accepted_by_supplier", "confirmed", "pending_reapproval"]);
  if (q) query = query.ilike("region", `%${q}%`);

  const { data, count } = await query.order("offered_at", { ascending: false }).range(from, to);

  return (
    <SupplierJobListPage
      title="Active jobs"
      text="Jobs you've accepted — confirm them, then mark completed once the trip is done."
      jobs={(data ?? []) as JobAllocationOfferView[]}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      searchPlaceholder="Search by region…"
      emptyText="No active jobs right now."
    />
  );
}
