"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BackLink } from "@/components/ui/BackLink";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { FormattedText } from "@/components/ui/FormattedText";
import {
  createAllocationAction,
  editAllocationLegsAction,
  offerAllocationToSuppliersAction,
  withdrawAllocationOffersAction,
  cancelAllocationAction,
  attachManualInvoiceNoteAction,
  transferSupplierInvoiceToAccountingAction,
  updateAllocationTermsAction,
} from "@/app/(staff)/dispatch/actions";
import { cancelBookingAction, assignQuoteAction } from "@/app/(staff)/quotes/actions";
import { MoveDetailCard, type MoveLeg } from "@/components/pages/MoveDetailCard";
import { pickMoveDetails } from "@/lib/moveDetails";
import { EditBookingButton, type EditableMove } from "@/components/pages/EditBookingButton";
import { BookingEditHistory, type BookingEditRecord } from "@/components/pages/BookingEditHistory";
import { RejectionHistory, type JobRejectionRecord } from "@/components/pages/RejectionHistory";
import type { AssignableUser } from "@/components/pages/LeadDetailPage";
import { BRAND } from "@/lib/brandConfig";

export type { JobRejectionRecord };

import { formatDateTime, formatDateAndTime } from "@/lib/formatDate";
import type { JobOfferStatus, JobStatus, JobSupplierInvoice, SupplierPaymentStatus, QuoteStatus } from "@/lib/supabase/database.types";
import type { SupplierOption } from "@/components/pages/DispatchBoard";
import type { RouteDistance } from "@/lib/moveDistance";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";

type DispatchLeg = MoveLeg & { id: string };

const CANCELLABLE_STATUSES: QuoteStatus[] = ["accepted", "partially_paid", "paid"];

export interface JobDetailRow {
  id: string;
  status: JobStatus;
  region: string | null;
  created_at: string;
  quotes: {
    id: string;
    status: QuoteStatus;
    quote_number: string;
    currency: string;
    customers: { company_name: string | null; contact_name: string; phone: string | null; whatsapp: string | null; email: string | null } | null;
    enquiries: { assigned_user_id: string | null; enquiry_legs: DispatchLeg[] } | null;
    quote_versions: { selling_price: number; supplier_estimated_cost: number | null } | null;
    profiles: { full_name: string } | null;
  } | null;
}

interface SupplierPaymentRow {
  id: string;
  amount: number;
  currency: string;
  bank_reference: string | null;
  paid_at: string;
}

export interface JobAllocationRow {
  id: string;
  status: JobStatus;
  assigned_supplier_id: string | null;
  vehicle_notes: string | null;
  agreed_cost: number | null;
  currency: string | null;
  supplier_payment_status: SupplierPaymentStatus;
  manual_invoice_note: string | null;
  manual_invoice_url: string | null;
  offered_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
  suppliers: { id: string; name: string; region: string | null; phone: string | null; whatsapp: string | null; email: string | null } | null;
  job_allocation_legs: { enquiry_leg_id: string }[];
  job_allocation_offers: {
    id: string;
    status: JobOfferStatus;
    offered_at: string;
    responded_at: string | null;
    suppliers: { id: string; name: string; region: string | null } | null;
  }[];
  job_supplier_invoices: JobSupplierInvoice | null;
  supplier_payments: SupplierPaymentRow[];
}

const OFFER_STATUS_STYLE: Record<JobOfferStatus, string> = {
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-500",
};

