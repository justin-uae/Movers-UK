"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { UserCheck, UserPlus, FileText, TrendingUp, Loader2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { JourneyCell } from "@/components/ui/JourneyCell";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortSelect } from "@/components/ui/SortSelect";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { FormattedText } from "@/components/ui/FormattedText";
import { NewLeadMenu } from "@/components/ui/NewLeadMenu";
import { PageGuide } from "@/components/ui/PageGuide";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { LeadsDiagram } from "@/components/ui/guide-diagrams/LeadsDiagram";
import { claimLeadAction, createEnquiryFromLeadAction, releaseLeadAction, assignLeadAction } from "@/app/(staff)/leads/actions";
import { formatDate, formatTimeOnly } from "@/lib/formatDate";
import { SOURCE_LABEL } from "@/lib/leadSource";
import type { LeadSource, LeadStatus } from "@/lib/supabase/database.types";
import type { AssignableUser } from "@/components/pages/LeadDetailPage";

export type LeadTab = "mine" | "pool" | "all" | "quoted";

const SORT_OPTIONS = [
  { value: "created_desc", label: "Newest created" },
  { value: "created_asc", label: "Oldest created" },
  { value: "travel_asc", label: "Travel date: soonest" },
  { value: "travel_desc", label: "Travel date: latest" },
];

export interface LeadRow {
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
  customers: { company_name: string | null; contact_name: string; phone: string | null; whatsapp: string | null; email: string | null } | null;
  profiles: { full_name: string } | null;
  brands: { name: string } | null;
  /** True when lib/aiAutoQuote.ts quoted this lead itself — it has no assigned_user_id by that point (released to the pool first), so without this the Owner column would misread it as still unclaimed. */
  ai_quoted: boolean;
}

/** Single source of truth for the Owner column/field — a lead with no assigned rep isn't always "open pool": it might already be quoted by AI (released, then converted) or just sitting in a terminal status (closed/spam) nobody ever picked up. */
function ownerLabel(l: LeadRow) {
  if (l.profiles?.full_name) return l.profiles.full_name;
  if (l.ai_quoted) return <span className="font-bold text-primary-600">AI Quoted</span>;
  if (l.status === "expired") return <span className="font-bold text-red-600">Unclaimed</span>;
  if (l.status === "open_pool") return <span className="font-bold text-primary-600">Open pool</span>;
  return <span className="text-slate-400">—</span>;
}

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

/** A lead with no pickup/destination came in through a general enquiry (e.g. a Contact Us form) rather than a journey-specific quote request — nothing to show in the Journey column, and the journey-only detail rows would just be a wall of "—". */
function isGeneralEnquiry(l: Pick<LeadRow, "pickup_text" | "destination_text">) {
  return !l.pickup_text && !l.destination_text;
}

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/** Website-submitted pickup/return time is free text, not guaranteed to be a clean "HH:MM" — format it 12-hour with AM/PM when it parses as one, otherwise fall back to showing whatever the site actually sent rather than garbling it. */
function displayTime(time: string) {
  return TIME_RE.test(time) ? formatTimeOnly(time) : time;
}

/** Date and time shown together as one line — for compact spots like the list rows, where a second line isn't worth the space. */
function formatWhen(date: string | null, time: string | null) {
  if (!date) return null;
  return time ? `${formatDate(date)} · ${displayTime(time)}` : formatDate(date);
}

