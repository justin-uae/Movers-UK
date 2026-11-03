import Link from "next/link";
import clsx from "clsx";
import { requireSupplier } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierJobListPage } from "@/components/pages/SupplierJobListPage";
import type { JobAllocationOfferView } from "@/lib/supabase/database.types";

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected / Withdrawn" },
] as const;

function tabHref(key: string, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (key) params.set("status", key);
  const qs = params.toString();
  return `/supplier/dashboard/history${qs ? `?${qs}` : ""}`;
}

export default async function JobHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const params = await searchParams;
  await requireSupplier();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const status = params.status === "completed" || params.status === "rejected" ? params.status : "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from("job_allocation_offer_view").select("*", { count: "exact" });
  if (status === "completed") {
    query = query.eq("allocation_status", "completed");
  } else if (status === "rejected") {
    query = query.or("offer_status.eq.rejected,offer_status.eq.withdrawn");
  } else {
    query = query.or("allocation_status.eq.completed,offer_status.eq.rejected,offer_status.eq.withdrawn");
  }
  if (q) query = query.ilike("region", `%${q}%`);

  const { data, count } = await query.order("offered_at", { ascending: false }).range(from, to);

  return (
    <SupplierJobListPage
      title="Job history"
      text="Completed, rejected and withdrawn jobs."
      jobs={(data ?? []) as JobAllocationOfferView[]}
      page={page}
      pageSize={PAGE_SIZE}
      total={count ?? 0}
      searchPlaceholder="Search by region…"
      emptyText="No jobs here yet."
      statusTabs={
        <div className="flex gap-2">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key, q)}
              className={clsx(
                "rounded-xl px-3 py-2 text-sm font-bold",
                status === t.key ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      }
    />
  );
}
