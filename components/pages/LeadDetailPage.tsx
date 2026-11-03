"use client";

import { Fragment, useState, useTransition } from "react";
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
import { JourneyLegDetail, type JourneyLeg } from "@/components/pages/JourneyLegDetail";
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
import type { RouteDistance, RouteSegment, TripDistance } from "@/lib/tripDistance";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { formatDuration } from "@/lib/formatDuration";

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

export interface LeadDetail {
  id: string;
  source: LeadSource;
  status: LeadStatus;
  priority: "high" | "normal";
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  return_trip: boolean;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  is_complex_booking: boolean;
  vehicle_requested: string | null;
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
  legs,
  legDistances,
  legConnections,
  tripDistance,
  isReturnTrip,
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
  legs: JourneyLeg[];
  /** Stop-by-stop route distance per leg, index-aligned with `legs`. */
  legDistances: RouteDistance[];
  /** Gap from leg N's end to leg N+1's start (length legs-1); null where they're the same address. */
  legConnections: (RouteSegment | null)[];
  /** Driving distance for a simple one-way/return trip; null for complex/multi-leg bookings or when it couldn't be resolved. */
  tripDistance: TripDistance | null;
  isReturnTrip: boolean;
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
  const [travelDate, setTravelDate] = useState(lead.travel_date ?? "");
  const [pickupTime, setPickupTime] = useState(lead.pickup_time ?? "");
  const [returnTrip, setReturnTrip] = useState(lead.return_trip);
  const [returnDate, setReturnDate] = useState(lead.return_date ?? "");
  const [returnTime, setReturnTime] = useState(lead.return_time ?? "");
  const [passengerCount, setPassengerCount] = useState(lead.passenger_count != null ? String(lead.passenger_count) : "");
  const [luggageCount, setLuggageCount] = useState(lead.luggage_count != null ? String(lead.luggage_count) : "");
  const [vehicleRequested, setVehicleRequested] = useState(lead.vehicle_requested ?? "");
  const [notesInput, setNotesInput] = useState(lead.notes ?? "");
  const [customerContactName, setCustomerContactName] = useState(lead.customers?.contact_name ?? "");
  const [customerCompanyName, setCustomerCompanyName] = useState(lead.customers?.company_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(lead.customers?.email ?? "");
  const [customerPhone, setCustomerPhone] = useState(lead.customers?.phone ?? "");
  const [assigneeId, setAssigneeId] = useState(lead.assigned_user_id ?? "");

  // Once an enquiry has structured legs, journey editing targets those
  // enquiry_legs rows directly (the quote is built from them) instead of the
  // lead's own single pickup/destination snapshot — same "pick which leg"
  // pattern as EditBookingButton, so a multi-leg booking isn't stuck only
  // ever editing leg 1.
  const hasLegs = legs.length > 0;
  const [selectedLegId, setSelectedLegId] = useState(legs[0]?.id ?? "");
  const [legPickupAddress, setLegPickupAddress] = useState(legs[0]?.pickup_address ?? "");
  const [legDestinationAddress, setLegDestinationAddress] = useState(legs[0]?.destination_address ?? "");
  const [legPickupDate, setLegPickupDate] = useState(legs[0]?.pickup_date ?? "");
  const [legPickupTime, setLegPickupTime] = useState(legs[0]?.pickup_time ?? "");
  const [legReturnDate, setLegReturnDate] = useState(legs[0]?.return_date ?? "");
  const [legReturnTime, setLegReturnTime] = useState(legs[0]?.return_time ?? "");
  const [legPassengerCount, setLegPassengerCount] = useState(legs[0]?.passenger_count != null ? String(legs[0].passenger_count) : "");
  const [legLuggageCount, setLegLuggageCount] = useState(legs[0]?.luggage_count != null ? String(legs[0].luggage_count) : "");
  const [legSpecialRequirements, setLegSpecialRequirements] = useState(legs[0]?.special_requirements ?? "");

  const currentLeg = legs.find((l) => l.id === selectedLegId) ?? null;

  function selectLeg(id: string) {
    setSelectedLegId(id);
    const leg = legs.find((l) => l.id === id);
    setLegPickupAddress(leg?.pickup_address ?? "");
    setLegDestinationAddress(leg?.destination_address ?? "");
    setLegPickupDate(leg?.pickup_date ?? "");
    setLegPickupTime(leg?.pickup_time ?? "");
    setLegReturnDate(leg?.return_date ?? "");
    setLegReturnTime(leg?.return_time ?? "");
    setLegPassengerCount(leg?.passenger_count != null ? String(leg.passenger_count) : "");
    setLegLuggageCount(leg?.luggage_count != null ? String(leg.luggage_count) : "");
    setLegSpecialRequirements(leg?.special_requirements ?? "");
  }

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

    // Once legs exist, journey fields (pickup/destination/date/time/
    // passengers/luggage) belong to whichever enquiry_legs row is selected,
    // not the lead itself — only notes stay lead-level either way.
    const input: EditLeadInput = { reason: editReason };
    if (!hasLegs) {
      if (pickupText !== (lead.pickup_text ?? "")) input.pickupText = pickupText || null;
      if (destinationText !== (lead.destination_text ?? "")) input.destinationText = destinationText || null;
      if (travelDate !== (lead.travel_date ?? "")) input.travelDate = travelDate || null;
      if (pickupTime !== (lead.pickup_time ?? "")) input.pickupTime = pickupTime || null;
      if (returnTrip !== lead.return_trip) input.returnTrip = returnTrip;
      if (returnDate !== (lead.return_date ?? "")) input.returnDate = returnDate || null;
      if (returnTime !== (lead.return_time ?? "")) input.returnTime = returnTime || null;
      const passengerNum = passengerCount === "" ? null : Number(passengerCount);
      if (passengerNum !== lead.passenger_count) input.passengerCount = passengerNum;
      const luggageNum = luggageCount === "" ? null : Number(luggageCount);
      if (luggageNum !== lead.luggage_count) input.luggageCount = luggageNum;
      if (vehicleRequested !== (lead.vehicle_requested ?? "")) input.vehicleRequested = vehicleRequested || null;
    }
    if (notesInput !== (lead.notes ?? "")) input.notes = notesInput || null;

    const legInput: EditLeadLegInput = { reason: editReason };
    if (hasLegs && currentLeg) {
      if (legPickupAddress !== currentLeg.pickup_address) legInput.pickupAddress = legPickupAddress;
      if (legDestinationAddress !== currentLeg.destination_address) legInput.destinationAddress = legDestinationAddress;
      if (legPickupDate !== (currentLeg.pickup_date ?? "")) legInput.pickupDate = legPickupDate || null;
      if (legPickupTime !== (currentLeg.pickup_time ?? "")) legInput.pickupTime = legPickupTime || null;
      if (currentLeg.journey_type === "return") {
        if (legReturnDate !== (currentLeg.return_date ?? "")) legInput.returnDate = legReturnDate || null;
        if (legReturnTime !== (currentLeg.return_time ?? "")) legInput.returnTime = legReturnTime || null;
      }
      const legPassengerNum = legPassengerCount === "" ? null : Number(legPassengerCount);
      if (legPassengerNum !== currentLeg.passenger_count) legInput.passengerCount = legPassengerNum;
      const legLuggageNum = legLuggageCount === "" ? null : Number(legLuggageCount);
      if (legLuggageNum !== currentLeg.luggage_count) legInput.luggageCount = legLuggageNum;
      if (legSpecialRequirements !== (currentLeg.special_requirements ?? "")) legInput.specialRequirements = legSpecialRequirements || null;
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
    const hasLegChanges = hasLegs && !!currentLeg && Object.keys(legInput).length > 1;
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
      if (hasLegChanges && currentLeg) {
        const result = await editLeadLegAction(currentLeg.id!, legInput);
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
            No one claimed it from the open pool before its pickup date
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
              <SectionTitle title="Journey (as captured on intake)" sub="Raw pickup/destination text before an enquiry was created" />
              <div className="mt-4 text-sm">
                <Row label="Pickup" value={lead.pickup_text} />
                <Row label="Destination" value={lead.destination_text} />
                {tripDistance && (
                  <Row
                    label="Distance"
                    value={
                      <>
                        {tripDistance.distanceKm} km
                        <span className="ml-2 font-normal text-slate-500">
                          ≈{formatDuration(tripDistance.durationMinutes)}
                          {isReturnTrip && ` each way · ${Math.round(tripDistance.distanceKm * 2 * 10) / 10} km round trip`}
                        </span>
                      </>
                    }
                  />
                )}
                <WhenRow label="Travel date" date={lead.travel_date} time={lead.pickup_time} />
                {lead.return_trip && (
                  <WhenRow label="Return" date={lead.return_date} time={lead.return_time} />
                )}
                <Row label="Passengers" value={lead.passenger_count} />
                {lead.luggage_count !== null && <Row label="Luggage" value={lead.luggage_count} />}
                <Row label="Vehicle requested" value={lead.vehicle_requested} />
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
                  if (hasLegs) selectLeg(legs[0]?.id ?? "");
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

          {legs.length > 0 && (
            <Panel>
              <SectionTitle title="Journey legs" sub="Structured legs on the enquiry created from this lead" />
              <div className="mt-4">
                {legs.map((leg, i) => {
                  const connection = i > 0 ? legConnections[i - 1] : null;
                  return (
                    <Fragment key={leg.id ?? i}>
                      {connection && (
                        <div className="mt-4 rounded-xl border border-dashed px-4 py-2 text-sm">
                          <div className="text-xs font-bold uppercase text-slate-400">
                            Leg {legs[i - 1]?.sequence} → Leg {leg.sequence}
                          </div>
                          <div className="mt-0.5">
                            <span className="text-slate-500">
                              {connection.from} → {connection.to}:
                            </span>{" "}
                            <b>
                              {connection.distance
                                ? `${connection.distance.distanceKm} km · ${formatDuration(connection.distance.durationMinutes)}`
                                : "—"}
                            </b>
                          </div>
                        </div>
                      )}
                      <JourneyLegDetail leg={leg} index={i} total={legs.length} distance={legDistances[i]} />
                    </Fragment>
                  );
                })}
              </div>
              {legs.length > 1 && legDistances.length === legs.length && legDistances.every((d) => d.total) && (() => {
                const legsKm = legDistances.reduce((sum, d, i) => sum + d.total!.distanceKm * (legs[i]?.journey_type === "return" ? 2 : 1), 0);
                const connectionsResolved = legConnections.every((c) => !c || c.distance);
                const betweenKm = legConnections.reduce((sum, c) => sum + (c?.distance?.distanceKm ?? 0), 0);
                return (
                  <div className="mt-4 border-t pt-4 text-sm">
                    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                      <span className="text-slate-500">Total distance (all legs, returns counted both ways)</span>
                      <b>{Math.round(legsKm * 10) / 10} km</b>
                    </div>
                    {betweenKm > 0 && connectionsResolved && (
                      <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1">
                        <span className="text-slate-500">Including travel between legs</span>
                        <b>{Math.round((legsKm + betweenKm) * 10) / 10} km</b>
                      </div>
                    )}
                  </div>
                );
              })()}
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
              ? "Correct the journey details (pick which leg, for a multi-leg booking) or the linked customer's name/contact info — every change here is logged with the reason below."
              : "Correct the journey details captured on this lead (pick which leg, for a multi-leg booking) — every change here is logged with the reason below."
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

            {hasLegs ? (
              <>
                {legs.length > 1 && (
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-400">Which leg?</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {legs.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => selectLeg(l.id!)}
                          className={`rounded-lg border px-3 py-1.5 text-left text-xs font-bold ${
                            l.id === selectedLegId
                              ? "border-primary-500 bg-primary-50 text-primary-700"
                              : "border-slate-200 text-slate-600"
                          }`}
                        >
                          Leg {l.sequence}: {l.pickup_address} → {l.destination_address}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentLeg && (
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Journey details {legs.length > 1 && `— Leg ${currentLeg.sequence}`}
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-bold">
                        Pickup
                        <input
                          value={legPickupAddress}
                          onChange={(e) => setLegPickupAddress(e.target.value)}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                        />
                      </label>
                      <label className="block text-sm font-bold">
                        Destination
                        <input
                          value={legDestinationAddress}
                          onChange={(e) => setLegDestinationAddress(e.target.value)}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                        />
                      </label>
                      <label className="block text-sm font-bold">
                        Date
                        <input
                          type="date"
                          value={legPickupDate}
                          onChange={(e) => setLegPickupDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                        />
                      </label>
                      <label className="block text-sm font-bold">
                        Time
                        <input
                          type="time"
                          value={legPickupTime}
                          onChange={(e) => setLegPickupTime(e.target.value)}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                        />
                      </label>
                      <label className="block text-sm font-bold">
                        Passengers
                        <input
                          type="number"
                          min={0}
                          value={legPassengerCount}
                          onChange={(e) => setLegPassengerCount(e.target.value)}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                        />
                      </label>
                      <label className="block text-sm font-bold">
                        Luggage
                        <input
                          type="number"
                          min={0}
                          value={legLuggageCount}
                          onChange={(e) => setLegLuggageCount(e.target.value)}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                        />
                      </label>
                    </div>

                    {currentLeg.journey_type === "return" && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-bold">
                          Return date
                          <input
                            type="date"
                            value={legReturnDate}
                            onChange={(e) => setLegReturnDate(e.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                          />
                        </label>
                        <label className="block text-sm font-bold">
                          Return time
                          <input
                            type="time"
                            value={legReturnTime}
                            onChange={(e) => setLegReturnTime(e.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                          />
                        </label>
                      </div>
                    )}

                    <label className="mt-3 block text-sm font-bold">
                      Special requirements
                      <textarea
                        value={legSpecialRequirements}
                        onChange={(e) => setLegSpecialRequirements(e.target.value)}
                        className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
                      />
                    </label>
                  </div>
                )}
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  Pickup
                  <input
                    value={pickupText}
                    onChange={(e) => setPickupText(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Destination
                  <input
                    value={destinationText}
                    onChange={(e) => setDestinationText(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Travel date
                  <input
                    type="date"
                    value={travelDate}
                    onChange={(e) => setTravelDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Pickup time
                  <input
                    type="time"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Passengers
                  <input
                    type="number"
                    min={0}
                    value={passengerCount}
                    onChange={(e) => setPassengerCount(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Luggage
                  <input
                    type="number"
                    min={0}
                    value={luggageCount}
                    onChange={(e) => setLuggageCount(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold sm:col-span-2">
                  Vehicle requested
                  <input
                    value={vehicleRequested}
                    onChange={(e) => setVehicleRequested(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>
            )}

            {!hasLegs && (
              <>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={returnTrip} onChange={(e) => setReturnTrip(e.target.checked)} />
                  Return trip
                </label>

                {returnTrip && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-bold">
                      Return date
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                      />
                    </label>
                    <label className="block text-sm font-bold">
                      Return time
                      <input
                        type="time"
                        value={returnTime}
                        onChange={(e) => setReturnTime(e.target.value)}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                      />
                    </label>
                  </div>
                )}
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
