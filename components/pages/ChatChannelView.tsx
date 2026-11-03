"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Hash, Paperclip, Send, Link2, X } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/formatDate";
import { sendMessageAction, markChannelReadAction } from "@/app/(staff)/team-chat/actions";
import type { ChatMessage } from "@/lib/supabase/database.types";

export interface ChatMessageRow {
  id: string;
  senderId: string | null;
  senderName: string;
  body: string;
  attachmentFileName: string | null;
  attachmentStoragePath: string | null;
  attachmentUrl: string | null;
  linkedLabel: string | null;
  createdAt: string;
}

export interface MemberOption {
  id: string;
  name: string;
}

export interface PickerOption {
  id: string;
  label: string;
}

type LinkType = "none" | "customer" | "supplier" | "quote" | "task";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function renderBody(body: string, memberNames: string[]) {
  if (memberNames.length === 0) return body;
  const escaped = memberNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const regex = new RegExp(`@(${escaped.join("|")})`, "gi");
  const parts = body.split(regex);
  return parts.map((part, i) =>
    memberNames.some((n) => n.toLowerCase() === part.toLowerCase()) ? (
      <span key={i} className="font-bold text-primary-600">
        @{part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function ChatChannelView({
  channelId,
  channelLabel,
  tenantId,
  currentProfileId,
  initialMessages,
  members,
  customers,
  suppliers,
  quotes,
  tasks,
}: {
  channelId: string;
  channelLabel: string;
  tenantId: string;
  currentProfileId: string;
  initialMessages: ChatMessageRow[];
  members: MemberOption[];
  customers: PickerOption[];
  suppliers: PickerOption[];
  quotes: PickerOption[];
  tasks: PickerOption[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkType, setLinkType] = useState<LinkType>("none");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);

  const memberNames = useMemo(() => members.map((m) => m.name), [members]);
  const memberNameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const customerLabelById = useMemo(() => new Map(customers.map((o) => [o.id, o.label])), [customers]);
  const supplierLabelById = useMemo(() => new Map(suppliers.map((o) => [o.id, o.label])), [suppliers]);
  const quoteLabelById = useMemo(() => new Map(quotes.map((o) => [o.id, `Quote ${o.label}`])), [quotes]);
  const taskLabelById = useMemo(() => new Map(tasks.map((o) => [o.id, `Task: ${o.label}`])), [tasks]);

  const mentionMatches = mentionQuery !== null ? members.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())) : [];

  const pickerOptions = linkType === "customer" ? customers : linkType === "supplier" ? suppliers : linkType === "quote" ? quotes : linkType === "task" ? tasks : [];
  const filteredPickerOptions = useMemo(
    () => pickerOptions.filter((o) => o.label.toLowerCase().includes(linkSearch.toLowerCase())),
    [pickerOptions, linkSearch],
  );

  useEffect(() => {
    setMessages(initialMessages);
  }, [channelId, initialMessages]);

  useEffect(() => {
    startTransition(() => {
      markChannelReadAction(channelId).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          const linkedLabel =
            (row.customer_id && customerLabelById.get(row.customer_id)) ||
            (row.supplier_id && supplierLabelById.get(row.supplier_id)) ||
            (row.quote_id && quoteLabelById.get(row.quote_id)) ||
            (row.task_id && taskLabelById.get(row.task_id)) ||
            null;
          const newMessage: ChatMessageRow = {
            id: row.id,
            senderId: row.sender_id,
            senderName: (row.sender_id && memberNameById.get(row.sender_id)) || "Unknown",
            body: row.body,
            attachmentFileName: row.attachment_file_name,
            attachmentStoragePath: row.attachment_storage_path,
            attachmentUrl: null,
            linkedLabel,
            createdAt: row.created_at,
          };
          setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));

          if (row.attachment_storage_path) {
            supabase.storage
              .from("chat-files")
              .createSignedUrl(row.attachment_storage_path, 3600)
              .then(({ data }) => {
                if (!data) return;
                setMessages((prev) => prev.map((m) => (m.id === newMessage.id ? { ...m, attachmentUrl: data.signedUrl } : m)));
              });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  function onBodyChange(value: string) {
    setBody(value);
    const match = value.match(/@([^\s@]*)$/);
    setMentionQuery(match ? (match[1] ?? "") : null);
  }

  function pickMention(name: string) {
    setBody((b) => b.replace(/@([^\s@]*)$/, `@${name} `));
    setMentionQuery(null);
  }

  function resetComposer() {
    setBody("");
    setFile(null);
    setLinkOpen(false);
    setLinkType("none");
    setLinkSearch("");
    setLinkId(null);
    setMentionQuery(null);
  }

  function submit() {
    if (!body.trim() && !file) {
      setError("Write a message or attach a file.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        let attachmentStoragePath: string | null = null;
        let attachmentFileName: string | null = null;
        if (file) {
          const supabase = createClient();
          const path = `${tenantId}/${crypto.randomUUID()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("chat-files").upload(path, file);
          if (uploadError) throw new Error(uploadError.message);
          attachmentStoragePath = path;
          attachmentFileName = file.name;
        }
        await sendMessageAction(channelId, {
          body,
          attachmentStoragePath,
          attachmentFileName,
          customerId: linkType === "customer" ? linkId : null,
          supplierId: linkType === "supplier" ? linkId : null,
          quoteId: linkType === "quote" ? linkId : null,
          taskId: linkType === "task" ? linkId : null,
        });
        resetComposer();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send this message.");
      }
    });
  }

  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Hash size={16} className="text-slate-400" />
        <h2 className="font-black text-slate-800">{channelLabel}</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
              {initials(m.senderName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-bold text-slate-800">{m.senderId === currentProfileId ? "You" : m.senderName}</span>
                <span className="text-xs text-slate-400">{formatDateTime(m.createdAt)}</span>
              </div>
              {m.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{renderBody(m.body, memberNames)}</p>}
              {m.attachmentFileName && (
                <a
                  href={m.attachmentUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold text-slate-600"
                >
                  <Paperclip size={12} />
                  {m.attachmentFileName}
                </a>
              )}
              {m.linkedLabel && (
                <div className="mt-1">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{m.linkedLabel}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No messages yet — say hello.</p>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 p-4">
        {error && <div className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
            <Paperclip size={12} />
            {file.name}
            <button onClick={() => setFile(null)} className="ml-auto text-slate-400 hover:text-red-600">
              <X size={13} />
            </button>
          </div>
        )}

        {linkOpen && (
          <div className="mb-2 rounded-xl border p-3">
            <div className="flex flex-wrap gap-2">
              {(["none", "customer", "supplier", "quote", "task"] as LinkType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setLinkType(t);
                    setLinkSearch("");
                    setLinkId(null);
                  }}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-xs font-bold capitalize",
                    linkType === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {linkType !== "none" && (
              <div className="mt-2">
                <input
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder={`Search ${linkType}s…`}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                  {filteredPickerOptions.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                      <input type="radio" name="chat-link-record" checked={linkId === o.id} onChange={() => setLinkId(o.id)} />
                      {o.label}
                    </label>
                  ))}
                  {filteredPickerOptions.length === 0 && <p className="py-1 text-center text-xs text-slate-400">No matches.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div className="absolute bottom-full mb-1 w-56 rounded-xl border bg-white p-1 shadow-lg">
              {mentionMatches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pickMention(m.name)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Message… use @ to mention someone"
              className="flex-1 resize-none rounded-xl border bg-slate-50 px-3 py-2.5 text-sm outline-none"
            />
            <label className="cursor-pointer rounded-xl border p-2.5 text-slate-500 hover:bg-slate-50" aria-label="Attach file">
              <Paperclip size={16} />
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button
              type="button"
              onClick={() => setLinkOpen((o) => !o)}
              className={clsx("rounded-xl border p-2.5", linkOpen || linkId ? "border-primary-300 text-primary-600" : "text-slate-500 hover:bg-slate-50")}
              aria-label="Link a record"
            >
              <Link2 size={16} />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="rounded-xl bg-primary-500 p-2.5 text-white shadow-lg shadow-orange-200 disabled:opacity-60"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
