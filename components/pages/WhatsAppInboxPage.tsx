"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Hand, Search, Send, TriangleAlert, UserRound, X } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { WhatsAppDiagram } from "@/components/ui/guide-diagrams/WhatsAppDiagram";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/formatDate";
import {
  sendWhatsAppReplyAction,
  takeOverWhatsAppChatAction,
  handBackToAiAction,
  assignWhatsAppChatAction,
  loadWhatsAppChatsAction,
  loadWhatsAppThreadAction,
} from "@/app/(staff)/whatsapp/actions";
import type { WhatsAppMessageDirection } from "@/lib/supabase/database.types";
import { conversationSearchFilter, toConversationSummary, type ConversationSummary } from "@/lib/whatsappInbox";

export type { ConversationSummary };

export interface WhatsAppMessageRow {
  id: string;
  direction: WhatsAppMessageDirection;
  messageType: string;
  body: string;
  createdAt: string;
  deliveryStatus: "sent" | "failed";
  deliveryError: string | null;
}

interface RealtimeRow {
  id: string;
  wa_id: string;
  customer_id: string | null;
  direction: WhatsAppMessageDirection;
  message_type: string;
  body: string;
  created_at: string;
  delivery_status: "sent" | "failed";
  delivery_error: string | null;
}

/**
 * Two-pane WhatsApp conversation inbox (app/(staff)/whatsapp) — was a bare
 * placeholder before, since inbound message text only ever lived transiently
 * inside the guided-intake state machine. Reads from whatsapp_messages
 * (0063_whatsapp_messages.sql), which every inbound message and every
 * outbound send — automated prompt or a staff-typed reply — now logs to.
 * New messages arrive live via the same postgres_changes realtime pattern
 * Team Chat uses (components/pages/ChatChannelView.tsx).
 */
