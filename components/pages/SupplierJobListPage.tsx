import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { statusLabel, statusBadgeStyle } from "@/lib/supplierJobStatus";
import { formatDateAndTime } from "@/lib/formatDate";
import type { JobAllocationOfferView } from "@/lib/supabase/database.types";

/** Shared list shell for the New/Active/History job pages — search + responsive card/table + pagination. */
export function SupplierJobListPage({
  title,
  text,
  jobs,
  page,
  pageSize,
  total,
  searchPlaceholder,
  emptyText,
  statusTabs,
}: {
  title: string;
  text: string;
  jobs: JobAllocationOfferView[];
  page: number;
  pageSize: number;
  total: number;
  searchPlaceholder: string;
  emptyText: string;
  statusTabs?: React.ReactNode;
}) {
  return (
    <div>
      <PageHead eyebrow="Supplier Portal" title={title} text={text} />
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder={searchPlaceholder} />
          {statusTabs}
        </div>
        <div className="space-y-3 sm:hidden">
          {jobs.map((job) => (
            <Link key={job.offer_id} href={`/supplier/dashboard/${job.job_allocation_id}`} className="block rounded-2xl border p-4 hover:bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <b>{job.region ?? "Region not set"}</b>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeStyle(job)}`}>{statusLabel(job)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {job.pickup_date ? formatDateAndTime(job.pickup_date, job.pickup_time) : "Date TBC"} · {job.passenger_count ?? "?"} passengers
              </div>
            </Link>
          ))}
          {jobs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Region</th>
                <th>Date &amp; time</th>
                <th>Passengers</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.offer_id} className="border-t">
                  <td className="whitespace-nowrap py-4 font-bold">{job.region ?? "Region not set"}</td>
                  <td className="min-w-[11rem]">{job.pickup_date ? formatDateAndTime(job.pickup_date, job.pickup_time) : "Date TBC"}</td>
                  <td className="whitespace-nowrap">{job.passenger_count ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeStyle(job)}`}>{statusLabel(job)}</span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/supplier/dashboard/${job.job_allocation_id}`} className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>
    </div>
  );
}
