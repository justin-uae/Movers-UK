"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendWhatsAppText } from "@/lib/whatsapp360";
import type { WhatsAppConversation } from "@/lib/supabase/database.types";
import { listInboxConversations, loadInboxThread } from "@/lib/whatsappConversations";
import { CONVERSATION_PAGE_SIZE, type ConversationListRow } from "@/lib/whatsappInbox";
import type { WhatsAppMessageRow } from "@/components/pages/WhatsAppInboxPage";

type Actor = Awaited<ReturnType<typeof requireProfile>>;
type Admin = ReturnType<typeof createAdminClient>;

async function loadConversation(admin: Admin, tenantId: string, waId: string): Promise<WhatsAppConversation | null> {
  const { data } = await admin.from("whatsapp_conversations").select("*").eq("tenant_id", tenantId).eq("wa_id", waId).maybeSingle();
  return (data as WhatsAppConversation | null) ?? null;
}

async function isAgent(admin: Admin, actor: Actor): Promise<boolean> {
  const { data } = await admin.rpc("is_whatsapp_agent", { p_profile_id: actor.id });
  return Boolean(data);
}

/** "Load older chats" (pass the oldest loaded chat time as `before`) and the search box (`search`, up to 100 matches). */
export async function loadWhatsAppChatsAction(opts: {
  before?: string | null;
  search?: string | null;
}): Promise<{ rows: ConversationListRow[]; hasMore: boolean; error: string | null }> {
  const actor = await requireProfile();
  const admin = createAdminClient();
  if (!actor.is_master_admin && !(await isAgent(admin, actor))) return { rows: [], hasMore: false, error: "No access to WhatsApp." };
  const limit = opts.search ? 100 : CONVERSATION_PAGE_SIZE;
  const { rows, error } = await listInboxConversations(
    admin,
    { tenantId: actor.tenant_id, profileId: actor.id, isMasterAdmin: actor.is_master_admin },
    { limit, before: opts.before, search: opts.search },
  );
  return { rows, hasMore: rows.length === limit, error };
}

/** Messages for the chat being opened — Master Admin any chat, a sales user only one they own. */
export async function loadWhatsAppThreadAction(waId: string): Promise<{ messages: WhatsAppMessageRow[]; error: string | null }> {
  const actor = await requireProfile();
  const admin = createAdminClient();
  if (!actor.is_master_admin) {
    const conversation = await loadConversation(admin, actor.tenant_id, waId);
    if (conversation?.owner_id !== actor.id) return { messages: [], error: "This chat belongs to someone else." };
  }
  return loadInboxThread(admin, actor.tenant_id, waId);
}

/**
 * Staff-typed reply. Master Admin can reply in any chat; a sales user only
 * in a chat they own. A human reply also pauses the AI on that chat, so it
 * never answers over the top of the salesperson — "Hand back to AI" undoes
 * that. Logged with the service-role client after the checks above.
 */
export async function sendWhatsAppReplyAction(waId: string, body: string): Promise<{ error: string | null }> {
  const actor = await requireProfile();
  const trimmed = body.trim();
  if (!trimmed) return { error: "Write a message first." };

  const admin = createAdminClient();
  const conversation = await loadConversation(admin, actor.tenant_id, waId);
  if (!actor.is_master_admin && conversation?.owner_id !== actor.id) {
    return { error: "Take over this chat before replying." };
  }

  // Reply on the same brand/number the contact last wrote to.
  const { data: last } = await admin
    .from("whatsapp_messages")
    .select("brand_id, customer_id")
    .eq("tenant_id", actor.tenant_id)
    .eq("wa_id", waId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const brandId = conversation?.brand_id ?? last?.brand_id ?? null;
  if (!brandId) return { error: "No brand is linked to this chat to send from." };
  const customerId = conversation?.customer_id ?? last?.customer_id ?? null;

  const sendResult = await sendWhatsAppText(waId, trimmed);

  // Logged either way — even a rejected send stays visible in the thread,
  // marked as failed, rather than just vanishing with a toast the sender
  // might not have seen. Most common failure cause: it's been over 24h
  // since the contact's last message, and WhatsApp only allows re-opening
  // that window with an approved template, not freeform text.
  const { error } = await admin.from("whatsapp_messages").insert({
    tenant_id: actor.tenant_id,
    brand_id: brandId,
    customer_id: customerId,
    wa_id: waId,
    direction: "outbound",
    message_type: "text",
    body: trimmed,
    sent_by: actor.id,
    delivery_status: sendResult.ok ? "sent" : "failed",
    delivery_error: sendResult.ok ? null : (sendResult.error ?? "Unknown error"),
  });
  if (error) return { error: error.message };

  if (conversation && !conversation.ai_paused) {
    await admin.from("whatsapp_conversations").update({ ai_paused: true, updated_at: new Date().toISOString() }).eq("id", conversation.id);
  }

  if (!sendResult.ok) {
    revalidatePath("/whatsapp");
    return {
      error: `WhatsApp didn't deliver this message (${sendResult.error ?? "unknown error"}). If it's been more than 24 hours since their last message, WhatsApp requires an approved template to start the conversation again — a plain reply won't go through.`,
    };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "whatsapp_message_sent",
    entityType: "customer",
    entityId: customerId,
    newValue: { waId },
  });

  revalidatePath("/whatsapp");
  return { error: null };
}

