"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortSelect } from "@/components/ui/SortSelect";
import { Pagination } from "@/components/ui/Pagination";
import { JourneyCell } from "@/components/ui/JourneyCell";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { useToast } from "@/components/ui/Toast";
import { assignQuoteAction } from "@/app/(staff)/quotes/actions";
import { SOURCE_LABEL } from "@/lib/leadSource";
import type { AssignableUser } from "@/components/pages/LeadDetailPage";

export type PartiallyPaidSortKey = "created_desc" | "created_asc" | "remaining_desc" | "remaining_asc" | "paid_desc" | "paid_asc";

const SORT_OPTIONS = [
  { value: "created_desc", label: "Newest created" },
  { value: "created_asc", label: "Oldest created" },
  { value: "remaining_desc", label: "Highest remaining" },
  { value: "remaining_asc", label: "Lowest remaining" },
  { value: "paid_desc", label: "Highest paid so far" },
  { value: "paid_asc", label: "Lowest paid so far" },
];

export interface PartiallyPaidQuoteRow {
  id: string;
  quote_number: string;
  currency: string;
  invoice_number: string | null;
  created_at: string;
  customers: { company_name: string | null; contact_name: string; email: string | null } | null;
  enquiries: {
    assigned_user_id: string | null;
    leads: { source: keyof typeof SOURCE_LABEL } | null;
    enquiry_legs: { pickup_address: string; destination_address: string }[];
  } | null;
  quote_versions: { selling_price: number } | null;
  profiles: { full_name: string } | null;
  paid: number;
  remaining: number;
}

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeyOf(q: PartiallyPaidQuoteRow) {
  return q.enquiries?.enquiry_legs?.[0] ?? null;
}

function sourceLabel(q: PartiallyPaidQuoteRow) {
  const source = q.enquiries?.leads?.source;
  return source ? SOURCE_LABEL[source] : "—";
}