export function WhatsAppInboxPage({
  tenantId,
  currentUserId,
  isMasterAdmin,
  salesUsers,
  ownerNames,
  hasMore: initialHasMore,
  conversations: initialConversations,
  initialSelectedWaId,
  initialThread,
}: {
  tenantId: string;
  currentUserId: string;
  isMasterAdmin: boolean;
  salesUsers: { id: string; full_name: string }[];
  ownerNames: Record<string, string>;
  hasMore: boolean;
  conversations: ConversationSummary[];
  initialSelectedWaId: string | null;
  initialThread: WhatsAppMessageRow[];
}) {
  const notify = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [conversations, setConversations] = useState(initialConversations);
  // Ownership / AI status come from the server — re-sync after router.refresh().
  // Keeps chats already loaded via "Load more" instead of dropping back to the first page.
  useEffect(() => {
    setConversations((prev) => {
      const fresh = new Set(initialConversations.map((c) => c.waId));
      return [...initialConversations, ...prev.filter((c) => !fresh.has(c.waId))].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
    });
  }, [initialConversations]);

  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationSummary[] | null>(null);
  const ownerNameMap = useRef(new Map(Object.entries(ownerNames)));

  async function loadMore() {
    setLoadingMore(true);
    const oldest = conversations[conversations.length - 1]?.lastAt;
    const { rows, hasMore: more, error } = await loadWhatsAppChatsAction({ before: oldest ?? null });
    setLoadingMore(false);
    if (error) {
      notify(error);
      return;
    }
    setConversations((prev) => {
      const seen = new Set(prev.map((c) => c.waId));
      return [...prev, ...rows.filter((r) => !seen.has(r.wa_id)).map((r) => toConversationSummary(r, ownerNameMap.current))];
    });
    setHasMore(more);
  }

  // Search runs against every chat, not just the loaded pages.
  useEffect(() => {
    if (!conversationSearchFilter(query)) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { rows } = await loadWhatsAppChatsAction({ search: query });
      if (!cancelled) setSearchResults(rows.map((r) => toConversationSummary(r, ownerNameMap.current)));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const listed = searchResults ?? conversations;
  const [selectedWaId, setSelectedWaId] = useState(initialSelectedWaId);
  const [thread, setThread] = useState<WhatsAppMessageRow[]>(initialThread);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const [searchSelected, setSearchSelected] = useState<ConversationSummary | null>(null);
  const selected = conversations.find((c) => c.waId === selectedWaId) ?? (searchSelected?.waId === selectedWaId ? searchSelected : null);

  async function selectConversation(waId: string) {
    if (waId === selectedWaId) return;
    setSelectedWaId(waId);
    setThreadLoading(true);
    const { messages, error } = await loadWhatsAppThreadAction(waId);
    if (error) notify(error);
    setThread(messages);
    setThreadLoading(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`whatsapp-messages-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as RealtimeRow;

          setConversations((prev) => {
            const existing = prev.find((c) => c.waId === row.wa_id);
            const updated: ConversationSummary = existing
              ? { ...existing, lastBody: row.body, lastDirection: row.direction, lastAt: row.created_at }
              : {
                  waId: row.wa_id,
                  customerId: row.customer_id,
                  name: row.wa_id,
                  phone: row.wa_id,
                  lastBody: row.body,
                  lastDirection: row.direction,
                  lastAt: row.created_at,
                  ownerId: null,
                  ownerName: null,
                  ownerSource: null,
                  aiPaused: false,
                };
            return [updated, ...prev.filter((c) => c.waId !== row.wa_id)];
          });

          setSelectedWaId((current) => {
            if (current === row.wa_id) {
              setThread((prev) =>
                prev.some((m) => m.id === row.id)
                  ? prev
                  : [
                      ...prev,
                      {
                        id: row.id,
                        direction: row.direction,
                        messageType: row.message_type,
                        body: row.body,
                        createdAt: row.created_at,
                        deliveryStatus: row.delivery_status,
                        deliveryError: row.delivery_error,
                      },
                    ],
              );
            }
            return current;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Ownership and AI-paused changes (a takeover, a hand-back, an admin
  // reassignment, a chat newly auto-assigned to this user) re-load the page
  // data so the list and header stay current without a manual refresh.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`whatsapp-conversations-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations", filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        const row = payload.new as { owner_id?: string | null; ai_paused?: boolean; wa_id?: string } | undefined;
        if (!row?.wa_id) return;
        // A sales user also receives unowned rows during takeover hours (for
        // the popup) — those don't belong in their list.
        if (!isMasterAdmin && row.owner_id !== currentUserId) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tenantId, isMasterAdmin, currentUserId, router]);

  function submitReply() {
    const waId = selected?.waId;
    const text = reply.trim();
    if (!text || !waId) return;
    setReply("");
    startTransition(async () => {
      const result = await sendWhatsAppReplyAction(waId, text);
      if (result.error) notify(result.error);
      else if (!selected?.aiPaused) router.refresh();
    });
  }

  function runChatAction(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action();
      notify(result.error ?? success);
      if (!result.error) router.refresh();
    });
  }

  const canReply = !!selected && (isMasterAdmin || selected.ownerId === currentUserId);

  return (
    <div>
      <PageHead
        eyebrow="Communications"
        title="WhatsApp"
        text={isMasterAdmin ? "Every WhatsApp conversation, with who owns it." : "Your WhatsApp chats — ones you took over, and customers you've quoted."}
        action={
          <PageGuide
            title="WhatsApp"
            subtitle="Every conversation from your connected WhatsApp Business number."
            screenshot={<WhatsAppDiagram />}
            sections={[
              {
                heading: "What this page is",
                body: [
                  "A synced log of every inbound and outbound WhatsApp message on your connected number (via 360dialog) — automated intake prompts and staff-typed replies both show up here, threaded by contact.",
                ],
              },
              {
                heading: "Replying",
                body: [
                  "Pick a conversation on the left, type in the box at the bottom of the thread. New messages — from either side — arrive live without needing to refresh.",
                ],
              },
              {
                heading: "Taking over a chat",
                bullets: true,
                body: [
                  "During the hours Master Admin sets (Settings -> WhatsApp Takeover), every sales user gets a popup when a new WhatsApp message arrives on a chat nobody owns. The first person to click Take over gets the chat; it disappears for everyone else.",
                  "Once you've taken over, the AI stops replying on that chat until you click Hand back to AI. Replying yourself also pauses the AI.",
                  "A customer you've already quoted lands in your WhatsApp tab automatically and isn't offered to anyone else.",
                  "You only see your own chats. Master Admin sees every chat and its full history, and can move a chat to another sales user.",
                ],
              },
              {
                heading: "The 24-hour rule",
                body: [
                  "WhatsApp only allows a business to send free-form text within 24 hours of the contact's last message. Reply outside that window and it won't go through — the message still appears in the thread, but in a red \"Not delivered\" bubble with the reason underneath, instead of silently vanishing.",
                ],
              },
            ]}
          />
        }
      />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or number…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none focus:border-primary-300 focus:bg-white"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {listed.length === 0 && (
              <p className="p-4 text-sm text-slate-400">{searchResults ? "No chats match your search." : "No WhatsApp conversations yet."}</p>
            )}
            {listed.map((c) => (
              <button
                key={c.waId}
                type="button"
                onClick={() => {
                  if (searchResults) setSearchSelected(c);
                  selectConversation(c.waId);
                }}
                className={clsx(
                  "block w-full border-b border-slate-100 px-4 py-3 text-left",
                  c.waId === selectedWaId ? "bg-primary-50" : "hover:bg-slate-50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-slate-800">{c.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDateTime(c.lastAt)}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {c.lastDirection === "outbound" ? "You: " : ""}
                  {c.lastBody}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                  {c.aiPaused ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Human</span>
                  ) : (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">AI</span>
                  )}
                  {isMasterAdmin && (
                    <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{c.ownerName ?? "Unassigned"}</span>
                  )}
                </div>
              </button>
            ))}
            {!searchResults && hasMore && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load older chats"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {!selected ? (
            <div className="grid flex-1 place-items-center text-sm text-slate-400">Select a conversation</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-800">{selected.name}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <span>{selected.phone}</span>
                    {selected.aiPaused ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                        <UserRound size={11} /> Human reply · AI paused
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                        <Bot size={11} /> AI replying
                      </span>
                    )}
                    {isMasterAdmin && selected.ownerName && (
                      <span className="font-semibold text-slate-500">
                        Owner: {selected.ownerName}
                        {selected.ownerSource === "quoted" ? " (quoted this customer)" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isMasterAdmin && (
                    <select
                      value={selected.ownerId ?? ""}
                      disabled={pending}
                      onChange={(e) => {
                        const ownerId = e.target.value || null;
                        runChatAction(() => assignWhatsAppChatAction(selected.waId, ownerId), ownerId ? "Chat reassigned" : "Chat unassigned and handed back to AI");
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                      aria-label="Chat owner"
                    >
                      <option value="">Unassigned (AI)</option>
                      {salesUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                      {selected.ownerId && !salesUsers.some((u) => u.id === selected.ownerId) && (
                        <option value={selected.ownerId}>{selected.ownerName}</option>
                      )}
                    </select>
                  )}
                  {canReply &&
                    (selected.aiPaused ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runChatAction(() => handBackToAiAction(selected.waId), "Handed back to AI")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Bot size={14} /> Hand back to AI
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runChatAction(() => takeOverWhatsAppChatAction(selected.waId), "You've taken over — AI paused")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600 disabled:opacity-60"
                      >
                        <Hand size={14} /> Take over
                      </button>
                    ))}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
                {threadLoading && <p className="text-xs text-slate-400">Loading…</p>}
                {thread.map((m) => {
                  const failed = m.direction === "outbound" && m.deliveryStatus === "failed";
                  return (
                    <div key={m.id} className={clsx("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                      <div
                        className={clsx(
                          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                          failed
                            ? "border border-red-200 bg-red-50 text-slate-800"
                            : m.direction === "outbound"
                              ? "bg-primary-500 text-white"
                              : "bg-white text-slate-800 shadow-sm",
                        )}
                      >
                        <div className="whitespace-pre-line">{m.body}</div>
                        <div
                          className={clsx(
                            "mt-1 flex items-center gap-1 text-[10px]",
                            failed ? "text-red-600" : m.direction === "outbound" ? "text-white/70" : "text-slate-400",
                          )}
                        >
                          {failed && <TriangleAlert size={11} className="shrink-0" />}
                          <span>{formatDateTime(m.createdAt)}</span>
                          {failed && <span className="font-bold">· Not delivered</span>}
                        </div>
                        {failed && m.deliveryError && (
                          <div className="mt-1 border-t border-red-200 pt-1 text-[10px] text-red-600">{m.deliveryError}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div className="flex items-end gap-2 border-t border-slate-100 p-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitReply();
                    }
                  }}
                  rows={1}
                  placeholder={
                    !canReply
                      ? "Only the chat's owner can reply"
                      : selected.aiPaused
                        ? "Type a message…"
                        : "Type a message — sending pauses the AI on this chat"
                  }
                  disabled={!canReply || pending}
                  className="max-h-32 flex-1 resize-none rounded-xl border px-3 py-2 text-sm disabled:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={submitReply}
                  disabled={!canReply || pending || !reply.trim()}
                  className="rounded-xl bg-primary-500 p-2.5 text-white disabled:opacity-50"
                  aria-label="Send"
                >
                  <Send size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
