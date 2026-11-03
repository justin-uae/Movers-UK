"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function createChannelAction(name: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (!name.trim()) throw new Error("Give the channel a name.");

  const channelId = crypto.randomUUID();
  const { error } = await supabase
    .from("chat_channels")
    .insert({ id: channelId, tenant_id: actor.tenant_id, type: "channel", name: name.trim(), created_by: actor.id });
  if (error) throw new Error(error.message);

  const { error: memberError } = await supabase
    .from("chat_channel_members")
    .insert({ channel_id: channelId, profile_id: actor.id });
  if (memberError) throw new Error(memberError.message);

  revalidatePath("/team-chat", "layout");
  return channelId;
}

export async function startDmAction(otherProfileId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (otherProfileId === actor.id) throw new Error("You can't message yourself.");

  const { data: myDms } = await supabase
    .from("chat_channel_members")
    .select("channel_id, chat_channels(type)")
    .eq("profile_id", actor.id);
  const myDmChannelIds = ((myDms ?? []) as unknown as { channel_id: string; chat_channels: { type: string } | null }[])
    .filter((m) => m.chat_channels?.type === "dm")
    .map((m) => m.channel_id);

  if (myDmChannelIds.length > 0) {
    const { data: existing } = await supabase
      .from("chat_channel_members")
      .select("channel_id")
      .eq("profile_id", otherProfileId)
      .in("channel_id", myDmChannelIds)
      .maybeSingle();
    if (existing) return existing.channel_id as string;
  }

  const channelId = crypto.randomUUID();
  const { error } = await supabase
    .from("chat_channels")
    .insert({ id: channelId, tenant_id: actor.tenant_id, type: "dm", created_by: actor.id });
  if (error) throw new Error(error.message);

  // The DM row is only visible under RLS once a chat_channel_members row for
  // the viewer exists (see chat_channels_select in 0028_team_chat.sql) — that
  // is exactly why the channel id is generated above rather than read back
  // via .select() on the insert: requesting the row back (RETURNING) would
  // apply that same SELECT policy before this membership row exists, and
  // fail with "new row violates row-level security policy".
  const { error: memberError } = await supabase.from("chat_channel_members").insert([
    { channel_id: channelId, profile_id: actor.id },
    { channel_id: channelId, profile_id: otherProfileId },
  ]);
  if (memberError) throw new Error(memberError.message);

  revalidatePath("/team-chat", "layout");
  return channelId;
}

export async function sendMessageAction(
  channelId: string,
  input: {
    body: string;
    attachmentStoragePath: string | null;
    attachmentFileName: string | null;
    customerId: string | null;
    supplierId: string | null;
    quoteId: string | null;
    taskId: string | null;
  },
) {
  const actor = await requireProfile();
  const supabase = await createClient();

  if (!input.body.trim() && !input.attachmentStoragePath) throw new Error("Write a message or attach a file.");

  const { error } = await supabase.from("chat_messages").insert({
    tenant_id: actor.tenant_id,
    channel_id: channelId,
    sender_id: actor.id,
    body: input.body.trim(),
    attachment_storage_path: input.attachmentStoragePath,
    attachment_file_name: input.attachmentFileName,
    customer_id: input.customerId,
    supplier_id: input.supplierId,
    quote_id: input.quoteId,
    task_id: input.taskId,
  });
  if (error) throw new Error(error.message);

  await supabase
    .from("chat_channel_members")
    .upsert(
      { channel_id: channelId, profile_id: actor.id, last_read_at: new Date().toISOString() },
      { onConflict: "channel_id,profile_id" },
    );

  revalidatePath("/team-chat", "layout");
}

/** Bumps last_read_at, and doubles as "join this public channel" the first time it's opened. */
export async function markChannelReadAction(channelId: string) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("chat_channel_members")
    .upsert(
      { channel_id: channelId, profile_id: actor.id, last_read_at: new Date().toISOString() },
      { onConflict: "channel_id,profile_id" },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/team-chat", "layout");
}

export interface ChatSearchResult {
  channelId: string;
  channelLabel: string;
  messageId: string;
  body: string;
  createdAt: string;
}

export async function searchMessagesAction(query: string): Promise<ChatSearchResult[]> {
  await requireProfile();
  const supabase = await createClient();

  if (!query.trim()) return [];

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, channel_id, body, created_at, chat_channels(name, type)")
    .ilike("body", `%${query.trim()}%`)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as { id: string; channel_id: string; body: string; created_at: string; chat_channels: { name: string | null; type: string } | null }[]).map(
    (row) => ({
      channelId: row.channel_id,
      channelLabel: row.chat_channels?.type === "dm" ? "Direct message" : (row.chat_channels?.name ?? "Channel"),
      messageId: row.id,
      body: row.body,
      createdAt: row.created_at,
    }),
  );
}
