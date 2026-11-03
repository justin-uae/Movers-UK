import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { PageGuide } from "@/components/ui/PageGuide";
import { SuppliersDiagram } from "@/components/ui/guide-diagrams/SuppliersDiagram";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { AddSupplierForm } from "./AddSupplierForm";
import type { Supplier, SupplierStatus } from "@/lib/supabase/database.types";

const STATUS_STYLE: Record<SupplierStatus, string> = {
  invited: "bg-slate-100 text-slate-600",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  suspended: "bg-amber-50 text-amber-700",
};

type SupplierListRow = Pick<Supplier, "id" | "name" | "type" | "region" | "status" | "email" | "phone" | "created_at">;

const PAGE_SIZE = 25;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("suppliers")
    .select("id, name, type, region, status, email, phone, created_at", { count: "exact" });
  if (q) {
    query = query.or(`name.ilike.%${q}%,region.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const suppliers = (data ?? []) as unknown as SupplierListRow[];

  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title="Suppliers"
        text="Transport companies and individual drivers — invite, verify and approve before they receive jobs."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Suppliers"
              subtitle="Transport companies and drivers you send paid jobs to."
              screenshot={<SuppliersDiagram />}
              sections={[
                {
                  heading: "What this page is",
                  body: [
                    "Every transport company or individual driver your team works with is a supplier record here — invited, verified and approved before they're eligible to receive job offers from Dispatch.",
                  ],
                },
                {
                  heading: "Status flow",
                  bullets: true,
                  body: [
                    "Invited — added but hasn't completed onboarding yet.",
                    "Submitted — their details/documents are in, waiting on your review.",
                    "Approved — cleared to receive job offers on Dispatch.",
                    "Rejected — didn't pass review.",
                    "Suspended — was approved, temporarily taken off active rotation (e.g. a compliance issue).",
                  ],
                },
                {
                  heading: "Using the list",
                  bullets: true,
                  body: [
                    "Search by name, region or email to find an existing supplier.",
                    "Review opens the full profile — documents, performance and the approve/reject/suspend actions.",
                    "Add supplier starts onboarding a new one.",
                  ],
                },
              ]}
            />
            <AddSupplierForm />
          </div>
        }
      />
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder="Search suppliers by name, region or email…" />
        </div>
        <div className="space-y-3 sm:hidden">
          {suppliers.map((s) => (
            <div key={s.id} className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.email}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[s.status]}`}>
                  {s.status}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                <span className="capitalize">{s.type}</span> · {s.region ?? "No region"}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">Registered {formatDate(s.created_at)}</div>
              <Link
                href={`/suppliers/${s.id}`}
                className="mt-3 inline-block rounded-lg border px-3 py-2 text-xs font-bold"
              >
                Review
              </Link>
            </div>
          ))}
          {suppliers.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No suppliers yet — add one to get started.</p>
          )}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Supplier</th>
                <th>Type</th>
                <th>Region</th>
                <th>Registered</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="whitespace-nowrap py-4">
                    <div className="font-bold">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.email}</div>
                  </td>
                  <td className="whitespace-nowrap capitalize">{s.type}</td>
                  <td className="whitespace-nowrap">{s.region ?? "—"}</td>
                  <td className="whitespace-nowrap text-slate-500">{formatDate(s.created_at)}</td>
                  <td className="whitespace-nowrap">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[s.status]}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/suppliers/${s.id}`} className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No suppliers yet — add one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Panel>
    </div>
  );
}