const STATUS_STYLE: Record<JobStatus, string> = {
  unassigned: "bg-slate-100 text-slate-600",
  offered: "bg-blue-50 text-blue-700",
  accepted_by_supplier: "bg-amber-50 text-amber-700",
  rejected_by_supplier: "bg-red-50 text-red-700",
  pending_reapproval: "bg-orange-50 text-orange-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

const PAYMENT_STATUS_STYLE: Record<SupplierPaymentStatus, string> = {
  unpaid: "bg-slate-100 text-slate-600",
  partially_paid: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function legRouteSummary(legs: DispatchLeg[]) {
  if (legs.length === 0) return "—";
  if (legs.length === 1) return `${legs[0]!.pickup_address} → ${legs[0]!.destination_address}`;
  const sequences = legs.map((l) => l.sequence).sort((a, b) => a - b);
  return `Legs ${sequences.join(", ")}`;
}

function AllocationCard({
  jobId,
  allocation,
  legs,
  invoiceUrl,
  suppliers,
  canDispatchJobs,
  canTransferInvoice,
}: {
  jobId: string;
  allocation: JobAllocationRow;
  legs: DispatchLeg[];
  invoiceUrl: string | null;
  suppliers: SupplierOption[];
  canDispatchJobs: boolean;
  canTransferInvoice: boolean;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(() =>
    suppliers
      .filter((s) => s.region && legs.some((l) => l.pickup_address.toLowerCase().includes(s.region!.toLowerCase())))
      .map((s) => s.id),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [note, setNote] = useState(allocation.manual_invoice_note ?? "");
  const [url, setUrl] = useState(allocation.manual_invoice_url ?? "");
  const [editingLegs, setEditingLegs] = useState(false);
  const [costInput, setCostInput] = useState("");

  const canOffer = canDispatchJobs && (allocation.status === "unassigned" || allocation.status === "rejected_by_supplier");
  const canWithdraw = canDispatchJobs && allocation.status === "offered";
  const canCancel = canDispatchJobs && !["completed", "cancelled"].includes(allocation.status);
  const invoice = allocation.job_supplier_invoices;

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.region ?? "").toLowerCase().includes(q));
  }, [suppliers, search]);

  function toggleSupplier(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function offer() {
    startTransition(async () => {
      try {
        await offerAllocationToSuppliersAction(allocation.id, selected);
        notify(`Offered to ${selected.length} supplier${selected.length === 1 ? "" : "s"}`);
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not offer this allocation.");
      }
    });
  }

  function withdraw() {
    startTransition(async () => {
      try {
        await withdrawAllocationOffersAction(allocation.id);
        notify("Offers withdrawn");
        setWithdrawOpen(false);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not withdraw the offers.");
      }
    });
  }

  function cancel() {
    startTransition(async () => {
      try {
        await cancelAllocationAction(allocation.id);
        notify("Allocation cancelled — the move is available to allocate again");
        setCancelOpen(false);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not cancel this allocation.");
      }
    });
  }

  function transfer() {
    startTransition(async () => {
      try {
        await transferSupplierInvoiceToAccountingAction(allocation.id);
        notify("Invoice forwarded to accounting");
        setTransferOpen(false);
        router.refresh();
      } catch (err) {
        setModalError(err instanceof Error ? err.message : "Could not forward this invoice.");
      }
    });
  }

  function saveNote() {
    startTransition(async () => {
      try {
        await attachManualInvoiceNoteAction(allocation.id, note, url);
        notify("Invoice reference saved");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the invoice reference.");
      }
    });
  }

  function saveCost() {
    const value = Number(costInput);
    if (!costInput.trim() || Number.isNaN(value) || value < 0) {
      notify("Enter a valid cost.");
      return;
    }
    startTransition(async () => {
      try {
        await updateAllocationTermsAction(allocation.id, allocation.vehicle_notes ?? "", value, allocation.currency ?? BRAND.defaultCurrency);
        notify("Agreed cost saved");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the agreed cost.");
      }
    });
  }

  function removeLeg(legId: string) {
    const remaining = legs.filter((l) => l.id !== legId).map((l) => l.id);
    if (remaining.length === 0) {
      notify("An allocation needs the move — cancel it instead.");
      return;
    }
    startTransition(async () => {
      try {
        await editAllocationLegsAction(allocation.id, remaining);
        notify("Move removed from this allocation");
        router.refresh();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not update this allocation.");
      }
    });
  }

  const selectedNames = suppliers.filter((s) => selected.includes(s.id)).map((s) => s.name);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>{legRouteSummary(legs)}</b>
          {allocation.vehicle_notes && <div className="text-xs text-slate-500">{allocation.vehicle_notes}</div>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLE[allocation.status]}`}>
          {allocation.status.replaceAll("_", " ")}
        </span>
      </div>

      {allocation.status === "unassigned" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setEditingLegs((v) => !v)}
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            {editingLegs ? "Done editing" : "Edit move"}
          </button>
          {editingLegs && (
            <div className="mt-2 space-y-1">
              {legs.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    Leg {l.sequence} · {l.pickup_address} → {l.destination_address}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLeg(l.id)}
                    disabled={pending}
                    className="rounded-lg p-1 text-red-500 hover:bg-red-50"
                    aria-label="Remove the move from this allocation"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {allocation.agreed_cost != null ? (
        <p className="mt-2 text-sm text-slate-600">
          Agreed cost: <b>{money(allocation.agreed_cost, allocation.currency ?? BRAND.defaultCurrency)}</b>
        </p>
      ) : (
        canDispatchJobs &&
        !["completed", "cancelled"].includes(allocation.status) && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700">
              No agreed cost set — the supplier can&apos;t submit an invoice until one is added.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                placeholder={`Agreed cost (${allocation.currency ?? BRAND.defaultCurrency})`}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={pending}
                onClick={saveCost}
                className="shrink-0 rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        )
      )}

      {allocation.suppliers && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          <span>
            Assigned to {allocation.suppliers.name}
            {allocation.suppliers.phone && ` · ${allocation.suppliers.phone}`}
          </span>
          <WhatsAppLink number={allocation.suppliers.whatsapp || allocation.suppliers.phone} />
        </div>
      )}

      {allocation.job_allocation_offers.length > 0 && (
        <div className="mt-3 space-y-2">
          {allocation.job_allocation_offers.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
              <div>
                <b>{o.suppliers?.name ?? "Unknown supplier"}</b>
                <div className="text-xs text-slate-400">{o.suppliers?.region ?? "No region"}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${OFFER_STATUS_STYLE[o.status]}`}>{o.status}</span>
            </div>
          ))}
        </div>
      )}

      {canOffer && (
        <div className="mt-4 rounded-xl border p-3">
          <div className="text-xs font-black uppercase tracking-wide text-primary-500">Offer to suppliers</div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers by name or region…"
              className="w-full rounded-lg border bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none"
            />
          </div>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {filteredSuppliers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                <span className="flex-1">{s.name}</span>
                {s.region && <span className="text-xs text-slate-400">{s.region}</span>}
              </label>
            ))}
            {filteredSuppliers.length === 0 && <p className="py-3 text-center text-xs text-slate-500">No matching suppliers.</p>}
          </div>
          <button
            type="button"
            disabled={pending || selected.length === 0}
            onClick={() => {
              setModalError(null);
              setConfirmOpen(true);
            }}
            className="mt-3 w-full rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            Offer to {selected.length} supplier{selected.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {canWithdraw && (
        <button
          disabled={pending}
          onClick={() => {
            setModalError(null);
            setWithdrawOpen(true);
          }}
          className="mt-4 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
        >
          Withdraw all offers
        </button>
      )}

      {invoice && (
        <div className="mt-4 border-t pt-4">
          <div className="text-xs font-black uppercase tracking-wide text-primary-500">Supplier&apos;s uploaded invoice</div>
          <div className="mt-2 flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
            <div>
              <b>
                {invoice.currency} {invoice.amount.toFixed(2)}
              </b>
              <div className="text-xs text-slate-400">
                {invoice.notes ? <FormattedText text={invoice.notes} /> : "No notes"}
              </div>
            </div>
            {invoiceUrl ? (
              <a href={invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                View file
              </a>
            ) : (
              <span className="text-xs text-slate-400">{invoice.file_name}</span>
            )}
          </div>
          {invoice.status === "forwarded_to_accounting" ? (
            <div
              className={`mt-3 rounded-xl px-4 py-3 text-sm font-bold ${
                allocation.supplier_payment_status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
              }`}
            >
              {allocation.supplier_payment_status === "paid"
                ? "Paid in full"
                : allocation.supplier_payment_status === "partially_paid"
                  ? "Forwarded to accounting — partially paid"
                  : "Forwarded to accounting — awaiting payment"}
            </div>
          ) : canTransferInvoice ? (
            <button
              disabled={pending}
              onClick={() => {
                setModalError(null);
                setTransferOpen(true);
              }}
              className="mt-3 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              Transfer to Accountant
            </button>
          ) : null}
        </div>
      )}

      {invoice?.status === "forwarded_to_accounting" && (
        <div className="mt-4 border-t pt-4">
          <div className="flex items-start justify-between">
            <div className="text-xs font-black uppercase tracking-wide text-primary-500">Supplier Payment</div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${PAYMENT_STATUS_STYLE[allocation.supplier_payment_status]}`}>
              {allocation.supplier_payment_status.replaceAll("_", " ")}
            </span>
          </div>
          <div className="mt-2 space-y-2 text-sm">
            {allocation.supplier_payments.map((p) => (
              <div key={p.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-1.5 last:border-0">
                <span className="text-slate-500">
                  {formatDateTime(p.paid_at)}
                  {p.bank_reference ? ` · ${p.bank_reference}` : ""}
                </span>
                <b>{money(p.amount, p.currency)}</b>
              </div>
            ))}
            {allocation.supplier_payments.length === 0 && <p className="text-slate-500">No payments recorded yet.</p>}
          </div>
        </div>
      )}

      {allocation.status === "completed" && canDispatchJobs && (
        <div className="mt-4 border-t pt-4">
          <div className="text-xs font-black uppercase tracking-wide text-primary-500">Manual payment reference</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Invoice note"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Invoice link (optional)"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button disabled={pending} onClick={saveNote} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60">
              Save
            </button>
          </div>
        </div>
      )}

      {canCancel && (
        <button
          disabled={pending}
          onClick={() => {
            setModalError(null);
            setCancelOpen(true);
          }}
          className="mt-4 text-xs font-bold text-red-600 hover:underline disabled:opacity-60"
        >
          Cancel this allocation
        </button>
      )}

      <ConfirmDetailModal
        open={confirmOpen}
        onClose={() => !pending && setConfirmOpen(false)}
        title={`Offer this allocation to ${selected.length} supplier${selected.length === 1 ? "" : "s"}?`}
        description="Whoever accepts first gets it — the others' offers are automatically withdrawn."
        pending={pending}
        error={modalError}
        details={[
          { label: "Move", value: legRouteSummary(legs) },
          { label: "Suppliers", value: selectedNames.join(", ") || "—" },
        ]}
        confirmLabel="Send offers"
        onConfirm={offer}
      />
      <ConfirmDetailModal
        open={withdrawOpen}
        onClose={() => !pending && setWithdrawOpen(false)}
        title="Withdraw all outstanding offers?"
        description="This allocation goes back to unassigned so you can offer it to a different set of suppliers."
        pending={pending}
        error={modalError}
        destructive
        confirmLabel="Withdraw offers"
        onConfirm={withdraw}
      />
      <ConfirmDetailModal
        open={cancelOpen}
        onClose={() => !pending && setCancelOpen(false)}
        title="Cancel this allocation?"
        description="The move becomes available again to add to a new or different allocation."
        pending={pending}
        error={modalError}
        destructive
        confirmLabel="Cancel allocation"
        onConfirm={cancel}
      />
      {invoice && (
        <ConfirmDetailModal
          open={transferOpen}
          onClose={() => !pending && setTransferOpen(false)}
          title="Transfer this invoice to Accountant?"
          description="The accountant will see the invoice and can then pay the supplier by bank transfer."
          pending={pending}
          error={modalError}
          details={[
            { label: "Supplier", value: allocation.suppliers?.name ?? "—" },
            { label: "Amount", value: `${invoice.currency} ${invoice.amount.toFixed(2)}` },
          ]}
          confirmLabel="Transfer to Accountant"
          onConfirm={transfer}
        />
      )}
    </div>
  );
}

export function DispatchJobDetail({
  job,
  allocations,
  invoiceUrls,
  suppliers,
  canTransferInvoice,
  canDispatchJobs,
  canEditBooking,
  canCancel,
  canAssign,
  assignableUsers,
  amendments,
  rejections,
  legDistances,
}: {
  job: JobDetailRow;
  allocations: JobAllocationRow[];
  invoiceUrls: Record<string, string | null>;
  suppliers: SupplierOption[];
  canTransferInvoice: boolean;
  canDispatchJobs: boolean;
  canEditBooking: boolean;
  canCancel: boolean;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
  amendments: BookingEditRecord[];
  rejections: JobRejectionRecord[];
  /** Stop-by-stop route distance per leg, keyed by enquiry leg id. */
  legDistances: Record<string, RouteDistance>;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelPending, startCancelTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(job.quotes?.enquiries?.assigned_user_id ?? "");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignPending, startAssignTransition] = useTransition();
  const [selectedLegIds, setSelectedLegIds] = useState<string[]>([]);
  const [vehicleNotes, setVehicleNotes] = useState("");
  // Pre-filled from the quote's own supplier estimated cost so the figure
  // already entered at quote stage doesn't have to be looked up and retyped
  // here — only for the first allocation on a job, since once a booking is
  // split across suppliers the original single-supplier estimate no longer
  // applies to each slice and re-using it verbatim would just be wrong.
  const [agreedCost, setAgreedCost] = useState(() =>
    allocations.length === 0 && job.quotes?.quote_versions?.supplier_estimated_cost != null
      ? String(job.quotes.quote_versions.supplier_estimated_cost)
      : "",
  );

  const legs = [...(job.quotes?.enquiries?.enquiry_legs ?? [])].sort((a, b) => a.sequence - b.sequence);
  const customer = job.quotes?.customers;
  const currency = job.quotes?.currency ?? BRAND.defaultCurrency;

  const move = legs[0] ?? null;
  const editableMove: EditableMove | null = move
    ? {
        id: move.id,
        pickupAddress: move.pickup_address,
        destinationAddress: move.destination_address,
        pickupDate: move.pickup_date,
        pickupTime: move.pickup_time,
        vanSize: move.van_size,
        moveDetails: pickMoveDetails(move),
        specialRequirements: move.special_requirements,
      }
    : null;

  const claimedLegIds = useMemo(
    () => new Set(allocations.flatMap((a) => a.job_allocation_legs.map((l) => l.enquiry_leg_id))),
    [allocations],
  );
  const legsById = useMemo(() => new Map(legs.map((l) => [l.id, l])), [legs]);

  const currentAssigneeId = job.quotes?.enquiries?.assigned_user_id ?? null;
  const currentAssigneeName = assignableUsers.find((u) => u.id === currentAssigneeId)?.full_name ?? null;

  function openAssign() {
    setAssignError(null);
    setAssigneeId(currentAssigneeId ?? "");
    setAssignOpen(true);
  }

  function doAssign() {
    if (!job.quotes) return;
    if (!assigneeId) {
      setAssignError("Choose someone to assign this job to.");
      return;
    }
    if (assigneeId === currentAssigneeId) {
      setAssignError("This job is already assigned to that person.");
      return;
    }
    setAssignError(null);
    startAssignTransition(async () => {
      const result = await assignQuoteAction(job.quotes!.id, assigneeId);
      if (result.error) {
        setAssignError(result.error);
        return;
      }
      const name = assignableUsers.find((u) => u.id === assigneeId)?.full_name ?? "the selected user";
      notify(`Job assigned to ${name}`);
      setAssignOpen(false);
      router.refresh();
    });
  }

  function cancelBooking() {
    if (!job.quotes) return;
    const quoteId = job.quotes.id;
    if (!cancelReason.trim()) {
      setCancelError("A reason is required to cancel a booking.");
      return;
    }
    setCancelError(null);
    startCancelTransition(async () => {
      const result = await cancelBookingAction(quoteId, cancelReason);
      if (result?.error) {
        setCancelError(result.error);
        notify(result.error);
        return;
      }
      notify("Booking cancelled");
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    });
  }

  function toggleLeg(legId: string) {
    setSelectedLegIds((prev) => (prev.includes(legId) ? prev.filter((id) => id !== legId) : [...prev, legId]));
  }

  function createAllocation() {
    setCreateError(null);
    if (selectedLegIds.length === 0) {
      setCreateError("Select the move to allocate.");
      return;
    }
    startTransition(async () => {
      try {
        await createAllocationAction(job.id, selectedLegIds, vehicleNotes, agreedCost ? Number(agreedCost) : null, currency);
        notify("Allocation created — offer it to suppliers below");
        setSelectedLegIds([]);
        setVehicleNotes("");
        setAgreedCost("");
        router.refresh();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Could not create this allocation.");
      }
    });
  }

  return (
    <div>
      <Breadcrumb items={[{ label: "Dispatch", href: "/dispatch" }, { label: job.quotes?.quote_number ?? "Job" }]} />
      <PageHead
        eyebrow="Operations"
        title={job.quotes?.quote_number ?? "Job"}
        text={customer?.company_name || customer?.contact_name || undefined}
        action={<BackLink fallbackHref="/dispatch" label="Back to Dispatch" />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <SectionTitle title="Move" sub="Addresses, date and move details" />
              <div className="flex shrink-0 flex-wrap gap-2">
                {job.quotes && (
                  <EditBookingButton
                    quoteId={job.quotes.id}
                    quoteStatus={job.quotes.status}
                    jobStatus={job.status}
                    currency={currency}
                    canEdit={canEditBooking}
                    move={editableMove}
                    className="rounded-xl border px-3 py-1.5 text-xs font-bold"
                  />
                )}
                {job.quotes && <SendEmailButton email={customer?.email} quoteNumber={job.quotes.quote_number} variant="row" />}
                {job.quotes && canAssign && (
                  <button
                    type="button"
                    onClick={openAssign}
                    className="rounded-xl border px-3 py-1.5 text-xs font-bold hover:bg-slate-50"
                  >
                    Assign{currentAssigneeName ? `: ${currentAssigneeName}` : " (unassigned)"}
                  </button>
                )}
                {job.quotes && canCancel && CANCELLABLE_STATUSES.includes(job.quotes.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null);
                      setCancelOpen(true);
                    }}
                    className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    Cancel Booking
                  </button>
                )}
              </div>
            </div>
            {job.quotes?.status === "cancelled" && (
              <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                This booking has been cancelled — see the quote page for the reason and any refund status.
              </div>
            )}
            <div className="mt-4">
              {legs.map((leg) => {
                const claimed = claimedLegIds.has(leg.id);
                const owningAllocation = allocations.find((a) => a.job_allocation_legs.some((l) => l.enquiry_leg_id === leg.id));
                return (
                  <div key={leg.id} className="mb-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-bold">
                        {!claimed && canDispatchJobs && (
                          <input type="checkbox" checked={selectedLegIds.includes(leg.id)} onChange={() => toggleLeg(leg.id)} />
                        )}
                        {claimed && owningAllocation && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${STATUS_STYLE[owningAllocation.status]}`}
                          >
                            {owningAllocation.suppliers?.name
                              ? `${owningAllocation.suppliers.name} · ${owningAllocation.status.replaceAll("_", " ")}`
                              : owningAllocation.status.replaceAll("_", " ")}
                          </span>
                        )}
                      </label>
                    </div>
                    <MoveDetailCard leg={leg} distance={legDistances[leg.id]} />
                  </div>
                );
              })}
              {legs.length === 0 && <p className="text-sm text-slate-500">No move details recorded.</p>}
            </div>
            <dl className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Value</dt>
                <dd className="mt-0.5 font-semibold">{money(job.quotes?.quote_versions?.selling_price, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Customer contact</dt>
                <dd className="mt-0.5 flex items-center gap-2 font-semibold">
                  {customer?.phone || customer?.email || "—"}
                  <WhatsAppLink number={customer?.whatsapp || customer?.phone} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase text-slate-400">Sales rep</dt>
                <dd className="mt-0.5 font-semibold">{job.quotes?.profiles?.full_name || "—"}</dd>
              </div>
            </dl>

            {canDispatchJobs && selectedLegIds.length > 0 && (
              <div className="mt-4 rounded-2xl border p-4">
                <div className="text-xs font-black uppercase tracking-wide text-primary-500">
                  Create allocation for this move
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    value={vehicleNotes}
                    onChange={(e) => setVehicleNotes(e.target.value)}
                    placeholder="Van & crew notes (optional)"
                    className="rounded-lg border px-3 py-2 text-sm"
                  />
                  <input
                    value={agreedCost}
                    onChange={(e) => setAgreedCost(e.target.value)}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={`Agreed cost (${currency})`}
                    className="rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
                {!agreedCost && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    No agreed cost entered — the supplier won&apos;t be able to submit an invoice until Dispatch adds one to this
                    allocation.
                  </p>
                )}
                {createError && <p className="mt-2 text-xs font-semibold text-red-600">{createError}</p>}
                <button
                  disabled={pending}
                  onClick={createAllocation}
                  className="mt-3 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {pending ? "Creating…" : "Create allocation"}
                </button>
              </div>
            )}
          </Panel>

          <BookingEditHistory amendments={amendments} currency={currency} />

          <RejectionHistory rejections={rejections} />

          <Panel>
            <SectionTitle
              title={`Allocations (${allocations.length})`}
              sub="Each allocation assigns the move to a single supplier"
            />
            <div className="mt-3 space-y-4">
              {allocations.map((allocation) => (
                <AllocationCard
                  key={allocation.id}
                  jobId={job.id}
                  allocation={allocation}
                  legs={allocation.job_allocation_legs
                    .map((l) => legsById.get(l.enquiry_leg_id))
                    .filter((l): l is DispatchLeg => !!l)
                    .sort((a, b) => a.sequence - b.sequence)}
                  invoiceUrl={invoiceUrls[allocation.id] ?? null}
                  suppliers={suppliers}
                  canDispatchJobs={canDispatchJobs}
                  canTransferInvoice={canTransferInvoice}
                />
              ))}
              {allocations.length === 0 && (
                <p className="rounded-xl bg-slate-50 py-6 text-center text-sm text-slate-500">
                  No allocations yet — select one or more legs above to create the first one.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {cancelOpen && job.quotes && (
        <ConfirmDetailModal
          open
          onClose={() => !cancelPending && setCancelOpen(false)}
          title="Cancel this booking?"
          description="The quote and this job will be marked cancelled, and any pending supplier offers withdrawn. If money has already been collected, a pending refund will be recorded for Finance."
          details={[
            { label: "Quote", value: job.quotes.quote_number },
            { label: "Customer", value: customer?.company_name || customer?.contact_name || "—" },
          ]}
          pending={cancelPending}
          error={cancelError}
          destructive
          confirmLabel="Cancel booking"
          onConfirm={cancelBooking}
        >
          <label className="block text-sm font-bold">
            Reason
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-2 min-h-20 w-full rounded-xl border px-3 py-2 font-normal"
              placeholder="Why is this booking being cancelled?"
            />
          </label>
        </ConfirmDetailModal>
      )}

      {assignOpen && job.quotes && (
        <ConfirmDetailModal
          open
          onClose={() => !assignPending && setAssignOpen(false)}
          title={`Assign ${job.quotes.quote_number}`}
          description="Hand this job's quote to a specific sales user — moves it onto their list the same way reassigning its lead would."
          pending={assignPending}
          error={assignError}
          details={[{ label: "Currently", value: currentAssigneeName || <span className="font-bold text-primary-600">Unassigned</span> }]}
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