/**
 * "Take over" from the popup or the chat header. A sales user can claim an
 * unowned chat only while the admin-set takeover window is open, and the
 * claim is first-come-first-served (conditional update on owner_id is
 * null). Taking over always pauses the AI. Master Admin can pause the AI on
 * any chat without changing who owns it.
 */
export async function takeOverWhatsAppChatAction(waId: string): Promise<{ error: string | null; ownerName?: string }> {
  const actor = await requireProfile();
  const admin = createAdminClient();
  const conversation = await loadConversation(admin, actor.tenant_id, waId);
  if (!conversation) return { error: "This chat no longer exists." };
  const now = new Date().toISOString();

  if (actor.is_master_admin || conversation.owner_id === actor.id) {
    await admin.from("whatsapp_conversations").update({ ai_paused: true, updated_at: now }).eq("id", conversation.id);
  } else {
    if (!(await isAgent(admin, actor))) return { error: "Only sales users can take over WhatsApp chats." };
    if (conversation.owner_id) {
      const { data: owner } = await admin.from("profiles").select("full_name").eq("id", conversation.owner_id).maybeSingle();
      return { error: `${owner?.full_name ?? "Another sales user"} has already taken this chat.` };
    }
    const { data: open } = await admin.rpc("whatsapp_takeover_open", { p_tenant_id: actor.tenant_id });
    if (!open) return { error: "WhatsApp takeover is only available during the hours set by your admin." };

    const { data: claimed } = await admin
      .from("whatsapp_conversations")
      .update({ owner_id: actor.id, owner_source: "takeover", owned_at: now, ai_paused: true, updated_at: now })
      .eq("id", conversation.id)
      .is("owner_id", null)
      .select("id")
      .maybeSingle();
    if (!claimed) return { error: "Someone else took this chat a moment ago." };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "whatsapp_chat_taken_over",
    entityType: "customer",
    entityId: conversation.customer_id,
    newValue: { waId },
  });
  revalidatePath("/whatsapp");
  return { error: null, ownerName: actor.full_name };
}

/** Lets the AI answer this chat again. The chat stays with its owner. */
export async function handBackToAiAction(waId: string): Promise<{ error: string | null }> {
  const actor = await requireProfile();
  const admin = createAdminClient();
  const conversation = await loadConversation(admin, actor.tenant_id, waId);
  if (!conversation) return { error: "This chat no longer exists." };
  if (!actor.is_master_admin && conversation.owner_id !== actor.id) return { error: "This isn't your chat." };

  await admin.from("whatsapp_conversations").update({ ai_paused: false, updated_at: new Date().toISOString() }).eq("id", conversation.id);
  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "whatsapp_chat_handed_to_ai",
    entityType: "customer",
    entityId: conversation.customer_id,
    newValue: { waId },
  });
  revalidatePath("/whatsapp");
  return { error: null };
}

/** Master Admin: move a chat to another sales user, or back to nobody (null) — which also hands it back to the AI. */
export async function assignWhatsAppChatAction(waId: string, ownerId: string | null): Promise<{ error: string | null }> {
  const actor = await requireProfile();
  if (!actor.is_master_admin) return { error: "Only Master Admin can reassign chats." };
  const admin = createAdminClient();
  const conversation = await loadConversation(admin, actor.tenant_id, waId);
  if (!conversation) return { error: "This chat no longer exists." };

  if (ownerId) {
    const { data: agent } = await admin.rpc("is_whatsapp_agent", { p_profile_id: ownerId });
    if (!agent) return { error: "That person isn't an active sales user." };
  }
  const now = new Date().toISOString();
  await admin
    .from("whatsapp_conversations")
    .update(
      ownerId
        ? { owner_id: ownerId, owner_source: "admin", owned_at: now, updated_at: now }
        : { owner_id: null, owner_source: null, owned_at: null, ai_paused: false, updated_at: now },
    )
    .eq("id", conversation.id);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "whatsapp_chat_reassigned",
    entityType: "customer",
    entityId: conversation.customer_id,
    previousValue: { ownerId: conversation.owner_id },
    newValue: { waId, ownerId },
  });
  revalidatePath("/whatsapp");
  return { error: null };
}
