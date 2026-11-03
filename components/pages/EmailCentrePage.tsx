"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Mail as MailIcon, X, FileText, Loader2 } from "lucide-react";
import { PageGuide } from "@/components/ui/PageGuide";
import { EmailDiagram } from "@/components/ui/guide-diagrams/EmailDiagram";
import { useToast } from "@/components/ui/Toast";
import { sendEmailAction } from "@/app/(staff)/email/mailActions";
import { createClient } from "@/lib/supabase/client";
import { EmailTemplatesPage } from "./EmailTemplatesPage";
import { EmailSignatureSettings, type SignatureProfileInfo } from "./EmailSignatureSettings";
import { EmailInbox } from "./EmailInbox";
import type { EmailConversation } from "@/lib/emailConversations";
import type { EmailAccount, EmailAttachmentMeta, EmailMessage, EmailTemplate } from "@/lib/supabase/database.types";

type PendingAttachment = EmailAttachmentMeta & { storagePath: string };

function formatFileSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmailCentrePage({
  templates,
  canManageTemplates,
  account,
  messages,
  conversations,
  signatureProfile,
  initialCompose,
}: {
  templates: EmailTemplate[];
  canManageTemplates: boolean;
  account: EmailAccount | null;
  messages: EmailMessage[];
  conversations: EmailConversation[];
  signatureProfile: SignatureProfileInfo;
  /** From a "Send Email" button elsewhere in the CRM (components/ui/SendEmailButton.tsx) — opens Compose straight away with the customer and quote reference already filled in. */
  initialCompose?: { to: string; subject: string } | null;
}) {
  const router = useRouter();
  const notify = useToast();
  const [tab, setTab] = useState<"inbox" | "templates" | "signature">("inbox");
  const [composeOpen, setComposeOpen] = useState(!!initialCompose && !!account);
  const [pending, startTransition] = useTransition();
  const showTemplates = canManageTemplates && tab === "templates";
  const showSignature = tab === "signature";

  const [composeTo, setComposeTo] = useState(initialCompose?.to ?? "");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [showComposeCc, setShowComposeCc] = useState(false);
  const [showComposeBcc, setShowComposeBcc] = useState(false);
  const [composeSubject, setComposeSubject] = useState(initialCompose?.subject ?? "");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<PendingAttachment[]>([]);
  const [invalidAddresses, setInvalidAddresses] = useState<string[]>([]);
  const [uploadingCompose, setUploadingCompose] = useState(false);
  const composeFileInput = useRef<HTMLInputElement>(null);

  async function uploadAttachment(file: File): Promise<PendingAttachment | null> {
    try {
      const supabase = createClient();
      const storagePath = `${account?.tenant_id}/${account?.user_id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("email-attachments").upload(storagePath, file, {
        contentType: file.type || undefined,
      });
      if (error) {
        notify(`Could not attach ${file.name}: ${error.message}`);
        return null;
      }
      return { filename: file.name, size: file.size, contentType: file.type || null, storagePath };
    } catch (err) {
      notify(err instanceof Error ? err.message : `Could not attach ${file.name}.`);
      return null;
    }
  }

  async function onComposeFileSelected(file: File | null) {
    if (!file) return;
    setUploadingCompose(true);
    const attachment = await uploadAttachment(file);
    if (attachment) setComposeAttachments((prev) => [...prev, attachment]);
    setUploadingCompose(false);
  }

  function send(payload: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    bodyText: string;
    inReplyTo?: string | null;
    attachments?: PendingAttachment[];
  }) {
    setInvalidAddresses([]);
    startTransition(async () => {
      const result = await sendEmailAction(payload);
      if (result?.error) {
        notify(result.error);
        setInvalidAddresses(result.invalidAddresses ?? []);
        return;
      }
      notify("Email sent");
      setComposeOpen(false);
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setShowComposeCc(false);
      setShowComposeBcc(false);
      setComposeSubject("");
      setComposeBody("");
      setComposeAttachments([]);
      setInvalidAddresses([]);
      router.refresh();
    });
  }

  const tabs = [
    { key: "inbox" as const, label: "Inbox" },
    ...(canManageTemplates ? [{ key: "templates" as const, label: "Templates" }] : []),
    { key: "signature" as const, label: "My Signature" },
  ];

  return (
    <div>
      {/* Compact header — the inbox below is a full-height app, so every pixel
          of vertical space goes to mail rather than a page title block. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Email Centre</h1>
          <p className="truncate text-sm text-slate-500">
            {account ? <>Connected as <span className="font-semibold text-slate-700">{account.email_address}</span></> : "CRM-linked conversations, templates and your signature."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-bold transition " +
                  (tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <PageGuide
            title="Email Centre"
            subtitle="A shared, CRM-linked inbox — with templates and a personal signature."
            screenshot={<EmailDiagram />}
            sections={[
              {
                heading: "What this page is",
                body: [
                  "Your connected mailbox (IMAP/SMTP, set up by a Master Admin under Settings → Users) synced straight into the CRM — every message is automatically linked to the customer, supplier or quote it relates to where a match is found, so you don't lose context switching out to a separate email client.",
                ],
              },
              {
                heading: "Folders & reading mail",
                bullets: true,
                body: [
                  "Mail is grouped into conversations — a customer's email and every reply to it read as one thread.",
                  "Inbox, Sent, Starred and Archive on the left, plus smart folders worked out from the CRM: Awaiting customer (you replied last), Quote follow-ups, Payment pending, Bookings and Not linked.",
                  "Search covers names, addresses, subjects and quote numbers; All / Unread / Starred narrow the list further.",
                  "Opening a conversation marks it read. The toolbar can mark it unread again, star it or archive it.",
                ],
              },
              {
                heading: "Linked CRM record",
                bullets: true,
                body: [
                  "The right-hand panel shows the quote the conversation is about — status, value, route, date, passengers, vehicle and the latest quote activity — with buttons to open the quote or the lead.",
                  "The link is found automatically: a quote number (QT-…) in the subject, or the sender's address matching a customer (their latest open quote) or a supplier.",
                ],
              },
              {
                heading: "The other two tabs",
                bullets: true,
                body: [
                  "Templates — reusable canned replies (visible if you can manage them) so common answers don't get retyped every time.",
                  "My Signature — your personal sign-off, appended automatically to mail you send from here.",
                ],
              },
              {
                heading: "No mailbox connected?",
                body: [
                  "You'll see a placeholder instead of the inbox until a Master Admin connects your IMAP/SMTP account from Settings → Users — nothing to configure on this page itself.",
                ],
              },
            ]}
          />
        </div>
      </div>

      {showSignature && <EmailSignatureSettings profile={signatureProfile} />}

      {tab === "inbox" && !account && (
        <div className="grid min-h-[400px] place-items-center rounded-3xl border bg-white p-10 text-center shadow-sm">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary-600">
              <MailIcon size={24} />
            </div>
            <h2 className="mt-4 text-lg font-black">No mailbox connected yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              Ask your Master Admin to connect your email account (IMAP/SMTP) from Settings → Users, then your sent
              and received mail will appear here automatically.
            </p>
          </div>
        </div>
      )}

      {showTemplates && <EmailTemplatesPage templates={templates} />}

      {tab === "inbox" && account && (
        <EmailInbox account={account} messages={messages} conversations={conversations} onCompose={() => setComposeOpen(true)} />
      )}

      {composeOpen && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-900/40 p-4" onClick={() => setComposeOpen(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black">New message</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-bold">
                <div className="flex items-center justify-between">
                  To
                  {(!showComposeCc || !showComposeBcc) && (
                    <div className="flex gap-3">
                      {!showComposeCc && (
                        <button
                          type="button"
                          onClick={() => setShowComposeCc(true)}
                          className="text-xs font-bold text-slate-400 hover:text-slate-600"
                        >
                          Add Cc
                        </button>
                      )}
                      {!showComposeBcc && (
                        <button
                          type="button"
                          onClick={() => setShowComposeBcc(true)}
                          className="text-xs font-bold text-slate-400 hover:text-slate-600"
                        >
                          Add Bcc
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <input
                  value={composeTo}
                  onChange={(e) => {
                    setComposeTo(e.target.value);
                    if (invalidAddresses.length > 0) setInvalidAddresses([]);
                  }}
                  placeholder="name@example.com, another@example.com"
                  className={
                    "mt-1 w-full rounded-xl border px-3 py-2 font-normal " +
                    (invalidAddresses.length > 0 ? "border-red-400 bg-red-50" : "")
                  }
                />
                {invalidAddresses.length > 0 && (
                  <span className="mt-1 block text-xs font-normal text-red-600">
                    Not a valid address: {invalidAddresses.join(", ")}
                  </span>
                )}
              </label>
              {showComposeCc && (
                <label className="block text-sm font-bold">
                  Cc
                  <input
                    value={composeCc}
                    onChange={(e) => setComposeCc(e.target.value)}
                    placeholder="name@example.com, another@example.com"
                    className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                  />
                </label>
              )}
              {showComposeBcc && (
                <label className="block text-sm font-bold">
                  Bcc
                  <input
                    value={composeBcc}
                    onChange={(e) => setComposeBcc(e.target.value)}
                    placeholder="name@example.com, another@example.com"
                    className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                  />
                </label>
              )}
              <label className="block text-sm font-bold">
                Subject
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Message
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="mt-1 min-h-32 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
              {composeAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {composeAttachments.map((a, i) => (
                    <span key={i} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">
                      <FileText size={13} />
                      {a.filename}
                      <button onClick={() => setComposeAttachments((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove attachment">
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <input
                ref={composeFileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  onComposeFileSelected(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => composeFileInput.current?.click()}
                disabled={uploadingCompose}
                className="flex items-center gap-2 rounded-xl p-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                title="Attach a file"
              >
                {uploadingCompose ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
              </button>
              <div className="flex gap-2">
                <button onClick={() => setComposeOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
                  Cancel
                </button>
                <button
                  disabled={pending}
                  onClick={() =>
                    send({
                      to: composeTo,
                      cc: composeCc,
                      bcc: composeBcc,
                      subject: composeSubject,
                      bodyText: composeBody,
                      attachments: composeAttachments,
                    })
                  }
                  className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {pending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
