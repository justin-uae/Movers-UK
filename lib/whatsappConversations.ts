import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CONVERSATION_LIST_COLUMNS, conversationSearchFilter, type ConversationListRow } from "@/lib/whatsappInbox";
import type { WhatsAppMessageRow } from "@/components/pages/WhatsAppInboxPage";
import { BRAND } from "@/lib/brandConfig";

type AdminClient = ReturnType<typeof createAdminClient>;

/** One row of whatsapp_conversations (0113_whatsapp_sales_takeover.sql). */
export interface WhatsAppConversationRow {
  id: string;
  tenant_id: string;
  wa_id: string;
  owner_id: string | null;
  owner_source: "takeover" | "quoted" | "admin" | null;
  ai_paused: boolean;
}

/** Tenant settings for the "take over" window — Settings -> WhatsApp Takeover. */
export interface WhatsAppTakeoverSettings {
  enabled: boolean;
  start: string;
  end: string;
  days: number[];
  timezone: string;
}

export const TAKEOVER_SETTINGS_COLUMNS =
  "whatsapp_takeover_enabled, whatsapp_takeover_start, whatsapp_takeover_end, whatsapp_takeover_days, whatsapp_takeover_timezone";

export function takeoverSettingsFrom(row: Record<string, unknown> | null): WhatsAppTakeoverSettings {
  return {
    enabled: Boolean(row?.whatsapp_takeover_enabled),
    start: String(row?.whatsapp_takeover_start ?? "09:00").slice(0, 5),
    end: String(row?.whatsapp_takeover_end ?? "18:00").slice(0, 5),
    days: (row?.whatsapp_takeover_days as number[] | undefined) ?? [1, 2, 3, 4, 5, 6],
    timezone: String(row?.whatsapp_takeover_timezone ?? BRAND.timeZone),
  };
}

/**
 * Called by the 360dialog webhook for every new inbound message: creates or
 * refreshes the contact's conversation row (the realtime update is what
 * pops the "take over" alert for sales users), and — if nobody owns the
 * chat yet — hands it to the sales user who last quoted this number.
 * Returns the row so the webhook can skip the AI while ai_paused is set.
 */
export async function touchConversationOnInbound(
  admin: AdminClient,
  input: { tenantId: string; brandId: string; customerId: string; waId: string; contactName: string; preview: string },
): Promise<WhatsAppConversationRow | null> {
  const { data: row, error } = await admin
    .from("whatsapp_conversations")
    .upsert(
      {
        tenant_id: input.tenantId,
        brand_id: input.brandId,
        customer_id: input.customerId,
        wa_id: input.waId,
        contact_name: input.contactName,
        last_inbound_at: new Date().toISOString(),
        last_inbound_preview: input.preview.slice(0, 280),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,wa_id" },
    )
    .select("id, tenant_id, wa_id, owner_id, owner_source, ai_paused")
    .single();
  if (error || !row) {
    console.error(`whatsapp: could not update conversation for ${input.waId}: ${error?.message}`);
    return null;
  }
  const conversation = row as WhatsAppConversationRow;
  if (conversation.owner_id) return conversation;

  const { data: quoteOwner } = await admin.rpc("whatsapp_quote_owner", { p_tenant_id: input.tenantId, p_wa_id: input.waId });
  if (!quoteOwner) return conversation;

  const { data: assigned } = await admin
    .from("whatsapp_conversations")
    .update({ owner_id: quoteOwner, owner_source: "quoted", owned_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .is("owner_id", null)
    .select("id, tenant_id, wa_id, owner_id, owner_source, ai_paused")
    .maybeSingle();
  return (assigned as WhatsAppConversationRow | null) ?? conversation;
}

/** Who is looking at the WhatsApp inbox — Master Admin sees every chat, a sales user only the ones they own. */
export interface InboxViewer {
  tenantId: string;
  profileId: string;
  isMasterAdmin: boolean;
}

/**
 * A page of the WhatsApp chat list, newest first. Read with the service-role
 * client and scoped explicitly (tenant, and owner for sales users) — the same
 * rules as the whatsapp_conversations RLS policy, without per-row policy
 * evaluation, and with the error logged instead of an empty list.
 */
export async function listInboxConversations(
  admin: AdminClient,
  viewer: InboxViewer,
  opts: { limit: number; before?: string | null; search?: string | null; waId?: string | null },
): Promise<{ rows: ConversationListRow[]; error: string | null }> {
  let q = admin
    .from("whatsapp_conversations")
    .select(CONVERSATION_LIST_COLUMNS)
    .eq("tenant_id", viewer.tenantId)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(opts.limit);
  if (!viewer.isMasterAdmin) q = q.eq("owner_id", viewer.profileId);
  if (opts.before) q = q.lt("last_message_at", opts.before);
  if (opts.waId) q = q.eq("wa_id", opts.waId);
  const filter = opts.search ? conversationSearchFilter(opts.search) : null;
  if (filter) q = q.or(filter);
  const { data, error } = await q;
  if (error) {
    console.error("WhatsApp inbox: loading chats failed", error.message);
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as unknown as ConversationListRow[], error: null };
}

/** The newest 300 messages of one chat, oldest first. Callers check the viewer may open this chat. */
export async function loadInboxThread(
  admin: AdminClient,
  tenantId: string,
  waId: string,
): Promise<{ messages: WhatsAppMessageRow[]; error: string | null }> {
  const { data, error } = await admin
    .from("whatsapp_messages")
    .select("id, direction, message_type, body, created_at, delivery_status, delivery_error")
    .eq("tenant_id", tenantId)
    .eq("wa_id", waId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("WhatsApp inbox: loading messages failed", error.message);
    return { messages: [], error: error.message };
  }
  const messages = (data ?? [])
    .map((r) => ({
      id: r.id as string,
      direction: r.direction as WhatsAppMessageRow["direction"],
      messageType: r.message_type as string,
      body: r.body as string,
      createdAt: r.created_at as string,
      deliveryStatus: r.delivery_status as WhatsAppMessageRow["deliveryStatus"],
      deliveryError: r.delivery_error as string | null,
    }))
    .reverse();
  return { messages, error: null };
}
