import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { EmailCentrePage } from "@/components/pages/EmailCentrePage";
import { sanitizeEmailHtml } from "@/lib/sanitizeEmailHtml";
import { buildEmailConversations, type EmailConversation } from "@/lib/emailConversations";
import type { EmailAccount, EmailMessage } from "@/lib/supabase/database.types";

export default async function Page({ searchParams }: { searchParams: Promise<{ compose?: string; to?: string; subject?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const canManageTemplates = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_TEMPLATES);
  const supabase = await createClient();

  const [{ data: templates }, { data: account }] = await Promise.all([
    canManageTemplates
      ? supabase.from("email_templates").select("*").order("key")
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("email_accounts").select("*").eq("user_id", profile.id).maybeSingle(),
  ]);

  let messages: EmailMessage[] = [];
  let conversations: EmailConversation[] = [];
  if (account) {
    // Read with the service-role client, scoped to the account fetched above
    // (which is only ever the signed-in user's own, by user_id). Through RLS,
    // email_messages_select runs has_permission() once per row, and for
    // non-master-admins that's a multi-table join — on a mailbox of several
    // hundred messages the query hit the statement timeout and the inbox
    // came back empty.
    const { data, error } = await createAdminClient()
      .from("email_messages")
      .select("*")
      .eq("email_account_id", account.id)
      .order("occurred_at", { ascending: false })
      .limit(300);
    if (error) console.error("Email Centre: loading messages failed", error.message);
    messages = (data ?? []).map((m) => ({
      ...m,
      // Defaults for before 0112_email_star_archive.sql is applied.
      is_starred: m.is_starred ?? false,
      archived_at: m.archived_at ?? null,
      body_html: m.direction === "inbound" && m.body_html ? sanitizeEmailHtml(m.body_html) : m.body_html,
    }));
    conversations = await buildEmailConversations(supabase, messages, account.email_address);
  }

  return (
    <EmailCentrePage
      templates={templates ?? []}
      canManageTemplates={canManageTemplates}
      account={(account as EmailAccount) ?? null}
      messages={messages}
      conversations={conversations}
      initialCompose={params.compose ? { to: params.to ?? "", subject: params.subject ?? "" } : null}
      signatureProfile={{
        id: profile.id,
        tenant_id: profile.tenant_id,
        full_name: profile.full_name,
        email: profile.email,
        job_title: profile.job_title,
        phone: profile.phone,
        whatsapp_number: profile.whatsapp_number,
        signature_switchboard: profile.signature_switchboard,
        signature_emergency_email: profile.signature_emergency_email,
        signature_website: profile.signature_website,
        signature_logo_url: profile.signature_logo_url,
      }}
    />
  );
}
