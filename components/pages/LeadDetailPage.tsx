"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BackLink } from "@/components/ui/BackLink";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { FormattedText } from "@/components/ui/FormattedText";
import { MoveDetailCard, type MoveLeg } from "@/components/pages/MoveDetailCard";
import { MoveDetailsEditor, VanSizeSelect } from "@/components/ui/MoveDetailsEditor";
import { LeadEditHistory, type LeadEditRecord } from "@/components/pages/LeadEditHistory";
import { LeadAssignmentHistory, type LeadAssignmentEvent } from "@/components/pages/LeadAssignmentHistory";
import {
  claimLeadAction,
  createEnquiryFromLeadAction,
  releaseLeadAction,
  assignLeadAction,
  editLeadAction,
  editLeadLegAction,
  type EditLeadInput,
  type EditLeadLegInput,
} from "@/app/(staff)/leads/actions";
import { updateCustomerAction } from "@/app/(staff)/customers/actions";
import { formatDate, formatTimeOnly } from "@/lib/formatDate";
import { SOURCE_LABEL } from "@/lib/leadSource";
import type { LeadSource, LeadStatus } from "@/lib/supabase/database.types";
import type { MoveDistance } from "@/lib/moveDistance";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { formatDuration } from "@/lib/formatDuration";
import { hasMoveDetails, moveDetailChanges, moveDetailRows, pickMoveDetails, type MoveDetails } from "@/lib/moveDetails";

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  assigned: "Assigned",
  open_pool: "Open pool",
  contacted: "Contacted",
  converted: "Converted",
  closed: "Closed",
  spam: "Spam",
  duplicate: "Duplicate",
  expired: "Expired",
};

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function displayTime(time: string) {
  return TIME_RE.test(time) ? formatTimeOnly(time) : time;
}

function WhenRow({ label, date, time }: { label: string; date: string | null; time: string | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <b>
        {date ? formatDate(date) : "—"}
        {date && time && <span className="ml-2 font-normal text-slate-500">{displayTime(time)}</span>}
      </b>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <b className="whitespace-pre-wrap">{value ?? "—"}</b>
    </div>
  );
}

export interface LeadDetail extends MoveDetails {
  id: string;
  source: LeadSource;
  status: LeadStatus;
  priority: "high" | "normal";
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  is_complex_booking: boolean;
  notes: string | null;
  assigned_user_id: string | null;
  created_at: string;
  customer_id: string | null;
  customers: { id: string; company_name: string | null; contact_name: string; phone: string | null; whatsapp: string | null; email: string | null } | null;
  profiles: { full_name: string } | null;
  brands: { name: string } | null;
}

export interface LeadDetailQuote {
  id: string;
  quote_number: string;
  status: string;
  ai_generated: boolean;
}

export interface AssignableUser {
  id: string;
  full_name: string;
}

export interface LeadSourceDocument {
  fileName: string;
  downloadUrl: string | null;
}

