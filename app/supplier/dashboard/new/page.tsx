import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierJobListPage } from "@/components/pages/SupplierJobListPage";
import type { JobAllocationOfferView } from "@/lib/supabase/database.types";

const PAGE_SIZE = 20;

export default async function NewJobsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  await requireSupplier();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from("job_allocation_offer_view").select("*", { count: "exact" }).eq("offer_status", "sent");
  if (q) query = query.ilike("region", `%${q}%`);

  const { data, count } = await query.order("offered_at", { ascending: false }).range(from, to);

  return (
    <SupplierJobListPage
      title="New job offers"
      text="Jobs offered to you that haven't been accepted or rejected yet — open one to review and respond."
      jobs={(data ?? []) as JobAllocationOfferView[]}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      searchPlaceholder="Search by region…"
      emptyText="No new offers right now."
    />
  );
}
