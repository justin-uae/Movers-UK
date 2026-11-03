"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Bus,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Inbox,
  Info,
  Link2Off,
  Loader2,
  Mail,
  MailOpen,
  MapPin,
  Paperclip,
  Plus,
  Search,
  Send,
  Star,
  Users,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { FormattedText } from "@/components/ui/FormattedText";
import {
  sendEmailAction,
  getEmailAttachmentUrlAction,
  setConversationArchivedAction,
  setConversationReadAction,
  setConversationStarredAction,
  markAllReadAction,
} from "@/app/(staff)/email/mailActions";
import { createClient } from "@/lib/supabase/client";
import { QUOTE_EVENT_LABEL } from "@/lib/quoteStatus";
import type { EmailConversation, EmailCrmContext } from "@/lib/emailConversations";
import type { EmailAccount, EmailAttachmentMeta, EmailMessage, QuoteStatus } from "@/lib/supabase/database.types";

type PendingAttachment = EmailAttachmentMeta & { storagePath: string };

type View = "inbox" | "sent" | "starred" | "archive" | "awaiting" | "followup" | "payment" | "booking" | "unlinked";

const MAILBOX_VIEWS: { key: View; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "sent", label: "Sent", icon: Send },
  { key: "starred", label: "Starred", icon: Star },
  { key: "archive", label: "Archive", icon: Archive },
];

const SMART_VIEWS: { key: View; label: string; dot: string; hint: string }[] = [
  { key: "awaiting", label: "Awaiting customer", dot: "bg-sky-500", hint: "We replied last — waiting on them" },
  { key: "followup", label: "Quote follow-ups", dot: "bg-amber-500", hint: "Linked quote is sent or viewed" },
  { key: "payment", label: "Payment pending", dot: "bg-emerald-500", hint: "Quote accepted, not fully paid" },
  { key: "booking", label: "Bookings", dot: "bg-violet-500", hint: "Paid or confirmed bookings" },
  { key: "unlinked", label: "Not linked", dot: "bg-slate-400", hint: "No matching customer, supplier or quote" },
];

const FOLLOW_UP = new Set<QuoteStatus>(["sent", "viewed"]);
const PAYMENT = new Set<QuoteStatus>(["accepted", "partially_paid"]);
const BOOKED = new Set<QuoteStatus>(["paid", "converted"]);

function matchesView(c: EmailConversation, view: View): boolean {
  const status = c.context.quote?.status;
  switch (view) {
    case "inbox":
      return c.inInbox;
    case "sent":
      return c.hasSent;
    case "starred":
      return c.starred;
    case "archive":
      return c.archived;
    case "awaiting":
      return !c.archived && c.lastDirection === "outbound" && c.inInbox;
    case "followup":
      return !c.archived && !!status && FOLLOW_UP.has(status);
    case "payment":
      return !c.archived && !!status && PAYMENT.has(status);
    case "booking":
      return !c.archived && !!status && BOOKED.has(status);
    case "unlinked":
      return !c.archived && !c.context.quote && !c.context.customer && !c.context.supplier;
  }
}

/** The coloured chip on a conversation — what stage of the customer journey it's at. */
function crmTag(ctx: EmailCrmContext): { label: string; className: string } | null {
  const status = ctx.quote?.status;
  if (status && FOLLOW_UP.has(status)) return { label: "Quote follow-up", className: "bg-amber-50 text-amber-700 ring-amber-200" };
  if (status && PAYMENT.has(status)) return { label: "Payment pending", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  if (status && BOOKED.has(status)) return { label: "Booking", className: "bg-violet-50 text-violet-700 ring-violet-200" };
  if (status === "draft") return { label: "Quote draft", className: "bg-slate-100 text-slate-600 ring-slate-200" };
  if (status) return { label: "Quote closed", className: "bg-slate-100 text-slate-500 ring-slate-200" };
  if (ctx.supplier) return { label: "Supplier", className: "bg-sky-50 text-sky-700 ring-sky-200" };
  if (ctx.customer) return { label: "Customer", className: "bg-blue-50 text-blue-700 ring-blue-200" };
  return null;
}

const STATUS_PILL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Quote sent",
  viewed: "Quote viewed",
  accepted: "Accepted — awaiting payment",
  partially_paid: "Partially paid",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  converted: "Booked",
  paid: "Paid",
};

