// Shared by the WhatsApp page (server) and its inbox component (browser) —
// the chat list is read from whatsapp_conversations, whose last_message_*
// columns a trigger keeps current (0113_whatsapp_sales_takeover.sql), so
// every chat can be listed and paged without scanning the message log.

import type { WhatsAppMessageDirection } from "@/lib/supabase/database.types";

export const CONVERSATION_PAGE_SIZE = 50;

export const CONVERSATION_LIST_COLUMNS =
  "wa_id, customer_id, contact_name, owner_id, owner_source, ai_paused, last_message_at, last_message_preview, last_message_direction, customers(contact_name, company_name, phone)";

export interface ConversationSummary {
  waId: string;
  customerId: string | null;
  name: string;
  phone: string;
  lastBody: string;
  lastDirection: WhatsAppMessageDirection;
  lastAt: string;
  /** Sales user who owns the chat; null = unassigned, AI only. */
  ownerId: string | null;
  ownerName: string | null;
  ownerSource: "takeover" | "quoted" | "admin" | null;
  /** True while a human has the chat and the AI isn't replying. */
  aiPaused: boolean;
}

export interface ConversationListRow {
  wa_id: string;
  customer_id: string | null;
  contact_name: string | null;
  owner_id: string | null;
  owner_source: "takeover" | "quoted" | "admin" | null;
  ai_paused: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: WhatsAppMessageDirection | null;
  customers: { contact_name: string; company_name: string | null; phone: string | null } | null;
}

export function toConversationSummary(row: ConversationListRow, ownerNames: Map<string, string>): ConversationSummary {
  return {
    waId: row.wa_id,
    customerId: row.customer_id,
    name: row.customers?.company_name || row.customers?.contact_name || row.contact_name || row.wa_id,
    phone: row.customers?.phone ?? row.wa_id,
    lastBody: row.last_message_preview ?? "",
    lastDirection: row.last_message_direction ?? "inbound",
    lastAt: row.last_message_at ?? "",
    ownerId: row.owner_id,
    ownerName: row.owner_id ? (ownerNames.get(row.owner_id) ?? "Sales user") : null,
    ownerSource: row.owner_source,
    aiPaused: row.ai_paused,
  };
}

/** PostgREST `or` filter for the search box — name, phone or WhatsApp number. Commas/parens are stripped so the term can't break the filter syntax. */
export function conversationSearchFilter(term: string): string | null {
  const clean = term.replace(/[,()*%]/g, " ").trim();
  if (!clean) return null;
  const digits = clean.replace(/\D/g, "");
  const parts = [`contact_name.ilike.*${clean}*`];
  if (digits.length >= 3) parts.push(`wa_id.ilike.*${digits}*`);
  return parts.join(",");
}