/** Date on its own line, time stacked underneath in smaller muted text — for the detail popup's Travel date/Return rows, where there's room to make the time easy to spot rather than trailing after the date. */
function WhenValue({ date, time }: { date: string | null; time: string | null }) {
  if (!date) return <>—</>;
  return (
    <>
      {formatDate(date)}
      {time && <div className="mt-0.5 text-xs font-normal text-slate-500">{displayTime(time)}</div>}
    </>
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function LeadsPage({
  leads,
  currentUserId,
  myOpenEnquiries,
  quotesAwaitingResponse,
  canAddEnquiry,
  canClaim,
  canRelease,
  canViewAll,
  canAssign,
  assignableUsers,
  tab,
  mineCount,
  poolCount,
  quotedCount,
  page,
  pageSize,
  total,
}: {
  leads: LeadRow[];
  currentUserId: string;
  myOpenEnquiries: number;
  quotesAwaitingResponse: number;
  canAddEnquiry: boolean;
  canClaim: boolean;
  canRelease: boolean;
  canViewAll: boolean;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
  tab: LeadTab;
  mineCount: number;
  poolCount: number;
  quotedCount: number;
  page: number;
  pageSize: number;
  total: number;
}) {
  const notify = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [assignLead, setAssignLead] = useState<LeadRow | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  // Separate from `pending` above (that's for claim/release/assign server
  // actions) — this just covers the tab switch itself, which is a plain
  // navigation re-fetching server data, not a server action. Without any
  // feedback here, clicking a tab while the page takes a moment to respond
  // reads as unresponsive/"not clickable" rather than "loading."
  const [navPending, startNavTransition] = useTransition();
  const [pendingTab, setPendingTab] = useState<LeadTab | null>(null);

  function tabHref(t: LeadTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  }

  function goToTab(t: LeadTab) {
    if (t === tab) return;
    setPendingTab(t);
    startNavTransition(() => {
      router.push(tabHref(t));
    });
  }

  function openDetail(lead: LeadRow) {
    setModalError(null);
    setDetailLead(lead);
  }

  /** Row/card click and the "View" action: an open-pool lead still opens the
      quick-claim modal (that's the "Accept" flow, not a view), everything
      else goes to the full detail page. */
  function viewLead(lead: LeadRow) {
    if (lead.status === "open_pool") {
      openDetail(lead);
    } else {
      router.push(`/leads/${lead.id}`);
    }
  }

  function closeDetail() {
    if (pending) return;
    setDetailLead(null);
    setModalError(null);
  }

  function claim(id: string) {
    startTransition(async () => {
      const result = await claimLeadAction(id);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead accepted and moved to your dashboard");
      setDetailLead(null);
    });
  }

  function createQuote(id: string) {
    startTransition(async () => {
      const result = await createEnquiryFromLeadAction(id);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
      }
      // On success this redirects into /quotes/new — nothing else to do here.
    });
  }

  function release(id: string) {
    startTransition(async () => {
      const result = await releaseLeadAction(id);
      if (result?.error) {
        setModalError(result.error);
        notify(result.error);
        return;
      }
      notify("Lead released back to the open pool");
      setDetailLead(null);
    });
  }

  function openAssign(lead: LeadRow) {
    setAssignError(null);
    setAssigneeId(lead.assigned_user_id ?? "");
    setAssignLead(lead);
  }

  function closeAssign() {
    if (pending) return;
    setAssignLead(null);
    setAssignError(null);
  }

  function doAssign() {
    if (!assignLead) return;
    if (!assigneeId) {
      setAssignError("Choose someone to assign this lead to.");
      return;
    }
    if (assigneeId === assignLead.assigned_user_id) {
      setAssignError("This lead is already assigned to that person.");
      return;
    }
    setAssignError(null);
    startTransition(async () => {
      const result = await assignLeadAction(assignLead.id, assigneeId);
      if (result?.error) {
        setAssignError(result.error);
        notify(result.error);
        return;
      }
      const name = assignableUsers.find((u) => u.id === assigneeId)?.full_name ?? "the selected user";
      notify(result?.warning ?? (result?.quoted ? `Lead assigned to ${name} — quote created and sent automatically` : `Lead assigned to ${name}`));
      setAssignLead(null);
      router.refresh();
    });
  }

  const isOwnActiveLead = (l: LeadRow) =>
    l.assigned_user_id === currentUserId && l.status !== "converted" && l.status !== "closed";

  const detailIsGeneralEnquiry = detailLead ? isGeneralEnquiry(detailLead) : false;

  return (
    <div>
      <PageHead
        eyebrow="Omnichannel Lead Centre"
        title="Leads & geographic routing"
        text="Website, email, WhatsApp, telephone and live-chat leads in one workspace."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Customer Leads"
              subtitle="Every enquiry that comes in before it becomes a quote."
              screenshot={<LeadsDiagram />}
              sections={[
                {
                  heading: "What a lead is",
                  body: [
                    "A lead is a raw enquiry — someone asking about a journey before it's been priced. Leads arrive from the website, email, WhatsApp, phone calls or live chat, and are tagged with that source so you know where to follow up.",
                    "A lead with no pickup/destination is a general enquiry (e.g. a Contact Us message) rather than a specific trip request — those show the message text instead of a journey.",
                  ],
                },
                {
                  heading: "The tabs",
                  bullets: true,
                  body: [
                    "My Leads — enquiries assigned to you that haven't been quoted yet.",
                    "Quoted — your leads that already have a quote built from them, kept separate so they don't sit mixed in with ones still needing work.",
                    "Open Pool — unclaimed leads anyone with permission can accept. Claiming one moves it onto your own list.",
                    "All — every lead across the team (only visible if your role allows it).",
                  ],
                },
                {
                  heading: "Working a lead",
                  bullets: true,
                  body: [
                    "Click a row to open its detail — open-pool leads open a quick Accept popup; assigned leads go to the full detail page.",
                    "Accept claims an open-pool lead and moves it to your dashboard.",
                    "Create Quote turns an assigned lead into a priced enquiry in Quotes.",
                    "Release sends a lead you no longer want back to the open pool for someone else.",
                  ],
                },
                {
                  heading: "Statuses & the KPI cards",
                  bullets: true,
                  body: [
                    "New / Assigned / Open pool / Contacted / Converted / Closed / Spam / Duplicate track where a lead is in its lifecycle.",
                    "\"My new leads\" and \"Open pool\" count leads waiting for action; \"My open enquiries\" counts quotes you've started but not closed; \"Quotes awaiting response\" flags ones sitting with the customer.",
                    "A red HIGH badge marks a priority enquiry — follow those up first.",
                  ],
                },
              ]}
            />
            {canAddEnquiry ? (
              <NewLeadMenu
                label="Add Enquiry"
                buttonClassName="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
              />
            ) : undefined}
          </div>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi title="My new leads" value={String(mineCount)} icon={UserCheck} href={tabHref("mine")} />
        <Kpi title="My quoted leads" value={String(quotedCount)} icon={FileText} href={tabHref("quoted")} />
        <Kpi title="Open pool" value={String(poolCount)} delta="Claimable now" icon={UserPlus} href={tabHref("pool")} />
        {/* Not clickable: enquiries are a pre-quote working record with no
            list page of their own — they either stall or become the quote
            below, so there's nothing this number could open. */}
        <Kpi title="My open enquiries" value={String(myOpenEnquiries)} icon={TrendingUp} />
        <Kpi
          title="Quotes awaiting response"
          value={String(quotesAwaitingResponse)}
          icon={FileText}
          warn={quotesAwaitingResponse > 0}
          href="/quotes?status=awaiting_response"
        />
      </div>
      <Panel>
        <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
          <div className="flex gap-2">
            {(["mine", "quoted", "pool", "all"] as const)
              .filter((t) => t !== "all" || canViewAll)
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => goToTab(t)}
                  disabled={navPending}
                  className={
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold disabled:cursor-wait " +
                    (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
                  }
                >
                  {navPending && pendingTab === t && <Loader2 size={14} className="animate-spin" />}
                  {t === "mine" ? "My Leads" : t === "quoted" ? "Quoted" : t === "pool" ? "Open Pool" : "All"}
                </button>
              ))}
          </div>
          <SearchInput placeholder="Search leads…" />
          <SortSelect options={SORT_OPTIONS} />
        </div>
        <div className={"transition-opacity" + (navPending ? " pointer-events-none opacity-50" : "")}>
        <div className="space-y-3 py-4 sm:hidden">
          {leads.map((l) => (
            <div key={l.id} onClick={() => viewLead(l)} className={"cursor-pointer rounded-2xl border p-4 hover:bg-orange-50/30" + (l.status === "expired" ? " border-l-4 border-red-300 border-l-red-500 bg-red-100/70" : "")}>
              <div className="flex items-center justify-between gap-2">
                <b className="min-w-0 truncate" title={l.customers?.company_name || l.customers?.contact_name || undefined}>
                  {l.customers?.company_name || l.customers?.contact_name || "Unassigned enquiry"}
                  {l.priority === "high" && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">HIGH</span>
                  )}
                </b>
                <span className="shrink-0 text-right">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{SOURCE_LABEL[l.source]}</span>
                  {l.is_complex_booking && (
                    <span className="ml-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600">Complex Booking</span>
                  )}
                  {l.brands?.name && <div className="mt-1 text-[10px] text-slate-400">{l.brands.name}</div>}
                </span>
              </div>
              <div className="mt-1 text-sm">
                {isGeneralEnquiry(l) ? (
                  <p className="line-clamp-2 text-slate-600">{l.notes || "General enquiry"}</p>
                ) : (
                  <>
                    <JourneyCell pickup={l.pickup_text} destination={l.destination_text} maxWidth="100%" />
                    <div className="text-xs text-slate-400">{formatWhen(l.travel_date, l.pickup_time)}</div>
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {STATUS_LABEL[l.status]} · {timeAgo(l.created_at)}
                </span>
                <span>{ownerLabel(l)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                {((l.status === "open_pool" && canClaim) || isOwnActiveLead(l)) && (
                  <button
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      viewLead(l);
                    }}
                    className={
                      "flex-1 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60 " +
                      (l.status === "open_pool" ? "bg-primary-500 text-white" : "border border-primary-300 text-primary-700")
                    }
                  >
                    {l.status === "open_pool" ? "Accept" : "View"}
                  </button>
                )}
                {canAssign && (
                  <button
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      openAssign(l);
                    }}
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"
                  >
                    Assign
                  </button>
                )}
              </div>
            </div>
          ))}
          {leads.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No leads here yet.</p>}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-4">Customer</th>
                <th>Journey</th>
                <th>Source</th>
                <th>Status</th>
                <th>Age</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => viewLead(l)}
                  className={"cursor-pointer border-t hover:bg-orange-50/30" + (l.status === "expired" ? " bg-red-100/70" : "")}
                >
                  <td className={"max-w-[220px] py-4 font-bold" + (l.status === "expired" ? " border-l-4 border-l-red-500 pl-3" : "")}>
                    <div className="flex items-center gap-2">
                      <span
                        className="min-w-0 truncate"
                        title={l.customers?.company_name || l.customers?.contact_name || undefined}
                      >
                        {l.customers?.company_name || l.customers?.contact_name || "Unassigned enquiry"}
                      </span>
                      {l.priority === "high" && (
                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">HIGH</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {isGeneralEnquiry(l) ? (
                      <p className="max-w-[240px] truncate text-slate-600" title={l.notes ?? undefined}>
                        {l.notes || "General enquiry"}
                      </p>
                    ) : (
                      <>
                        <JourneyCell pickup={l.pickup_text} destination={l.destination_text} />
                        <div className="text-xs text-slate-400">{formatWhen(l.travel_date, l.pickup_time)}</div>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{SOURCE_LABEL[l.source]}</span>
                    {l.is_complex_booking && (
                      <span className="ml-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600">Complex Booking</span>
                    )}
                    {l.brands?.name && <div className="mt-1 text-[10px] text-slate-400">{l.brands.name}</div>}
                  </td>
                  <td className="whitespace-nowrap">{STATUS_LABEL[l.status]}</td>
                  <td className="whitespace-nowrap">{timeAgo(l.created_at)}</td>
                  <td className="whitespace-nowrap">{ownerLabel(l)}</td>
                  <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {l.status === "open_pool" && canClaim ? (
                        <button
                          disabled={pending}
                          onClick={() => openDetail(l)}
                          className="whitespace-nowrap rounded-xl bg-primary-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          Accept
                        </button>
                      ) : (
                        <Link
                          href={`/leads/${l.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="whitespace-nowrap rounded-xl border border-primary-300 px-3 py-2 text-xs font-bold text-primary-700"
                        >
                          View
                        </Link>
                      )}
                      {canAssign && (
                        <button
                          disabled={pending}
                          onClick={() => openAssign(l)}
                          className="whitespace-nowrap rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No leads here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>

      {detailLead && (
        <ConfirmDetailModal
          open
          onClose={closeDetail}
          title={detailLead.customers?.company_name || detailLead.customers?.contact_name || "Lead details"}
          description={`${STATUS_LABEL[detailLead.status]} · captured ${timeAgo(detailLead.created_at)} ago via ${SOURCE_LABEL[detailLead.source]}`}
          pending={pending}
          error={modalError}
          cancelLabel={
            detailLead.status === "open_pool" || isOwnActiveLead(detailLead) ? "Cancel" : "Close"
          }
          details={[
            { label: "Source", value: SOURCE_LABEL[detailLead.source] },
            ...(detailLead.is_complex_booking ? [{ label: "Complex Booking", value: "Yes — AI-assisted intake" }] : []),
            { label: "Brand / website", value: detailLead.brands?.name ?? "—" },
            ...(detailIsGeneralEnquiry
              ? []
              : [
                  { label: "Pickup", value: detailLead.pickup_text ?? "—" },
                  { label: "Destination", value: detailLead.destination_text ?? "—" },
                ]),
            { label: "Travel date", value: <WhenValue date={detailLead.travel_date} time={detailLead.pickup_time} /> },
            // Placed right after Travel date (not down with Priority/Owner
            // etc.) so a return journey's date/time lands in the same row,
            // right next to the outbound leg — the two read as a pair.
            ...(detailLead.return_trip
              ? [
                  {
                    label: "Return",
                    value: detailLead.return_date ? (
                      <WhenValue date={detailLead.return_date} time={detailLead.return_time} />
                    ) : (
                      "Yes — date/time not specified"
                    ),
                  },
                ]
              : []),
            { label: "Passengers", value: detailLead.passenger_count ?? "—" },
            ...(detailLead.luggage_count !== null ? [{ label: "Luggage", value: detailLead.luggage_count }] : []),
            ...(detailIsGeneralEnquiry ? [] : [{ label: "Vehicle requested", value: detailLead.vehicle_requested ?? "—" }]),
            { label: "Priority", value: detailLead.priority === "high" ? "High" : "Normal" },
            {
              label: "Owner",
              value: detailLead.profiles?.full_name || (
                <span className="font-bold text-primary-600">Open pool</span>
              ),
            },
            {
              label: "Customer phone",
              value: (
                <span className="inline-flex items-center gap-2">
                  {detailLead.customers?.phone ?? "—"}
                  <WhatsAppLink number={detailLead.customers?.whatsapp || detailLead.customers?.phone} />
                </span>
              ),
            },
            {
              label: "Customer email",
              value: detailLead.customers?.email ?? <span className="text-amber-600">No email on file</span>,
            },
            {
              label: detailIsGeneralEnquiry ? "Message" : "Notes",
              value: <FormattedText text={detailLead.notes} />,
              fullWidth: true,
            },
          ]}
          confirmLabel={
            detailLead.status === "open_pool" && canClaim
              ? "Claim this lead"
              : isOwnActiveLead(detailLead) && canAddEnquiry
                ? "Create Quote"
                : undefined
          }
          onConfirm={
            detailLead.status === "open_pool" && canClaim
              ? () => claim(detailLead.id)
              : isOwnActiveLead(detailLead) && canAddEnquiry
                ? () => createQuote(detailLead.id)
                : undefined
          }
        >
          {isOwnActiveLead(detailLead) && canRelease && (
            <button
              type="button"
              disabled={pending}
              onClick={() => release(detailLead.id)}
              className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
            >
              Release to open pool
            </button>
          )}
        </ConfirmDetailModal>
      )}

      {assignLead && (
        <ConfirmDetailModal
          open
          onClose={closeAssign}
          title={`Assign ${assignLead.customers?.company_name || assignLead.customers?.contact_name || "this lead"}`}
          description="Hand this lead to a specific sales user — moves it straight onto their list, same as if they'd claimed it themselves."
          pending={pending}
          error={assignError}
          details={[
            {
              label: "Currently",
              value: assignLead.profiles?.full_name || <span className="font-bold text-primary-600">Open pool</span>,
            },
          ]}
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
