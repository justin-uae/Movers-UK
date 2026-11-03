import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { sendEmail, type EmailAttachment } from "./email";
import { sendTransactionalEmailFromAccount } from "./userEmail";
import { wrapEmailHtml } from "./emailBranding";
import { buildSignatureHtml } from "./emailSignature";
import type { EmailTemplateKey } from "./emailTemplateInfo";

export type { EmailTemplateKey } from "./emailTemplateInfo";
export { EMAIL_TEMPLATE_INFO } from "./emailTemplateInfo";

function renderTemplate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

interface SendTemplatedEmailInput {
  tenantId: string;
  key: EmailTemplateKey;
  to: string | null | undefined;
  variables: Record<string, string>;
  attachments?: EmailAttachment[];
  /**
   * The logged-in staff member sending this (quote sent, invoice resent —
   * anything with a real actor, as opposed to a webhook/customer-triggered
   * template like payment confirmations or feedback requests). When set:
   * the email is signed with that person's own signature, and if they have
   * a mailbox connected (Settings -> Users), it's sent From their own
   * address — still through SendGrid like every other email (lib/email.ts),
   * never their mailbox's own SMTP server — falling back to the shared
   * SMTP_FROM sender (still signed) when they don't have one connected.
   */
  senderId?: string;
}

/**
 * Looks up the tenant's editable template for `key`, substitutes
 * {{variables}}, and sends it — returning `{ error }` instead of throwing,
 * for callers that need to show the actual failure reason to a human (e.g.
 * a staff-facing "Resend email" button). For automatic triggers, use
 * sendTemplatedEmail below instead, which wraps this and never surfaces an
 * error to the caller.
 */
export async function renderAndSendTemplate(
  supabase: SupabaseClient<Database>,
  input: SendTemplatedEmailInput,
): Promise<{ error: string | null }> {
  if (!input.to) return { error: "No recipient email address on file." };

  const { data: template, error } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("tenant_id", input.tenantId)
    .eq("key", input.key)
    .maybeSingle();

  if (error || !template) {
    return { error: error?.message ?? `No "${input.key}" email template found.` };
  }

  const subject = renderTemplate(template.subject, input.variables);
  const bodyHtml = renderTemplate(template.body_html, input.variables);

  let signatureHtml: string | undefined;
  let senderAccount: Awaited<ReturnType<typeof loadSenderAccount>> = null;
  if (input.senderId) {
    const [{ data: sender }, account] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, job_title, phone, whatsapp_number, signature_switchboard, signature_emergency_email, signature_website, signature_logo_url")
        .eq("id", input.senderId)
        .maybeSingle(),
      loadSenderAccount(supabase, input.senderId),
    ]);
    senderAccount = account;
    if (sender) signatureHtml = buildSignatureHtml(sender);
  }

  const html = wrapEmailHtml(input.variables.brand_name ?? "", input.key, bodyHtml, signatureHtml);

  try {
    if (senderAccount) {
      await sendTransactionalEmailFromAccount(supabase, senderAccount, { to: input.to, subject, html, attachments: input.attachments });
    } else {
      await sendEmail({ to: input.to, subject, html, attachments: input.attachments });
    }
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the email." };
  }
}

async function loadSenderAccount(supabase: SupabaseClient<Database>, senderId: string) {
  const { data } = await supabase.from("email_accounts").select("*").eq("user_id", senderId).eq("is_active", true).maybeSingle();
  return data;
}

/**
 * Single call-site for every automatic transactional email trigger in the
 * app (quote sent, quote accepted/rejected, job offered, ...). Same as
 * renderAndSendTemplate, but logs and swallows any failure (missing
 * template row, unset SMTP config, unreachable host, no recipient email on
 * file) rather than surfacing it, so a mail problem never breaks the
 * quote/job action that triggered it.
 */
export async function sendTemplatedEmail(supabase: SupabaseClient<Database>, input: SendTemplatedEmailInput): Promise<void> {
  const result = await renderAndSendTemplate(supabase, input);
  if (result.error) {
    console.error(`sendTemplatedEmail: failed to send "${input.key}" to ${input.to ?? "(no recipient)"}: ${result.error}`);
  }
}
