"use client";

import { useEffect, useState, useTransition } from "react";
import { Send, CheckCircle2, Timer, FileText, RefreshCw, Tag } from "lucide-react";
import { AiBadge } from "@/components/ui/AiBadge";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import Link from "next/link";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortSelect } from "@/components/ui/SortSelect";
import { Pagination } from "@/components/ui/Pagination";
import { JourneyCell } from "@/components/ui/JourneyCell";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { useToast } from "@/components/ui/Toast";
import { PageGuide } from "@/components/ui/PageGuide";
import { QuotesDiagram } from "@/components/ui/guide-diagrams/QuotesDiagram";
import { resendQuoteEmailAction, resendQuoteEmailsBulkAction, estimateQuotePriceAction, assignQuoteAction } from "@/app/(staff)/quotes/actions";
import type { QuoteStatus } from "@/lib/supabase/database.types";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_STYLE } from "@/lib/quoteStatus";
import { formatDateTime, formatDateAndTime, isPastDate } from "@/lib/formatDate";
import { SOURCE_LABEL } from "@/lib/leadSource";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import type { AssignableUser } from "@/components/pages/LeadDetailPage";

export type QuoteSortKey =
  | "created_desc"
  | "created_asc"
  | "pickup_asc"
  | "pickup_desc"
  | "sent_desc"
  | "viewed_desc"
  | "value_desc"
  | "value_asc"
  | "expiry_asc";

const SORT_OPTIONS: { value: QuoteSortKey; label: string }[] = [
  { value: "created_desc", label: "Newest created" },
  { value: "created_asc", label: "Oldest created" },
  { value: "pickup_asc", label: "Pickup date: soonest" },
  { value: "pickup_desc", label: "Pickup date: latest" },
  { value: "sent_desc", label: "Recently sent" },
  { value: "viewed_desc", label: "Recently viewed by customer" },
  { value: "value_desc", label: "Highest value" },
  { value: "value_asc", label: "Lowest value" },
  { value: "expiry_asc", label: "Expiring soonest" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "awaiting_response", label: "Awaiting response" },
  { value: "accepted", label: "Accepted — awaiting payment" },
];

export interface QuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  expiry_at: string | null;
  invoice_number: string | null;
  public_token: string;
  created_at: string;
  sent_at: string | null;
  viewed_at: string | null;
  customers: { company_name: string | null; contact_name: string; email: string | null } | null;
  enquiries: {
    assigned_user_id: string | null;
    leads: { source: keyof typeof SOURCE_LABEL } | null;
    enquiry_legs: { pickup_address: string; destination_address: string; pickup_date: string | null; pickup_time: string | null }[];
  } | null;
  /** original_price/discount_* are set when a Special Deal is on the quote (0114_special_deals.sql). */
  quote_versions: {
    selling_price: number;
    original_price?: number | null;
    discount_percent?: number | null;
    discount_source?: "special_deal" | "too_expensive_auto" | null;
  } | null;
  profiles: { full_name: string } | null;
  ai_generated: boolean;
  ai_model: { provider: string; model: string } | null;
  ai_estimated_price: number | null;
  ai_estimated_price_currency: string | null;
}

// A resend only makes sense once a quote has actually been sent at least
// once — mirrors QuoteDetailActions' EMAILABLE gate, and every status past
// "sent" (viewed/accepted) still has sent_at set, so this one check covers
// all of them without importing the status list.
function canResendQuote(q: QuoteRow) {
  return !!q.sent_at;
}

function money(amount: number | undefined, currency: string) {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function journeyOf(q: QuoteRow) {
  return q.enquiries?.enquiry_legs?.[0] ?? null;
}

function sourceLabel(q: QuoteRow) {
  const source = q.enquiries?.leads?.source;
  return source ? SOURCE_LABEL[source] : "—";
}

// One label/value tile — every field in a quote card renders through this,
// so they all share the same box, spacing and label style instead of each
// section improvising its own layout (which is what made the card feel
// scattered: three different grids that didn't line up with each other).
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx("min-w-0 rounded-lg bg-slate-50 px-3 py-2", className)}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 min-w-0 text-sm font-semibold text-slate-800">{children}</div>
    </div>
  );
}

