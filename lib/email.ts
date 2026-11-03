import "server-only";
import nodemailer from "nodemailer";
import { htmlToPlainText } from "@/lib/htmlToPlainText";

/**
 * Server-only SMTP transport — the shared SMTP_* config, i.e. SendGrid.
 * EVERY email the CRM sends goes through here: transactional templates,
 * mail "from" a staff member's connected mailbox (lib/userEmail.ts), and
 * Email Centre compose/reply. A staff mailbox's own SMTP server is never
 * used to send — it's only read from (IMAP sync) — because shared web-host
 * mail servers cap the whole domain per hour (e.g. 300/hour), which a
 * reminder sweep or a busy sales day blows straight through, delaying
 * everyone's mail. Only import from Server Actions/Route Handlers.
 *
 * Throws a clear error rather than silently disabling email if SMTP hasn't
 * been configured yet (same pattern as lib/supabase/admin.ts /
 * lib/stripe.ts) — callers are responsible for catching this so a broken/
 * unset mail config never breaks the underlying action (see
 * lib/emailTemplates.ts's sendTemplatedEmail).
 */
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP is not configured (SMTP_HOST/PORT/USER/PASS) — email was not sent.");
  }
  const port = Number(SMTP_PORT);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

function sharedFrom(): string {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM is not configured — email was not sent.");
  }
  return from;
}

/** Bare address out of SMTP_FROM, which may be `Name <addr>` or just `addr`. */
function sharedFromAddress(): string {
  const from = sharedFrom();
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim();
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  await getTransporter().sendMail({ from: sharedFrom(), to, subject, html, text: htmlToPlainText(html), attachments });
}

/**
 * Sends as a specific person (a staff member's own address) through
 * SendGrid. If SendGrid rejects that From address — it only accepts
 * addresses on a domain/sender verified in the SendGrid account — the same
 * message is re-sent from SMTP_FROM's address under the person's display
 * name, with Reply-To set to their own address, so replies still reach
 * their (CRM-synced) inbox. Returns the Message-ID SendGrid accepted.
 */
export async function sendEmailAs({
  fromName,
  fromAddress,
  to,
  cc,
  bcc,
  subject,
  html,
  inReplyTo,
  attachments,
}: {
  fromName: string;
  fromAddress: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  inReplyTo?: string | null;
  attachments?: EmailAttachment[];
}): Promise<{ messageId: string | null }> {
  const transporter = getTransporter();
  const message = {
    to: Array.isArray(to) ? to.join(", ") : to,
    cc: cc && cc.length > 0 ? cc.join(", ") : undefined,
    bcc: bcc && bcc.length > 0 ? bcc.join(", ") : undefined,
    subject,
    html,
    text: htmlToPlainText(html),
    inReplyTo: inReplyTo ?? undefined,
    attachments,
  };
  const quotedName = `"${fromName.replace(/"/g, "")}"`;

  try {
    const info = await transporter.sendMail({ ...message, from: `${quotedName} <${fromAddress}>` });
    return { messageId: info.messageId ?? null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // SendGrid's wording: "The from address does not match a verified Sender Identity."
    if (!/sender identity|from address/i.test(reason)) throw err;
    console.error(`sendEmailAs: SendGrid refused From <${fromAddress}> — re-sending from SMTP_FROM with Reply-To. ${reason}`);
    const info = await transporter.sendMail({ ...message, from: `${quotedName} <${sharedFromAddress()}>`, replyTo: fromAddress });
    return { messageId: info.messageId ?? null };
  }
}