const AVATAR_COLOURS = [
  "bg-orange-100 text-orange-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-800",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
];

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const clean = name.replace(/<.*>/, "").replace(/@.*/, "").trim() || "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
  let hash = 0;
  for (const ch of clean) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full font-bold ${AVATAR_COLOURS[hash % AVATAR_COLOURS.length]} ${
        size === "sm" ? "h-9 w-9 text-xs" : "h-10 w-10 text-sm"
      }`}
    >
      {initials}
    </div>
  );
}

function listTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;
  if (d.getTime() >= startOfToday) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.getTime() >= startOfToday - dayMs) return "Yesterday";
  if (d.getTime() >= startOfToday - 6 * dayMs) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function tripDate(date: string | null, time: string | null) {
  if (!date) return "Date to be confirmed";
  const d = new Date(`${date}T00:00:00`);
  const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return time ? `${label}, ${time.slice(0, 5)}` : label;
}

function formatFileSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Override = Partial<Pick<EmailConversation, "unread" | "starred" | "archived" | "inInbox">>;

export function EmailInbox({
  account,
  messages,
  conversations: serverConversations,
  onCompose,
}: {
  account: EmailAccount;
  messages: EmailMessage[];
  conversations: EmailConversation[];
  onCompose: () => void;
}) {
  const router = useRouter();
  const notify = useToast();
  const [view, setView] = useState<View>("inbox");
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileReading, setMobileReading] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [, startAction] = useTransition();
  // Times are formatted in the viewer's own timezone, which the server can't know — render them only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Server data wins again on every refresh — overrides only bridge the gap.
  useEffect(() => setOverrides({}), [serverConversations]);

  const conversations = useMemo(
    () => serverConversations.map((c) => (overrides[c.key] ? { ...c, ...overrides[c.key] } : c)),
    [serverConversations, overrides],
  );
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const counts = useMemo(() => {
    const result = {} as Record<View, number>;
    for (const v of [...MAILBOX_VIEWS, ...SMART_VIEWS]) {
      const inView = conversations.filter((c) => matchesView(c, v.key));
      // Inbox shows unread, like any mail client; everything else shows its size.
      result[v.key] = v.key === "inbox" ? inView.filter((c) => c.unread).length : v.key === "archive" || v.key === "sent" ? 0 : inView.length;
    }
    return result;
  }, [conversations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!matchesView(c, view)) return false;
      if (filter === "unread" && !c.unread) return false;
      if (filter === "starred" && !c.starred) return false;
      if (!q) return true;
      const ctx = c.context;
      return [c.subject, c.counterpartName, c.counterpartAddress, c.snippet, ctx.quote?.quote_number, ctx.customer?.name, ctx.customer?.company, ctx.supplier?.name]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [conversations, view, filter, query]);

  // Layout follows the inbox's own width, not the screen's — the CRM's own
  // sidebar already takes ~290px, so a "wide" screen can still leave a
  // narrow inbox.
  //   full   (≥1320px): folders | list | conversation | CRM panel
  //   rail   (≥980px):  folders | list | conversation (CRM panel slides over)
  //   split  (≥680px):  list | conversation (folders in a dropdown)
  //   single (<680px):  list, or the open conversation with a back button
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const layout = width >= 1320 ? "full" : width >= 980 ? "rail" : width >= 680 ? "split" : "single";
  const showFolders = layout === "full" || layout === "rail";
  const columns = {
    full: "200px 310px minmax(0,1fr) 290px",
    rail: "200px 300px minmax(0,1fr)",
    split: "290px minmax(0,1fr)",
    single: "minmax(0,1fr)",
  }[layout];

  // Wider layouts always show a conversation (the first, if none picked); on a phone only the one tapped.
  const selected = visible.find((c) => c.key === selectedKey) ?? (layout === "single" ? null : visible[0]) ?? null;
  const showList = layout !== "single" || !mobileReading || !selected;
  const showReader = layout !== "single" || (mobileReading && !!selected);
  const viewLabel = [...MAILBOX_VIEWS, ...SMART_VIEWS].find((v) => v.key === view)!.label;

  function patch(conversation: EmailConversation, change: Override, action: () => Promise<{ error: string | null }>) {
    setOverrides((prev) => ({ ...prev, [conversation.key]: { ...prev[conversation.key], ...change } }));
    startAction(async () => {
      const result = await action();
      if (result.error) {
        notify(result.error.includes("is_starred") || result.error.includes("archived_at") ? "Star and archive need the latest database update (migration 0112)." : result.error);
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[conversation.key];
          return next;
        });
        return;
      }
      router.refresh();
    });
  }

  function open(conversation: EmailConversation) {
    setSelectedKey(conversation.key);
    setMobileReading(true);
  }

  // Opening an unread conversation marks it read.
  const selectedUnread = selected?.unread ? selected : null;
  useEffect(() => {
    if (!selectedUnread) return;
    const ids = selectedUnread.messageIds;
    patch(selectedUnread, { unread: false }, () => setConversationReadAction(ids, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnread?.key]);

  return (
    <div
      ref={frame}
      className="relative grid h-[calc(100dvh-10.5rem)] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ gridTemplateColumns: columns, visibility: width ? "visible" : "hidden" }}
    >
      {/* ── Folders ───────────────────────────────────────────── */}
      {showFolders && (
        <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/70 px-3 py-4">
          <button
            onClick={onCompose}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-600"
          >
            <Plus size={16} />
            Compose
          </button>
          <SectionLabel>Mailbox</SectionLabel>
          {MAILBOX_VIEWS.map((v) => (
            <FolderButton key={v.key} active={view === v.key} count={counts[v.key]} onClick={() => setView(v.key)}>
              <v.icon size={16} className="shrink-0" />
              {v.label}
            </FolderButton>
          ))}
          <SectionLabel className="mt-5">Smart folders</SectionLabel>
          {SMART_VIEWS.map((v) => (
            <FolderButton key={v.key} active={view === v.key} count={counts[v.key]} onClick={() => setView(v.key)} title={v.hint}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${v.dot}`} />
              {v.label}
            </FolderButton>
          ))}
        </aside>
      )}

      {/* ── Conversation list ─────────────────────────────────── */}
      {showList && (
        <section className="flex min-h-0 min-w-0 flex-col border-r border-slate-200">
          <div className="space-y-3 border-b border-slate-200 px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-2">
              {showFolders ? (
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-base font-black text-slate-900">{viewLabel}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{visible.length}</span>
                </div>
              ) : (
                <div className="relative min-w-0 flex-1">
                  <select
                    value={view}
                    onChange={(e) => setView(e.target.value as View)}
                    className="w-full appearance-none truncate rounded-lg border-0 bg-transparent py-1 pl-0 pr-6 text-base font-black text-slate-900 outline-none"
                  >
                    <optgroup label="Mailbox">
                      {MAILBOX_VIEWS.map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.label}
                          {counts[v.key] ? ` (${counts[v.key]})` : ""}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Smart folders">
                      {SMART_VIEWS.map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.label}
                          {counts[v.key] ? ` (${counts[v.key]})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                {counts.inbox > 0 && (
                  <button
                    onClick={() =>
                      startAction(async () => {
                        const result = await markAllReadAction();
                        if (result.error) notify(result.error);
                        else router.refresh();
                      })
                    }
                    className="text-xs font-bold text-primary-600 hover:text-primary-700"
                  >
                    Mark all read
                  </button>
                )}
                {!showFolders && (
                  <button onClick={onCompose} className="grid h-8 w-8 place-items-center rounded-lg bg-primary-500 text-white shadow-sm hover:bg-primary-600" aria-label="Compose">
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mail or QT-number…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none transition focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {(["all", "unread", "starred"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize transition ${
                    filter === f ? "bg-primary-50 text-primary-700 ring-1 ring-primary-200" : "text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {f === "all" ? "All mail" : f}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((c) => {
              const tag = crmTag(c.context);
              const active = layout !== "single" && selected?.key === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => open(c)}
                  className={`relative flex w-full gap-3 border-b border-slate-100 py-3.5 pl-4 pr-3.5 text-left transition ${active ? "bg-primary-50/70" : "hover:bg-slate-50"}`}
                >
                  {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary-500" />}
                  {c.unread && <span className="absolute left-1.5 top-[1.6rem] h-1.5 w-1.5 rounded-full bg-primary-500" />}
                  <Avatar name={c.counterpartName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[13px] ${c.unread ? "font-black text-slate-900" : "font-semibold text-slate-700"}`}>{c.counterpartName}</span>
                      <span className={`shrink-0 text-[11px] ${c.unread ? "font-bold text-primary-600" : "text-slate-400"}`}>{mounted ? listTime(c.latestAt) : ""}</span>
                    </div>
                    <div className={`mt-0.5 truncate text-[13px] ${c.unread ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>
                      {c.subject}
                      {c.messageIds.length > 1 && <span className="ml-1 font-normal text-slate-400">({c.messageIds.length})</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{c.snippet || "No preview"}</p>
                    {(tag || c.starred || c.hasAttachments) && (
                      <div className="mt-2 flex items-center gap-2">
                        {tag && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${tag.className}`}>{tag.label}</span>}
                        {c.hasAttachments && <Paperclip size={12} className="text-slate-400" />}
                        {c.starred && <Star size={12} className="fill-amber-400 text-amber-400" />}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className="grid place-items-center px-6 py-16 text-center">
                <MailOpen size={28} className="text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-600">{query ? "No conversations match your search" : `Nothing in ${viewLabel}`}</p>
                <p className="mt-1 text-xs text-slate-400">{query ? "Try a name, subject or quote number." : "Conversations that fit this folder will show up here."}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Conversation ──────────────────────────────────────── */}
      {showReader && (
        <section className="flex min-h-0 min-w-0 flex-col">
          {selected ? (
            <Conversation
              key={selected.key}
              account={account}
              conversation={selected}
              messages={selected.messageIds.map((id) => messagesById.get(id)).filter((m): m is EmailMessage => !!m)}
              viewLabel={viewLabel}
              mounted={mounted}
              compact={layout === "single"}
              showBack={layout === "single"}
              showCrmToggle={layout !== "full"}
              onBack={() => setMobileReading(false)}
              onToggleCrm={() => setCrmOpen((o) => !o)}
              onMarkUnread={() => patch(selected, { unread: true }, () => setConversationReadAction(selected.messageIds, false))}
              onToggleStar={() => patch(selected, { starred: !selected.starred }, () => setConversationStarredAction(selected.messageIds, !selected.starred))}
              onToggleArchive={() => {
                const archiving = !selected.archived;
                patch(selected, { archived: archiving, inInbox: !archiving && selected.inInbox }, () => setConversationArchivedAction(selected.messageIds, archiving));
                notify(archiving ? "Conversation archived" : "Moved back to Inbox");
                setSelectedKey(null);
                setMobileReading(false);
              }}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-10 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                  <Mail size={24} />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-600">Select a conversation to read it</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Linked CRM record ─────────────────────────────────── */}
      {selected && layout === "full" && (
        <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50/50">
          <CrmPanel context={selected.context} mounted={mounted} />
        </aside>
      )}
      {selected && layout !== "full" && crmOpen && (
        <>
          <div className="absolute inset-0 z-10 bg-slate-900/25" onClick={() => setCrmOpen(false)} />
          <aside className="absolute inset-y-0 right-0 z-20 w-[320px] max-w-[92%] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <CrmPanel context={selected.context} mounted={mounted} onClose={() => setCrmOpen(false)} />
          </aside>
        </>
      )}
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-1.5 px-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-400 ${className}`}>{children}</div>;
}

function FolderButton({
  active,
  count,
  onClick,
  title,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition ${
        active ? "bg-white font-bold text-slate-900 shadow-sm ring-1 ring-slate-200" : "font-medium text-slate-600 hover:bg-white/80 hover:text-slate-900"
      }`}
    >
      {children}
      {count > 0 && (
        <span className={`ml-auto rounded-full px-1.5 text-[11px] font-bold tabular-nums ${active ? "bg-primary-500 text-white" : "text-slate-400"}`}>{count}</span>
      )}
    </button>
  );
}

function Conversation({
  account,
  conversation,
  messages,
  viewLabel,
  mounted,
  compact,
  showBack,
  showCrmToggle,
  onBack,
  onToggleCrm,
  onMarkUnread,
  onToggleStar,
  onToggleArchive,
}: {
  account: EmailAccount;
  conversation: EmailConversation;
  messages: EmailMessage[];
  viewLabel: string;
  mounted: boolean;
  /** Phone-width inbox — tighter padding, smaller heading. */
  compact: boolean;
  showBack: boolean;
  /** No CRM column beside it — offer a button that slides the panel in. */
  showCrmToggle: boolean;
  onBack: () => void;
  onToggleCrm: () => void;
  onMarkUnread: () => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
}) {
  const router = useRouter();
  const notify = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(messages.slice(-1).map((m) => m.id)));
  const [replyText, setReplyText] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, startSending] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const tag = crmTag(conversation.context);
  const ctx = conversation.context;

  const last = messages[messages.length - 1];
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  // Reply to whoever wrote to us last; on a thread we started, to the same recipients.
  const replyTo = lastInbound ? lastInbound.from_address : (last?.to_addresses ?? []).join(", ");
  const replyName = lastInbound ? lastInbound.from_name || lastInbound.from_address : conversation.counterpartName;
  const subject = last?.subject ?? conversation.subject;

  async function attach(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const storagePath = `${account.tenant_id}/${account.user_id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("email-attachments").upload(storagePath, file, { contentType: file.type || undefined });
      if (error) notify(`Could not attach ${file.name}: ${error.message}`);
      else setAttachments((prev) => [...prev, { filename: file.name, size: file.size, contentType: file.type || null, storagePath }]);
    } catch (err) {
      notify(err instanceof Error ? err.message : `Could not attach ${file.name}.`);
    }
    setUploading(false);
  }

  async function download(storagePath: string | null) {
    if (!storagePath) return;
    const result = await getEmailAttachmentUrlAction(storagePath);
    if (result.error || !result.url) notify(result.error ?? "Could not download this attachment.");
    else window.open(result.url, "_blank", "noopener");
  }

  function sendReply() {
    startSending(async () => {
      const result = await sendEmailAction({
        to: replyTo,
        cc,
        bcc,
        subject: /^re:/i.test(subject ?? "") ? subject! : `Re: ${subject ?? ""}`,
        bodyText: replyText,
        inReplyTo: last?.message_id ?? null,
        attachments,
      });
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Reply sent");
      setReplyText("");
      setCc("");
      setBcc("");
      setShowCc(false);
      setAttachments([]);
      router.refresh();
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-400">
          {showBack && (
            <button onClick={onBack} className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back">
              <ArrowLeft size={16} />
            </button>
          )}
          <span className="truncate">{viewLabel}</span>
          <ChevronRight size={12} />
          <span className="font-bold text-slate-700">Conversation</span>
        </div>
        <div className="flex items-center gap-0.5">
          <ToolbarButton label="Mark as unread" onClick={onMarkUnread}>
            <Mail size={16} />
          </ToolbarButton>
          <ToolbarButton label={conversation.starred ? "Unstar" : "Star"} onClick={onToggleStar}>
            <Star size={16} className={conversation.starred ? "fill-amber-400 text-amber-400" : ""} />
          </ToolbarButton>
          <ToolbarButton label={conversation.archived ? "Move to Inbox" : "Archive"} onClick={onToggleArchive}>
            {conversation.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </ToolbarButton>
          {showCrmToggle && (
            <button
              onClick={onToggleCrm}
              className="ml-1 flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <Info size={14} />
              {!compact && "CRM record"}
            </button>
          )}
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "px-3 py-4" : "px-6 py-5"}`}>
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className={`font-black leading-tight text-slate-900 ${compact ? "text-lg" : "text-xl"}`}>{subject || "(no subject)"}</h1>
          {tag && <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ring-1 ${tag.className}`}>{tag.label}</span>}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {ctx.quote ? (
            <>
              Conversation linked to{" "}
              <Link href={`/quotes/${ctx.quote.id}`} className="font-bold text-primary-600 hover:underline">
                {ctx.quote.quote_number}
              </Link>
              {ctx.customer && <> · {ctx.customer.company || ctx.customer.name}</>}
            </>
          ) : ctx.customer ? (
            <>
              Conversation with customer{" "}
              <Link href={`/customers/${ctx.customer.id}`} className="font-bold text-primary-600 hover:underline">
                {ctx.customer.company || ctx.customer.name}
              </Link>
            </>
          ) : ctx.supplier ? (
            <>
              Conversation with supplier{" "}
              <Link href={`/suppliers/${ctx.supplier.id}`} className="font-bold text-primary-600 hover:underline">
                {ctx.supplier.name}
              </Link>
            </>
          ) : (
            "Not linked to a CRM record"
          )}
          {messages.length > 1 && <> · {messages.length} messages</>}
        </p>

        {/* Messages */}
        <div className="mt-6 space-y-3">
          {messages.map((m) => {
            const isOpen = expanded.has(m.id);
            const outbound = m.direction === "outbound";
            const name = outbound ? "You" : m.from_name || m.from_address;
            return (
              <article key={m.id} className={`rounded-2xl border ${isOpen ? "border-slate-200" : "border-slate-100 bg-slate-50/60"}`}>
                <button
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      return next;
                    })
                  }
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <Avatar name={outbound ? account.display_name || account.email_address : name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">
                        {name}
                        {outbound && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Sent</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">{mounted ? fullTime(m.occurred_at) : ""}</span>
                    </div>
                    {isOpen ? (
                      <div className="mt-0.5 truncate text-xs text-slate-400">
                        From: {m.from_address} · To: {m.to_addresses.join(", ") || "—"}
                        {m.cc_addresses.length > 0 && <> · Cc: {m.cc_addresses.join(", ")}</>}
                      </div>
                    ) : (
                      <div className="mt-0.5 truncate text-xs text-slate-500">{m.snippet}</div>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className={compact ? "px-4 pb-4" : "pb-5 pl-[4.25rem] pr-6"}>
                    <div className="email-body overflow-x-auto break-words text-sm leading-6 text-slate-700">
                      {m.body_html ? <div dangerouslySetInnerHTML={{ __html: m.body_html }} /> : <FormattedText text={m.body_text} />}
                    </div>
                    {m.has_attachments && m.attachment_meta.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {m.attachment_meta.map((a, i) => (
                          <button
                            key={i}
                            onClick={() => download(a.storagePath)}
                            disabled={!a.storagePath}
                            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <FileText size={14} />
                            {a.filename}
                            {a.size !== null && <span className="font-normal text-slate-400">{formatFileSize(a.size)}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Linked quotation callout */}
        {ctx.quote && (
          <Link
            href={`/quotes/${ctx.quote.id}`}
            className="mt-4 block rounded-xl border-l-4 border-primary-400 bg-primary-50/50 px-4 py-3 text-xs transition hover:bg-primary-50"
          >
            <div className="font-bold text-slate-800">Linked quotation · {ctx.quote.quote_number}</div>
            {ctx.trip && (
              <div className="mt-1 text-slate-500">
                {ctx.trip.pickup} → {ctx.trip.destination}
                {ctx.trip.passengers != null && <> · {ctx.trip.passengers} passengers</>}
              </div>
            )}
            <div className="mt-1 font-semibold text-slate-700">
              {ctx.quote.selling_price != null && <>Quote value: {money(ctx.quote.selling_price, ctx.quote.currency)} · </>}
              {STATUS_PILL[ctx.quote.status]}
            </div>
          </Link>
        )}

        {/* Reply — inline under the thread, like a mail client, so the conversation keeps the height */}
        <div className="mt-5">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-xs">
            <span className="truncate text-slate-500">
              To: <span className="font-semibold text-slate-700">{replyTo || "—"}</span>
            </span>
            {!showCc && (
              <button onClick={() => setShowCc(true)} className="shrink-0 font-bold text-slate-400 hover:text-slate-600">
                Cc / Bcc
              </button>
            )}
          </div>
          {showCc && (
            <div className="space-y-1.5 border-b border-slate-100 px-4 py-2">
              <AddressField label="Cc" value={cc} onChange={setCc} />
              <AddressField label="Bcc" value={bcc} onChange={setBcc} />
            </div>
          )}
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && replyText.trim() && !sending) sendReply();
            }}
            placeholder={`Write a reply to ${replyName}…`}
            className="block min-h-[72px] w-full resize-y bg-transparent px-4 py-3 text-sm outline-none"
          />
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">
                  <FileText size={13} />
                  {a.filename}
                  <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove attachment">
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex items-center gap-1">
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  attach(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                title="Attach a file"
              >
                {uploading ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
              </button>
              <span className={compact ? "hidden" : "text-[11px] text-slate-400"}>Your signature is added automatically · Ctrl+Enter to send</span>
            </div>
            <button
              disabled={sending || !replyText.trim() || !replyTo}
              onClick={sendReply}
              className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-600 disabled:opacity-50"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
      {children}
    </button>
  );
}

function AddressField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-slate-400">
      <span className="w-8">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="name@example.com, another@example.com"
        className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm font-normal text-slate-700 outline-none focus:border-primary-300"
      />
    </label>
  );
}

function CrmPanel({ context, mounted, onClose }: { context: EmailCrmContext; mounted: boolean; onClose?: () => void }) {
  const { quote, trip, customer, supplier, events } = context;
  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-900">Linked CRM record</h3>
        {onClose && (
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X size={15} />
          </button>
        )}
      </div>

      {!quote && !customer && !supplier && (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-5 text-center">
          <Link2Off size={22} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Not linked yet</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Emails link automatically when the sender&apos;s address matches a customer or supplier, or the subject mentions a quote number (e.g. QT-01234).
          </p>
          <Link href="/leads/new" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2 text-xs font-bold text-white hover:bg-primary-600">
            <Plus size={14} />
            Create a lead
          </Link>
        </div>
      )}

      {quote && (
        <>
          <PanelLabel>Enquiry &amp; booking</PanelLabel>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-black text-slate-900">{quote.quote_number}</div>
                {customer && <div className="truncate text-xs text-slate-500">{customer.company || customer.name}</div>}
              </div>
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                linked
              </span>
            </div>
            <span className="mt-3 inline-block rounded-md bg-primary-50 px-2 py-1 text-[11px] font-bold text-primary-700">{STATUS_PILL[quote.status]}</span>
            {quote.selling_price != null && (
              <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-500">Quote value</span>
                <span className="text-xl font-black text-slate-900">{money(quote.selling_price, quote.currency)}</span>
              </div>
            )}
          </div>

          {trip && (
            <>
              <PanelLabel>Trip details</PanelLabel>
              <dl className="space-y-3.5">
                <Detail icon={<MapPin size={14} />} label="Route">
                  {trip.pickup} → {trip.destination}
                  {trip.legCount > 1 && <span className="text-slate-400"> ({trip.legCount} legs)</span>}
                </Detail>
                <Detail icon={<CalendarDays size={14} />} label="Travel date">
                  {tripDate(trip.date, trip.time)}
                </Detail>
                {trip.passengers != null && (
                  <Detail icon={<Users size={14} />} label="Passengers">
                    {trip.passengers} passengers
                  </Detail>
                )}
                {trip.vehicle && (
                  <Detail icon={<Bus size={14} />} label="Vehicle">
                    {trip.vehicle}
                  </Detail>
                )}
                {quote.expiry_at && (
                  <Detail icon={<FileText size={14} />} label="Quote valid until">
                    {new Date(quote.expiry_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </Detail>
                )}
              </dl>
            </>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-5">
            <Link
              href={`/quotes/${quote.id}`}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-primary-600"
            >
              View quote
              <ExternalLink size={12} />
            </Link>
            <Link
              href={quote.lead_id ? `/leads/${quote.lead_id}` : customer ? `/customers/${customer.id}` : `/quotes/${quote.id}`}
              className="flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {quote.lead_id ? "Open lead" : "Open customer"}
            </Link>
          </div>

          {events.length > 0 && (
            <>
              <PanelLabel>Recent activity</PanelLabel>
              <ol className="relative ml-1 space-y-4 border-l border-slate-200 pl-4">
                {events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${i === 0 ? "bg-primary-500" : "bg-slate-300"}`} />
                    <div className="text-xs font-bold text-slate-800">{QUOTE_EVENT_LABEL[e.event] ?? e.event}</div>
                    <div className="text-[11px] text-slate-400">{mounted ? relativeTime(e.created_at) : ""}</div>
                  </li>
                ))}
              </ol>
              <Link href={`/quotes/${quote.id}`} className="mt-4 flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline">
                View complete timeline <ArrowRight size={12} />
              </Link>
            </>
          )}
        </>
      )}

      {!quote && customer && (
        <>
          <PanelLabel>Customer</PanelLabel>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-black text-slate-900">{customer.company || customer.name}</div>
            {customer.company && <div className="text-xs text-slate-500">{customer.name}</div>}
            <p className="mt-3 text-xs text-slate-500">No quote on file for this customer yet.</p>
          </div>
          <Link
            href={`/customers/${customer.id}`}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-primary-600"
          >
            Open customer <ExternalLink size={12} />
          </Link>
        </>
      )}

      {supplier && (
        <>
          <PanelLabel>Supplier</PanelLabel>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="font-black text-slate-900">{supplier.name}</div>
            <Link href={`/suppliers/${supplier.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline">
              Open supplier <ArrowRight size={12} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 mt-6 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{children}</div>;
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] text-slate-400">{label}</dt>
        <dd className="text-[13px] font-semibold leading-snug text-slate-800">{children}</dd>
      </div>
    </div>
  );
}