export function PartiallyPaidQuotesPage({
  quotes,
  page,
  pageSize,
  total,
  outstandingTotal,
  outstandingCurrency,
  canAssign,
  assignableUsers,
}: {
  quotes: PartiallyPaidQuoteRow[];
  page: number;
  pageSize: number;
  total: number;
  outstandingTotal: number;
  outstandingCurrency: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
}) {
  const notify = useToast();
  const [assignQuote, setAssignQuote] = useState<PartiallyPaidQuoteRow | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignPending, startAssignTransition] = useTransition();

  function assignedNameFor(q: PartiallyPaidQuoteRow) {
    const id = q.enquiries?.assigned_user_id;
    if (!id) return null;
    return assignableUsers.find((u) => u.id === id)?.full_name ?? null;
  }

  function openAssign(q: PartiallyPaidQuoteRow) {
    setAssignError(null);
    setAssigneeId(q.enquiries?.assigned_user_id ?? "");
    setAssignQuote(q);
  }

  function closeAssign() {
    if (assignPending) return;
    setAssignQuote(null);
    setAssignError(null);
  }

  function doAssign() {
    if (!assignQuote) return;
    if (!assigneeId) {
      setAssignError("Choose someone to assign this quote to.");
      return;
    }
    if (assigneeId === assignQuote.enquiries?.assigned_user_id) {
      setAssignError("This quote is already assigned to that person.");
      return;
    }
    setAssignError(null);
    startAssignTransition(async () => {
      const result = await assignQuoteAction(assignQuote.id, assigneeId);
      if (result.error) {
        setAssignError(result.error);
        return;
      }
      const name = assignableUsers.find((u) => u.id === assigneeId)?.full_name ?? "the selected user";
      notify(`Quote assigned to ${name}`);
      setAssignQuote(null);
    });
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "Pending Quotes", href: "/quotes" }, { label: "Partially Paid" }]} />
      <PageHead
        eyebrow="Sales Workspace"
        title="Partially Paid"
        text="Quotes with a deposit or part-payment in, still waiting on the rest of the balance."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Kpi title="Partially paid quotes" value={String(total)} icon={Wallet} href="/quotes/partially-paid" />
        <Kpi title="Outstanding balance" value={money(outstandingTotal, outstandingCurrency)} icon={Wallet} href="/quotes/partially-paid" />
      </div>
      <Panel className="mt-6 min-w-0">
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <SearchInput placeholder="Search quotes (number or invoice)" />
          <SortSelect options={SORT_OPTIONS} />
        </div>

        <div className="mt-4 space-y-3 sm:hidden">
          {quotes.map((q) => (
            <div key={q.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/quotes/${q.id}`} className="font-black text-primary-600 hover:underline">
                    {q.quote_number}
                  </Link>
                  {q.invoice_number && <div className="text-xs text-slate-400">Inv {q.invoice_number}</div>}
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Partially paid</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{q.customers?.company_name || q.customers?.contact_name || "—"}</div>
              <div className="mt-1 text-sm text-slate-600">
                <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} maxWidth="100%" />
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-slate-500">Paid</span>
                <b>{money(q.paid, q.currency)}</b>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Remaining</span>
                <b className="text-amber-700">{money(q.remaining, q.currency)}</b>
              </div>
              <div className="mt-1 text-xs text-slate-400">Sales rep: {assignedNameFor(q) || q.profiles?.full_name || "—"}</div>
              <div className="mt-0.5 text-xs text-slate-400">Source: {sourceLabel(q)}</div>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/quotes/${q.id}`}
                  className="flex-1 rounded-lg border border-primary-300 px-3 py-2 text-center text-xs font-bold text-primary-700"
                >
                  View
                </Link>
                <SendEmailButton email={q.customers?.email} quoteNumber={q.quote_number} variant="row" className="flex-1" />
                {canAssign && (
                  <button
                    onClick={() => openAssign(q)}
                    className="flex-1 rounded-lg border px-3 py-2 text-center text-xs font-bold hover:bg-slate-50"
                  >
                    Assign
                  </button>
                )}
              </div>
            </div>
          ))}
          {quotes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No partially paid quotes right now.</p>}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-3 py-4">Quote</th>
                <th className="px-3 py-4">Customer</th>
                <th className="px-3 py-4">Journey</th>
                <th className="px-3 py-4">Sales Rep</th>
                <th className="px-3 py-4">Source</th>
                <th className="px-3 py-4">Paid</th>
                <th className="px-3 py-4">Remaining</th>
                <th className="px-3 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-3 py-4 font-black text-primary-600">
                    <Link href={`/quotes/${q.id}`} className="hover:underline">
                      {q.quote_number}
                    </Link>
                    {q.invoice_number && <div className="text-xs font-normal text-slate-400">Inv {q.invoice_number}</div>}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-4 font-semibold" title={q.customers?.company_name || q.customers?.contact_name || undefined}>
                    {q.customers?.company_name || q.customers?.contact_name || "—"}
                  </td>
                  <td className="px-3 py-4 text-slate-600">
                    <JourneyCell pickup={journeyOf(q)?.pickup_address} destination={journeyOf(q)?.destination_address} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{assignedNameFor(q) || q.profiles?.full_name || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{sourceLabel(q)}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-bold text-emerald-700">{money(q.paid, q.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-black text-amber-700">{money(q.remaining, q.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="shrink-0 whitespace-nowrap rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                      >
                        View
                      </Link>
                      <SendEmailButton email={q.customers?.email} quoteNumber={q.quote_number} variant="row" />
                      {canAssign && (
                        <button
                          onClick={() => openAssign(q)}
                          className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                    No partially paid quotes right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>

      {assignQuote && (
        <ConfirmDetailModal
          open
          onClose={closeAssign}
          title={`Assign ${assignQuote.quote_number}`}
          description="Hand this quote to a specific sales user — moves it onto their list the same way reassigning its lead would."
          pending={assignPending}
          error={assignError}
          details={[{ label: "Currently", value: assignedNameFor(assignQuote) || <span className="font-bold text-primary-600">Unassigned</span> }]}
          confirmLabel="Assign"
          onConfirm={doAssign}
        >
          <label className="block text-sm font-bold">
            Assign to
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            >
              <option value="">Choose a sales user…</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </label>
        </ConfirmDetailModal>
      )}
    </div>
  );
}
