import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { landingHrefForProfile } from "@/lib/landing";
import { getAssignableSalesUsers } from "@/lib/leadAssignees";
import { CONVERSATION_PAGE_SIZE, toConversationSummary } from "@/lib/whatsappInbox";
import { listInboxConversations, loadInboxThread, type InboxViewer } from "@/lib/whatsappConversations";
import { WhatsAppInboxPage, type WhatsAppMessageRow } from "@/components/pages/WhatsAppInboxPage";

/**
 * Master Admin sees every WhatsApp chat; a sales user sees only the chats
 * they own (taken over from a popup, auto-assigned because they quoted that
 * number, or assigned by Master Admin) — see 0113_whatsapp_sales_takeover.sql.
 * The list comes from whatsapp_conversations (one row per contact), newest
 * first, a page at a time — the inbox loads more and searches from there.
 * Read with the service-role client, scoped by tenant/owner in
 * listInboxConversations, after the access check below.
 */
export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!profile.is_master_admin) {
    const { data: agent } = await admin.rpc("is_whatsapp_agent", { p_profile_id: profile.id });
    if (!agent) redirect(await landingHrefForProfile(profile));
  }

  const viewer: InboxViewer = { tenantId: profile.tenant_id, profileId: profile.id, isMasterAdmin: profile.is_master_admin };
  const { rows: firstPage } = await listInboxConversations(admin, viewer, { limit: CONVERSATION_PAGE_SIZE });
  let rows = firstPage;

  // A chat opened from the popup (?chat=) may be older than the first page.
  if (params.chat && !rows.some((r) => r.wa_id === params.chat)) {
    const { rows: chatRows } = await listInboxConversations(admin, viewer, { limit: 1, waId: params.chat });
    rows = [...chatRows, ...rows];
  }

  const salesUsers = profile.is_master_admin ? await getAssignableSalesUsers(supabase) : [];
  const ownerNames = new Map(salesUsers.map((u) => [u.id, u.full_name]));
  // Owners who are no longer assignable (e.g. deactivated) still need a name.
  const missingOwnerIds = [...new Set(rows.map((r) => r.owner_id).filter((id): id is string => !!id && !ownerNames.has(id)))];
  if (missingOwnerIds.length) {
    const { data: owners } = await admin.from("profiles").select("id, full_name").in("id", missingOwnerIds);
    for (const o of owners ?? []) ownerNames.set(o.id, o.full_name);
  }

  const conversations = rows.map((r) => toConversationSummary(r, ownerNames));
  const firstWaId = (params.chat && rows.some((r) => r.wa_id === params.chat) ? params.chat : conversations[0]?.waId) ?? null;

  // Only chats listed above (already scoped to this viewer) are opened here.
  let initialThread: WhatsAppMessageRow[] = [];
  if (firstWaId) initialThread = (await loadInboxThread(admin, profile.tenant_id, firstWaId)).messages;

  return (
    <WhatsAppInboxPage
      tenantId={profile.tenant_id}
      currentUserId={profile.id}
      isMasterAdmin={profile.is_master_admin}
      salesUsers={salesUsers}
      ownerNames={Object.fromEntries(ownerNames)}
      conversations={conversations}
      hasMore={firstPage.length === CONVERSATION_PAGE_SIZE}
      initialSelectedWaId={firstWaId}
      initialThread={initialThread}
    />
  );
}