export function LeadDetailPage({
  lead,
  move,
  moveDistance,
  enquiryId,
  quote,
  sourceDocument,
  edits,
  assignmentEvents,
  currentUserId,
  canAddEnquiry,
  canClaim,
  canRelease,
  canEditCustomer,
  canAssign,
  assignableUsers,
}: {
  lead: LeadDetail;
  /** The move on this lead's enquiry, once one exists — what the quote is built from. */
  move: MoveLeg | null;
  /** Pickup → destination driving distance (the enquiry's move if there is one, else the intake addresses); null when it couldn't be resolved. */
  moveDistance: MoveDistance | null;
  enquiryId: string | null;
  quote: LeadDetailQuote | null;
  sourceDocument: LeadSourceDocument | null;
  edits: LeadEditRecord[];
  assignmentEvents: LeadAssignmentEvent[];
  currentUserId: string;
  canAddEnquiry: boolean;
  canClaim: boolean;
  canRelease: boolean;
  canEditCustomer: boolean;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
}) {
  const notify = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [pickupText, setPickupText] = useState(lead.pickup_text ?? "");
  const [destinationText, setDestinationText] = useState(lead.destination_text ?? "");
  const [moveDate, setMoveDate] = useState(lead.travel_date ?? "");
  const [pickupTime, setPickupTime] = useState(lead.pickup_time ?? "");
  const [leadMoveDetails, setLeadMoveDetails] = useState<MoveDetails>(pickMoveDetails(lead));
  const [notesInput, setNotesInput] = useState(lead.notes ?? "");
  const [customerContactName, setCustomerContactName] = useState(lead.customers?.contact_name ?? "");
  const [customerCompanyName, setCustomerCompanyName] = useState(lead.customers?.company_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(lead.customers?.email ?? "");
  const [customerPhone, setCustomerPhone] = useState(lead.customers?.phone ?? "");
  const [assigneeId, setAssigneeId] = useState(lead.assigned_user_id ?? "");

  // Once an enquiry exists, move editing targets its move (enquiry_legs —
  // the quote is built from it) instead of the lead's own intake snapshot.
  const hasMove = move !== null;
  const [movePickupAddress, setMovePickupAddress] = useState(move?.pickup_address ?? "");
  const [moveDestinationAddress, setMoveDestinationAddress] = useState(move?.destination_address ?? "");
  const [movePickupDate, setMovePickupDate] = useState(move?.pickup_date ?? "");
  const [movePickupTime, setMovePickupTime] = useState(move?.pickup_time ?? "");
  const [moveVanSize, setMoveVanSize] = useState<string | null>(move?.van_size ?? null);
  const [moveEditDetails, setMoveEditDetails] = useState<MoveDetails>(move ? pickMoveDetails(move) : pickMoveDetails(lead));
  const [moveSpecialRequirements, setMoveSpecialRequirements] = useState(move?.special_requirements ?? "");

  const isOwnActiveLead = lead.assigned_user_id === currentUserId && lead.status !== "converted" && lead.status !== "closed";
  const showCustomerFields = (canEditCustomer || isOwnActiveLead) && !!lead.customers;

  const isGeneralEnquiry = !lead.pickup_text && !lead.destination_text;

  function claim() {
    setError(null);
    startTransition(async () => {
      const result = await claimLeadAction(lead.id);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead accepted and moved to your dashboard");
    });
  }

  function assign() {
    if (!assigneeId || assigneeId === lead.assigned_user_id) return;
    setError(null);
    startTransition(async () => {
      const result = await assignLeadAction(lead.id, assigneeId);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      const name = assignableUsers.find((u) => u.id === assigneeId)?.full_name ?? "the selected user";
      notify(`Lead assigned to ${name}`);
      router.refresh();
    });
  }

  function createQuote() {
    setError(null);
    startTransition(async () => {
      const result = await createEnquiryFromLeadAction(lead.id);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
      }
      // On success this redirects into /quotes/new.
    });
  }

  function saveEdit() {
    if (!editReason.trim()) {
      setEditError("A reason is required.");
      return;
    }

    // Once the enquiry has its move, move fields belong to that enquiry_legs
    // row, not the lead itself — only notes stay lead-level either way.
    const input: EditLeadInput = { reason: editReason };
    if (!hasMove) {
      if (pickupText !== (lead.pickup_text ?? "")) input.pickupText = pickupText || null;
      if (destinationText !== (lead.destination_text ?? "")) input.destinationText = destinationText || null;
      if (moveDate !== (lead.travel_date ?? "")) input.moveDate = moveDate || null;
      if (pickupTime !== (lead.pickup_time ?? "")) input.pickupTime = pickupTime || null;
      if (Object.keys(moveDetailChanges(pickMoveDetails(lead), leadMoveDetails)).length > 0) input.moveDetails = leadMoveDetails;
    }
    if (notesInput !== (lead.notes ?? "")) input.notes = notesInput || null;

    const legInput: EditLeadLegInput = { reason: editReason };
    if (hasMove && move) {
      if (movePickupAddress !== move.pickup_address) legInput.pickupAddress = movePickupAddress;
      if (moveDestinationAddress !== move.destination_address) legInput.destinationAddress = moveDestinationAddress;
      if (movePickupDate !== (move.pickup_date ?? "")) legInput.pickupDate = movePickupDate || null;
      if (movePickupTime !== (move.pickup_time ?? "")) legInput.pickupTime = movePickupTime || null;
      if (moveVanSize !== move.van_size) legInput.vanSize = moveVanSize;
      if (Object.keys(moveDetailChanges(pickMoveDetails(move), moveEditDetails)).length > 0) legInput.moveDetails = moveEditDetails;
      if (moveSpecialRequirements !== (move.special_requirements ?? "")) legInput.specialRequirements = moveSpecialRequirements || null;
    }

    const customerInput: { reason: string; contactName?: string; companyName?: string | null; email?: string | null; phone?: string | null } = {
      reason: editReason,
    };
    if (showCustomerFields) {
      if (!customerContactName.trim()) {
        setEditError("Customer contact name can't be empty.");
        return;
      }
      if (customerContactName !== (lead.customers?.contact_name ?? "")) customerInput.contactName = customerContactName;
      if (customerCompanyName !== (lead.customers?.company_name ?? "")) customerInput.companyName = customerCompanyName || null;
      if (customerEmail !== (lead.customers?.email ?? "")) customerInput.email = customerEmail || null;
      if (customerPhone !== (lead.customers?.phone ?? "")) customerInput.phone = customerPhone || null;
    }
    const hasLeadChanges = Object.keys(input).length > 1;
    const hasLegChanges = hasMove && Object.keys(legInput).length > 1;
    const hasCustomerChanges = Object.keys(customerInput).length > 1;

    if (!hasLeadChanges && !hasLegChanges && !hasCustomerChanges) {
      setEditError("Change at least one field.");
      return;
    }

    setEditError(null);
    startTransition(async () => {
      if (hasLeadChanges) {
        const result = await editLeadAction(lead.id, input);
        if (result?.error) {
          setEditError(result.error);
          notify(result.error);
          return;
        }
      }
      if (hasLegChanges && move) {
        const result = await editLeadLegAction(move.id!, legInput);
        if (result?.error) {
          setEditError(result.error);
          notify(result.error);
          return;
        }
      }
      if (hasCustomerChanges && lead.customers) {
        const result = await updateCustomerAction(lead.customers.id, customerInput, lead.id);
        if (result?.error) {
          setEditError(result.error);
          notify(result.error);
          return;
        }
      }
      notify("Lead updated");
      setEditOpen(false);
      setEditReason("");
      router.refresh();
    });
  }

  function release() {
    setError(null);
    startTransition(async () => {
      const result = await releaseLeadAction(lead.id);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead released back to the open pool");
    });
  }

  const leadLabel =
    lead.customers?.company_name ||
    lead.customers?.contact_name ||
    (lead.pickup_text && lead.destination_text ? `${lead.pickup_text} → ${lead.destination_text}` : "Lead details");

  return (
    <div>
      <Breadcrumb items={[{ label: "Customer Leads", href: "/leads" }, { label: leadLabel }]} />
      <PageHead
        eyebrow="Omnichannel Lead Centre"
        title={lead.customers?.company_name || lead.customers?.contact_name || "Lead details"}
        text={`${STATUS_LABEL[lead.status]} · ${SOURCE_LABEL[lead.source]}${lead.brands?.name ? ` · ${lead.brands.name}` : ""}`}
        action={<BackLink fallbackHref="/leads" label="Back to Leads" />}
      />

      {lead.status === "expired" && (
        <div className="mb-4 rounded-xl border border-red-200 border-l-4 border-l-red-500 bg-red-100/70 px-4 py-3 text-sm text-red-800">
          <div className="font-bold">This lead has expired</div>
          <p className="mt-0.5">
            No one claimed it from the open pool before its move date
            {lead.travel_date ? ` (${formatDate(lead.travel_date)})` : ""} passed, so it was moved to Lost Booking and can no longer be claimed.
          </p>
        </div>
      )}

      {error && <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Lead" sub="Source, priority and ownership" />
            <div className="mt-4 text-sm">
              <Row label="Source" value={SOURCE_LABEL[lead.source]} />
              {lead.is_complex_booking && <Row label="Complex Booking" value="Yes — AI-assisted intake" />}
              {lead.is_complex_booking && (
                <Row
                  label="Source document"
                  value={
                    sourceDocument ? (
                      sourceDocument.downloadUrl ? (
                        <a href={sourceDocument.downloadUrl} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                          {sourceDocument.fileName}
                        </a>
                      ) : (
                        sourceDocument.fileName
                      )
                    ) : (
                      "Pasted text only, no file uploaded"
                    )
                  }
                />
              )}
              <Row label="Brand / website" value={lead.brands?.name} />
              <Row label="Priority" value={lead.priority === "high" ? "High" : "Normal"} />
              {canAssign ? (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b py-2 last:border-0">
                  <span className="text-slate-500">Owner</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      className="rounded-lg border px-2 py-1.5 text-sm font-bold outline-none focus:border-primary-300"
                    >
                      <option value="">— Unassigned / open pool —</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={pending || !assigneeId || assigneeId === lead.assigned_user_id}
                      onClick={assign}
                      className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              ) : (
                <Row
                  label="Owner"
                  value={
                    lead.profiles?.full_name ||
                    (quote?.ai_generated ? (
                      <span className="font-bold text-primary-600">AI Quoted</span>
                    ) : lead.status === "expired" ? (
                      <span className="font-bold text-red-600">Unclaimed</span>
                    ) : (
                      <span className="font-bold text-primary-600">Open pool</span>
                    ))
                  }
                />
              )}
              <div className="border-b py-2 last:border-0">
                <div className="text-slate-500">{isGeneralEnquiry ? "Message" : "Notes"}</div>
                <div className="mt-1 font-bold">
                  <FormattedText text={lead.notes} />
                </div>
              </div>
            </div>
          </Panel>

          {!isGeneralEnquiry && (
            <Panel>
              <SectionTitle title="Move (as captured on intake)" sub="Addresses and date before an enquiry was created" />
              <div className="mt-4 text-sm">
                <Row label="Moving from" value={lead.pickup_text} />
                <Row label="Moving to" value={lead.destination_text} />
                {moveDistance && (
                  <Row
                    label="Distance"
                    value={
                      <>
                        {moveDistance.distanceKm} km
                        <span className="ml-2 font-normal text-slate-500">≈{formatDuration(moveDistance.durationMinutes)}</span>
                      </>
                    }
                  />
                )}
                <WhenRow label="Move date" date={lead.travel_date} time={lead.pickup_time} />
              </div>
            </Panel>
          )}

          {hasMoveDetails(lead) && (
            <Panel>
              <SectionTitle title="Move details" sub="Property, access and extra services from the website quote form" />
              <div className="mt-4 text-sm">
                {moveDetailRows(lead).map(({ label, value }) => (
                  <Row key={label} label={label} value={value} />
                ))}
              </div>
            </Panel>
          )}

          <div className="flex flex-wrap gap-2">
            {lead.status === "open_pool" && canClaim && (
              <button
                type="button"
                disabled={pending}
                onClick={claim}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Please wait…" : "Claim this lead"}
              </button>
            )}
            {isOwnActiveLead && canAddEnquiry && (
              <button
                type="button"
                disabled={pending}
                onClick={createQuote}
                className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Please wait…" : quote ? "Continue to Quote" : "Create Quote"}
              </button>
            )}
            {isOwnActiveLead && canAddEnquiry && !quote && !lead.is_complex_booking && (
              <Link
                href={`/leads/${lead.id}/complex-booking`}
                className="flex items-center gap-1.5 rounded-xl border px-5 py-2.5 text-sm font-bold text-primary-600 hover:bg-primary-50"
              >
                <Wand2 size={15} />
                Convert to Complex Booking
              </Link>
            )}
            {isOwnActiveLead && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditError(null);
                  setEditOpen(true);
                }}
                className="rounded-xl border px-5 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                Edit Lead
              </button>
            )}
            {isOwnActiveLead && canRelease && (
              <button
                type="button"
                disabled={pending}
                onClick={release}
                className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
              >
                Release to open pool
              </button>
            )}
          </div>

          <LeadAssignmentHistory events={assignmentEvents} />
          <LeadEditHistory edits={edits} />
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Customer" sub="Linked customer record" />
            {lead.customers ? (
              <div className="mt-4 text-sm">
                <Row label="Name" value={lead.customers.company_name || lead.customers.contact_name} />
                <Row
                  label="Email"
                  value={lead.customers.email ? lead.customers.email : <span className="text-amber-600">No email on file</span>}
                />
                <Row
                  label="Phone"
                  value={
                    lead.customers.phone || lead.customers.whatsapp ? (
                      <span className="inline-flex items-center gap-2">
                        {lead.customers.phone || lead.customers.whatsapp}
                        <WhatsAppLink number={lead.customers.whatsapp || lead.customers.phone} />
                      </span>
                    ) : null
                  }
                />
                <Link
                  href={`/customers/${lead.customers.id}`}
                  className="mt-3 inline-block rounded-xl border px-4 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50"
                >
                  View customer record →
                </Link>
                <SendEmailButton email={lead.customers.email} quoteNumber={quote?.quote_number} className="mt-2" />
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">No customer linked yet.</p>
            )}
          </Panel>

          {move && (
            <Panel>
              <SectionTitle title="Move" sub="The move on the enquiry created from this lead" />
              <div className="mt-4">
                <MoveDetailCard leg={move} />
              </div>
            </Panel>
          )}

          {enquiryId && (
            <Panel>
              <SectionTitle title="Quote" />
              {quote ? (
                <Link
                  href={`/quotes/${quote.id}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50"
                >
                  {quote.quote_number} · {quote.status.replaceAll("_", " ")} →
                </Link>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No quote created yet for this enquiry.</p>
              )}
            </Panel>
          )}
        </div>
      </div>

      {editOpen && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setEditOpen(false)}
          title="Edit this lead"
          description={
            showCustomerFields
              ? "Correct the move details or the linked customer's name/contact info — every change here is logged with the reason below."
              : "Correct the move details captured on this lead — every change here is logged with the reason below."
          }
          pending={pending}
          error={editError}
          confirmLabel="Save Changes"
          onConfirm={saveEdit}
        >
          <div className="space-y-4">
            <label className="block text-sm font-bold">
              Reason (required)
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
                placeholder="Why is this lead being edited?"
              />
            </label>

            {showCustomerFields && (
              <div className="rounded-xl border border-dashed p-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Customer details</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold">
                    Contact name
                    <input
                      value={customerContactName}
                      onChange={(e) => setCustomerContactName(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Company name
                    <input
                      value={customerCompanyName}
                      onChange={(e) => setCustomerCompanyName(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Email
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Phone
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                </div>
              </div>
            )}

            {hasMove ? (
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Move details</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold">
                    Moving from
                    <input
                      value={movePickupAddress}
                      onChange={(e) => setMovePickupAddress(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Moving to
                    <input
                      value={moveDestinationAddress}
                      onChange={(e) => setMoveDestinationAddress(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Move date
                    <input
                      type="date"
                      value={movePickupDate}
                      onChange={(e) => setMovePickupDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Start time
                    <input
                      type="time"
                      value={movePickupTime}
                      onChange={(e) => setMovePickupTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <MoveDetailsEditor value={moveEditDetails} onChange={setMoveEditDetails} />
                </div>
                <label className="mt-3 block text-sm font-bold">
                  Van size
                  <VanSizeSelect value={moveVanSize} onChange={setMoveVanSize} />
                </label>
                <label className="mt-3 block text-sm font-bold">
                  Inventory and access notes
                  <textarea
                    value={moveSpecialRequirements}
                    onChange={(e) => setMoveSpecialRequirements(e.target.value)}
                    className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
                  />
                </label>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-bold">
                    Moving from
                    <input
                      value={pickupText}
                      onChange={(e) => setPickupText(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Moving to
                    <input
                      value={destinationText}
                      onChange={(e) => setDestinationText(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Move date
                    <input
                      type="date"
                      value={moveDate}
                      onChange={(e) => setMoveDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Start time
                    <input
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                    />
                  </label>
                </div>
                {!isGeneralEnquiry && <MoveDetailsEditor value={leadMoveDetails} onChange={setLeadMoveDetails} />}
              </>
            )}

            <label className="block text-sm font-bold">
              {isGeneralEnquiry ? "Message" : "Notes"}
              <textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
              />
            </label>
          </div>
        </ConfirmDetailModal>
      )}
    </div>
  );
}
