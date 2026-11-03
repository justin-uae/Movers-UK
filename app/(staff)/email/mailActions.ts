"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { sendUserEmail } from "@/lib/userEmail";
import { buildSignatureHtml } from "@/lib/emailSignature";
import type { EmailAccount, EmailAttachmentMeta } from "@/lib/supabase/database.types";

async function requireOwnAccount() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: account } = await supabase.from("email_accounts").select("*").eq("user_id", profile.id).maybeSingle();
  if (!account) throw new Error("No mailbox is connected for your account yet — ask your Master Admin to connect one in Settings → Users.");
  return { supabase, account: account as EmailAccount };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The composer is a plain-text textarea — this is the only place that turns it into HTML, so it's the only place that needs to guard against building unsafe markup out of it. */
function textToSafeHtml(text: string): string {
  return `<div>${escapeHtml(text)
    .split("\n")
    .join("<br>")}</div>`;
}

// Deliberately permissive (not a full RFC 5322 parser) — just enough to
// catch a typo/garbled address before it reaches the SMTP layer, where it
// would otherwise surface as a raw, unfriendly nodemailer error.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalidAddresses(addresses: string[]): string[] {
  return addresses.filter((a) => !EMAIL_RE.test(a));
}

export async function sendEmailAction(data: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string | null;
  attachments?: EmailAttachmentMeta[];
}) {
  const to = data.to
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (to.length === 0) return { error: "Enter at least one recipient." };
  if (!data.subject.trim()) return { error: "Subject is required." };
  if (!data.bodyText.trim()) return { error: "Write a message before sending." };

  const splitAddresses = (raw?: string) =>
    raw
      ? raw
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : undefined;
  const cc = splitAddresses(data.cc);
  const bcc = splitAddresses(data.bcc);

  const badAddresses = [...invalidAddresses(to), ...invalidAddresses(cc ?? []), ...invalidAddresses(bcc ?? [])];
  if (badAddresses.length > 0) {
    return {
      error: `Invalid recipient address${badAddresses.length > 1 ? "es" : ""}: ${badAddresses.join(", ")}`,
      invalidAddresses: badAddresses,
    };
  }

  try {
    const profile = await requireProfile();
    const { supabase, account } = await requireOwnAccount();

    const signatureHtml = buildSignatureHtml(profile);

    await sendUserEmail(supabase, account, {
      to,
      cc,
      bcc,
      subject: data.subject.trim(),
      html: `${textToSafeHtml(data.bodyText)}<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;">${signatureHtml}</div>`,
      inReplyTo: data.inReplyTo,
      attachments: data.attachments,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the email." };
  }

  revalidatePath("/email");
  return { error: null };
}

/** A signed, time-limited URL for downloading one attachment — storage RLS
    (email-attachments bucket) already restricts this to the mailbox owner
    or admin.manage_users, so no extra ownership check is needed here. */
export async function getEmailAttachmentUrlAction(storagePath: string) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("email-attachments").createSignedUrl(storagePath, 3600);
  if (error || !data) return { url: null, error: error?.message ?? "Could not generate a download link." };
  return { url: data.signedUrl, error: null };
}

/**
 * Conversation-level actions from the Email Centre toolbar — each takes
 * every message id in the thread. RLS (email_messages_update) already
 * limits updates to the caller's own mailbox, so a stray id from someone
 * else's account is simply not updated.
 */
async function updateMessages(messageIds: string[], patch: { is_read?: boolean; is_starred?: boolean; archived_at?: string | null }) {
  if (messageIds.length === 0) return { error: null };
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("email_messages").update(patch).in("id", messageIds);
  if (error) return { error: error.message };
  revalidatePath("/email");
  return { error: null };
}

export async function setConversationReadAction(messageIds: string[], read: boolean) {
  return updateMessages(messageIds, { is_read: read });
}

export async function setConversationStarredAction(messageIds: string[], starred: boolean) {
  return updateMessages(messageIds, { is_starred: starred });
}

export async function setConversationArchivedAction(messageIds: string[], archived: boolean) {
  // Archiving also marks it read, so it drops out of the sidebar's unread count (lib/navCounts.ts).
  return updateMessages(messageIds, archived ? { archived_at: new Date().toISOString(), is_read: true } : { archived_at: null });
}

/** "Mark all read" — every unread received message in my own mailbox. */
export async function markAllReadAction() {
  try {
    const { supabase, account } = await requireOwnAccount();
    const { error } = await supabase
      .from("email_messages")
      .update({ is_read: true })
      .eq("email_account_id", account.id)
      .eq("direction", "inbound")
      .eq("is_read", false);
    if (error) return { error: error.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not mark messages as read." };
  }
  revalidatePath("/email");
  return { error: null };
}

export async function markMessageReadAction(messageId: string) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_messages")
    .update({ is_read: true })
    .eq("id", messageId);
  if (error) throw new Error(error.message);
  revalidatePath("/email");
}