function pickupInfo(q: QuoteRow) {
  const leg = journeyOf(q);
  if (!leg?.pickup_date) return "—";
  return formatDateAndTime(leg.pickup_date, leg.pickup_time);
}

// Every row on this page is already draft/sent/viewed/accepted (Pending
// Quotes' own status filter) — none of those are a terminal state, so a
// row whose travel date has already gone by is, by definition, a trip that
// never got paid/actioned in time and needs a human's attention.
function isOverdue(q: QuoteRow) {
  return isPastDate(journeyOf(q)?.pickup_date);
}

export function QuotesPage({
  quotes,
  canCreateQuote,
  canResend,
  canAssign,
  assignableUsers,
  canViewAiEstimate,
  page,
  pageSize,
  total,
  draftCount,
  sentCount,
  acceptedCount,
  totalCount,
  pipelineValue,
  pipelineCurrency,
}: {
  quotes: QuoteRow[];
  canCreateQuote: boolean;
  canResend: boolean;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
  canViewAiEstimate: boolean;
  page: number;
  pageSize: number;
  total: number;
  draftCount: number;
  sentCount: number;
  acceptedCount: number;
  totalCount: number;
  pipelineValue: number;
  pipelineCurrency: string;
}) {
  const notify = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [confirmSingle, setConfirmSingle] = useState<QuoteRow | null>(null);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [assignQuote, setAssignQuote] = useState<QuoteRow | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignPending, startAssignTransition] = useTransition();
  const [pending, startTransition] = useTransition();
  const [bulkPending, startBulkTransition] = useTransition();
  const [estimatingId, setEstimatingId] = useState<string | null>(null);
  const [estimatePending, startEstimateTransition] = useTransition();
  // The quote id whose AI response popup is currently open — separate from
  // estimateOverrides below so reopening it (the "View AI response" link)
  // doesn't need another round trip once an estimate's already in state.
  const [aiEstimateModalId, setAiEstimateModalId] = useState<string | null>(null);
  // Overrides what the server rendered, per quote id, the moment a fresh
  // estimate comes back — without this, "Get AI estimate" would need a full
  // page reload (router.refresh()) to show its own result.
  const [estimateOverrides, setEstimateOverrides] = useState<
    Record<
      string,
      {
        price: number;
        currency: string;
        supplierCost: number | null;
        // Set only when the AI priced this in a different currency than the
        // quote's own and it got converted for display — see
        // estimateQuotePriceAction.
        originalPrice: number | null;
        originalCurrency: string | null;
        vehicleDescription: string | null;
        rationale: string | null;
        distanceKm: number | null;
        legCount: number | null;
        historicalRatePerKm: number | null;
        historicalSampleSize: number | null;
      }
    >
  >({});

  function aiEstimateFor(q: QuoteRow) {
    return (
      estimateOverrides[q.id] ??
      (q.ai_estimated_price != null
        ? {
            price: q.ai_estimated_price,
            currency: q.ai_estimated_price_currency!,
            supplierCost: null,
            originalPrice: null,
            originalCurrency: null,
            vehicleDescription: null,
            rationale: null,
            distanceKm: null,
            legCount: null,
            historicalRatePerKm: null,
            historicalSampleSize: null,
          }
        : null)
    );
  }

  function runEstimate(id: string) {
    setEstimatingId(id);
    startEstimateTransition(async () => {
      const result = await estimateQuotePriceAction(id);
      if (result.error) {
        notify(result.error);
      } else {
        setEstimateOverrides((prev) => ({
          ...prev,
          [id]: {
            price: result.estimatedPrice!,
            currency: result.currency!,
            supplierCost: result.supplierEstimatedCost ?? null,
            originalPrice: result.originalPrice ?? null,
            originalCurrency: result.originalCurrency ?? null,
            vehicleDescription: result.vehicleDescription ?? null,
            rationale: result.rationale ?? null,
            distanceKm: result.distanceKm ?? null,
            legCount: result.legCount ?? null,
            historicalRatePerKm: result.historicalRatePerKm ?? null,
            historicalSampleSize: result.historicalSampleSize ?? null,
          },
        }));
        // Pop up the full AI response immediately — a bare number with no
        // reasoning behind it was the whole complaint this replaces.
        setAiEstimateModalId(id);
      }
      setEstimatingId(null);
    });
  }

  // The quotes on screen change on every page/search/sort navigation — drop
  // any selected id that's no longer visible instead of carrying stale
  // selections across pages.
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(quotes.map((q) => q.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [quotes]);

  const eligibleIds = quotes.filter(canResendQuote).map((q) => q.id);
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));

  function copyLink(token: string) {
    const link = `${window.location.origin}/q/${token}`;
    navigator.clipboard.writeText(link).then(() => notify("Quote link copied"));
  }

  function assignedNameFor(q: QuoteRow) {
    const id = q.enquiries?.assigned_user_id;
    if (!id) return null;
    return assignableUsers.find((u) => u.id === id)?.full_name ?? null;
  }

  function openAssign(q: QuoteRow) {
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

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleIds));
  }

  function confirmResendOne() {
    const quote = confirmSingle;
    if (!quote) return;
    setResendingId(quote.id);
    startTransition(async () => {
      const result = await resendQuoteEmailAction(quote.id);
      notify(result?.error ? `Could not resend: ${result.error}` : "Quote email resent");
      setResendingId(null);
      setConfirmSingle(null);
    });
  }

  function confirmResendBulk() {
    const ids = [...selected];
    startBulkTransition(async () => {
      const result = await resendQuoteEmailsBulkAction(ids);
      notify(
        result.failed.length === 0
          ? `Resent ${result.sent} quote${result.sent === 1 ? "" : "s"}`
          : `Resent ${result.sent} · ${result.failed.length} failed`,
      );
      setSelected(new Set());
      setConfirmBulkOpen(false);
    });
  }

  const aiEstimateModalQuote = quotes.find((q) => q.id === aiEstimateModalId) ?? null;
  const aiEstimateModalData = aiEstimateModalQuote ? aiEstimateFor(aiEstimateModalQuote) : null;

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Pending Quotes"
        text="Everything up to customer payment — once marked as paid on Customer Payments a quote moves to Confirmed Booking; rejected or expired quotes move to Lost Booking."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Pending Quotes"
              subtitle="Every priced enquiry, from draft through to customer payment."
              screenshot={<QuotesDiagram />}
              sections={[
                {
                  heading: "What a quote is",
                  body: [
                    "A quote is a priced version of an enquiry — created from a lead once you know the route, vehicle and price. It has its own quote number and a shareable link the customer can view and accept online.",
                  ],
                },
                {
                  heading: "The lifecycle",
                  bullets: true,
                  body: [
                    "Draft — being built, not yet sent to the customer.",
                    "Sent — the customer has been emailed/given the quote link.",
                    "Viewed — the customer has opened the link.",
                    "Accepted — the customer approved it and it's awaiting payment.",
                    "Once payment is confirmed on Customer Payments, it moves to Confirmed Booking.",
                    "If the customer rejects it or it expires unactioned, it moves to Lost Booking instead.",
                  ],
                },
                {
                  heading: "Working a quote",
                  bullets: true,
                  body: [
                    "Add New Quote starts a fresh quote (normally reached from a lead via Create Quote).",
                    "View opens the full quote detail — pricing, versions and customer activity.",
                    "Copy Link grabs the customer-facing link for a Sent/Viewed quote so you can share it directly (e.g. over WhatsApp or email).",
                    "Resend re-sends the quote email (with a freshly generated PDF) — select several with their checkboxes to resend them all at once.",
                  ],
                },
                {
                  heading: "Editing after the fact",
                  bullets: true,
                  body: [
                    "Edit Booking, on the quote detail page, works at any stage — draft through fully paid — right up until the job is marked completed by the supplier.",
                    "Change the pickup, destination, date, time, passengers or luggage; optionally charge or credit the customer, and/or adjust what a supplier is owed — a reason is always required.",
                    "A positive customer amount adds to the balance due (the customer gets an emailed link to pay it); a negative amount lowers the price and auto-queues a refund if that leaves them overpaid.",
                    "Every edit is logged to that quote's Edit history panel with who made it, why, and a before/after diff, and (when relevant) emails both the customer and the supplier — the same button and history also appear on the matching Dispatch job page.",
                    "If a supplier had already accepted or confirmed the job, they're not just notified — the job goes to Awaiting supplier re-approval and they have to explicitly approve or reject the change before it proceeds. A rejection pulls the job off them entirely and reopens it on Dispatch to offer to someone else; either outcome shows up in Edit history.",
                  ],
                },
                {
                  heading: "The KPI cards",
                  bullets: true,
                  body: [
                    "Draft — quotes not yet sent.",
                    "Awaiting response — sent/viewed quotes, with the total pipeline value still open.",
                    "Accepted — awaiting payment — won quotes waiting on the customer to pay.",
                    "Total quotes (all time) — every quote ever created, regardless of status.",
                  ],
                },
              ]}
            />
            {canCreateQuote ? (
              <Link
                href="/quotes/new"
                className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
              >
                <FileText size={17} />
                Add New Quote
              </Link>
            ) : undefined}
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Draft" value={String(draftCount)} icon={FileText} href="/quotes?status=draft" />
        <Kpi
          title="Awaiting response"
          value={String(sentCount)}
          delta={money(pipelineValue, pipelineCurrency) + " pipeline"}
          icon={Send}
          href="/quotes?status=awaiting_response"
        />
        <Kpi title="Accepted — awaiting payment" value={String(acceptedCount)} icon={CheckCircle2} href="/quotes?status=accepted" />
        {/* Not clickable: this list structurally never includes paid/lost quotes
            (they live on Confirmed/Lost Booking), so there's no view on this
            page that honestly shows "all quotes ever" behind this number. */}
        <Kpi title="Total quotes (all time)" value={String(totalCount)} icon={Timer} />
      </div>
      <Panel className="mt-6 min-w-0">
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <SearchInput placeholder="Search quotes (number or invoice)" />
          <SortSelect options={STATUS_OPTIONS} paramName="status" />
          <SortSelect options={SORT_OPTIONS} />
        </div>

        {canResend && selected.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
            <span className="text-sm font-bold text-primary-700">
              {selected.size} quote{selected.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set())} className="rounded-lg border px-3 py-2 text-xs font-bold">
                Clear
              </button>
              <button
                onClick={() => setConfirmBulkOpen(true)}
                disabled={bulkPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                <RefreshCw size={14} />
                {bulkPending ? "Resending…" : `Resend ${selected.size} Quote${selected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {canResend && quotes.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs font-bold text-slate-400">
              <input
                type="checkbox"
                checked={allEligibleSelected}
                onChange={toggleAll}
                disabled={eligibleIds.length === 0}
                className="h-4 w-4 rounded border-slate-300"
              />
              Select all sent quotes on this page
            </label>
          )}

          {quotes.map((q) => {
            const leg = journeyOf(q);
            const isResendable = canResendQuote(q);
            const isSelected = selected.has(q.id);
            const customerLabel = q.customers?.company_name || q.customers?.contact_name || "—";
            return (
              <div
                key={q.id}
                className={clsx(
                  "rounded-2xl border p-4 shadow-sm transition-colors sm:p-5",
                  isSelected ? "border-primary-300 bg-primary-50/40" : "border-slate-200 bg-white",
                )}
              >
                {/* Header: quote number + status */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-start gap-3">
                    {canResend && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(q.id)}
                        disabled={!isResendable}
                        title={isResendable ? "Select for bulk resend" : "This quote hasn't been sent yet"}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 disabled:opacity-30"
                      />
                    )}
                    <div>
                      <Link href={`/quotes/${q.id}`} className="font-black text-primary-600 hover:underline">
                        {q.quote_number}
                      </Link>
                      {q.invoice_number && <div className="text-xs font-normal text-slate-400">Inv {q.invoice_number}</div>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {q.ai_generated && <AiBadge model={q.ai_model} />}
                    {q.quote_versions?.discount_percent != null && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200"
                        title={q.quote_versions.discount_source === "too_expensive_auto" ? "Discount sent automatically after the customer said too expensive" : "Today’s Special Deal applied by staff"}
                      >
                        <Tag size={12} />
                        {Number(q.quote_versions.discount_percent)}% off{q.quote_versions.discount_source === "too_expensive_auto" ? " · Auto" : ""}
                      </span>
                    )}
                    {isOverdue(q) && <OverdueBadge />}
                    <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + QUOTE_STATUS_STYLE[q.status]}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                  </div>
                </div>

                {/* Every field renders through the same Field tile, in one
                    grid, so nothing drifts out of alignment with anything
                    else on the card. Row 1 (customer / journey / value) and
                    row 2 (rep / pickup / sent / viewed) both add up to 4
                    columns on sm+, so the two rows line up with each other;
                    on mobile every tile is simply full-width and stacked. */}
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Field label="Customer">
                    <span className="block truncate" title={customerLabel}>
                      {customerLabel}
                    </span>
                  </Field>
                  <Field label="Journey" className="sm:col-span-2">
                    <JourneyCell pickup={leg?.pickup_address} destination={leg?.destination_address} maxWidth="100%" />
                  </Field>
                  <Field label="Value" className="sm:text-right">
                    {q.quote_versions?.original_price != null && (
                      <span className="mr-1.5 text-xs font-semibold text-slate-400 line-through">{money(q.quote_versions.original_price, q.currency)}</span>
                    )}
                    <span className="text-base font-black text-slate-900">{money(q.quote_versions?.selling_price, q.currency)}</span>
                  </Field>

                  <Field label="Sales Rep">
                    <span className="block truncate">{assignedNameFor(q) || q.profiles?.full_name || "—"}</span>
                  </Field>
                  <Field label="Pickup Date">{pickupInfo(q)}</Field>
                  <Field label="Sent">{q.sent_at ? formatDateTime(q.sent_at) : "—"}</Field>
                  <Field label="Customer Viewed">
                    {q.viewed_at ? formatDateTime(q.viewed_at) : <span className="text-slate-400">Not viewed yet</span>}
                  </Field>
                  {/* Shares its row with AI Est. Price below when that's
                      visible (1 + 3 = 4 columns) so Source never sits alone
                      on an otherwise-empty row; spans the full row itself
                      for anyone who can't see the AI estimate. */}
                  <Field label="Source" className={canViewAiEstimate ? undefined : "sm:col-span-4"}>
                    {sourceLabel(q)}
                  </Field>

                  {/* Master Admin only — an internal pricing benchmark, not
                      anything a customer or regular staff should see. */}
                  {canViewAiEstimate && (
                    <Field label="AI Est. Price" className="sm:col-span-3">
                      {(() => {
                        const estimate = aiEstimateFor(q);
                        const isEstimating = estimatePending && estimatingId === q.id;
                        const sellingPrice = q.quote_versions?.selling_price;
                        const seemsUnderpriced = estimate && sellingPrice !== undefined && sellingPrice < estimate.price * 0.9;
                        return (
                          <div className="flex flex-wrap items-center gap-2">
                            {estimate ? (
                              <span className={clsx("font-black", seemsUnderpriced ? "text-amber-600" : "text-slate-900")}>
                                {money(estimate.price, estimate.currency)}
                                {estimate.distanceKm != null && (
                                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                                    (≈{estimate.distanceKm} km{estimate.legCount && estimate.legCount > 1 ? ` across ${estimate.legCount} legs` : ""})
                                  </span>
                                )}
                                {seemsUnderpriced && <span className="ml-1.5 text-xs font-normal">(quoted below AI estimate)</span>}
                              </span>
                            ) : (
                              <span className="text-slate-400">Not estimated yet</span>
                            )}
                            {estimate?.rationale && (
                              <button
                                onClick={() => setAiEstimateModalId(q.id)}
                                className="text-xs font-bold text-primary-600 hover:underline"
                              >
                                View AI response
                              </button>
                            )}
                            <button
                              onClick={() => runEstimate(q.id)}
                              disabled={isEstimating}
                              title="Estimate this trip's price with AI, from its journey details"
                              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold hover:bg-slate-50 disabled:opacity-60"
                            >
                              <RefreshCw size={11} className={isEstimating ? "animate-spin" : undefined} />
                              {isEstimating ? "Estimating…" : estimate ? "Re-estimate" : "Get AI estimate"}
                            </button>
                          </div>
                        );
                      })()}
                    </Field>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={`/quotes/${q.id}`}
                    className="rounded-lg border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50"
                  >
                    View
                  </Link>
                  <SendEmailButton email={q.customers?.email} quoteNumber={q.quote_number} variant="row" />
                  {(q.status === "sent" || q.status === "viewed") && (
                    <button
                      onClick={() => copyLink(q.public_token)}
                      className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50"
                    >
                      Copy Link
                    </button>
                  )}
                  {canResend && isResendable && (
                    <button
                      onClick={() => setConfirmSingle(q)}
                      disabled={pending && resendingId === q.id}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50 disabled:opacity-60"
                    >
                      <RefreshCw size={13} />
                      {pending && resendingId === q.id ? "Resending…" : "Resend"}
                    </button>
                  )}
                  {canAssign && (
                    <button onClick={() => openAssign(q)} className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50">
                      Assign
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {quotes.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No quotes yet — build one from an enquiry.</p>}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>

      <ConfirmDetailModal
        open={!!confirmSingle}
        onClose={() => !pending && setConfirmSingle(null)}
        title="Resend this quote?"
        description="This resends the quote email, with a freshly generated PDF, to the customer."
        details={
          confirmSingle
            ? [
                { label: "Quote", value: confirmSingle.quote_number },
                { label: "Customer", value: confirmSingle.customers?.company_name || confirmSingle.customers?.contact_name || "—" },
                { label: "Value", value: money(confirmSingle.quote_versions?.selling_price, confirmSingle.currency) },
              ]
            : []
        }
        confirmLabel="Resend"
        pending={pending}
        onConfirm={confirmResendOne}
      />

      <ConfirmDetailModal
        open={confirmBulkOpen}
        onClose={() => !bulkPending && setConfirmBulkOpen(false)}
        title={`Resend ${selected.size} quote${selected.size === 1 ? "" : "s"}?`}
        description="This resends the quote email, with a freshly generated PDF, to the customer on each selected quote."
        confirmLabel={`Resend ${selected.size}`}
        pending={bulkPending}
        onConfirm={confirmResendBulk}
      />

      <ConfirmDetailModal
        open={!!aiEstimateModalQuote && !!aiEstimateModalData}
        onClose={() => setAiEstimateModalId(null)}
        title={`AI response — ${aiEstimateModalQuote?.quote_number ?? ""}`}
        description="What the AI model actually said when it priced this trip — not just the headline number."
        cancelLabel="Close"
        details={
          aiEstimateModalData
            ? [
                { label: "Recommended vehicle", value: aiEstimateModalData.vehicleDescription ?? "—" },
                { label: "Supplier cost estimate", value: money(aiEstimateModalData.supplierCost ?? undefined, aiEstimateModalData.currency) },
                { label: "Suggested selling price", value: money(aiEstimateModalData.price, aiEstimateModalData.currency) },
                ...(aiEstimateModalData.originalPrice != null && aiEstimateModalData.originalCurrency != null
                  ? [
                      {
                        label: "AI's own currency",
                        value: `Priced at ${money(aiEstimateModalData.originalPrice, aiEstimateModalData.originalCurrency)} based on local market rates, converted to ${aiEstimateModalData.currency} above at today's exchange rate`,
                      },
                    ]
                  : []),
                ...(aiEstimateModalData.distanceKm != null
                  ? [
                      {
                        label: "Distance",
                        value: `${aiEstimateModalData.distanceKm} km${aiEstimateModalData.legCount && aiEstimateModalData.legCount > 1 ? ` across ${aiEstimateModalData.legCount} legs` : ""}`,
                      },
                    ]
                  : []),
                ...(aiEstimateModalData.historicalRatePerKm != null
                  ? [
                      {
                        label: "Your own historical rate",
                        value: `${money(aiEstimateModalData.historicalRatePerKm, aiEstimateModalData.currency)}/km, from ${aiEstimateModalData.historicalSampleSize} similar past booking${aiEstimateModalData.historicalSampleSize === 1 ? "" : "s"} — shown for comparison only, not used in the price above`,
                      },
                    ]
                  : []),
              ]
            : []
        }
      >
        {aiEstimateModalData?.rationale && (
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">AI&apos;s reasoning</div>
            <p className="mt-1 text-sm text-slate-700">{aiEstimateModalData.rationale}</p>
          </div>
        )}
      </ConfirmDetailModal>

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
