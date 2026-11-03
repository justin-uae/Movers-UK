import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatChannelType, Database } from "@/lib/supabase/database.types";

export interface ChannelListItem {
  id: string;
  type: ChatChannelType;
  label: string;
  lastMessageAt: string | null;
  unread: boolean;
}

interface MembershipRow {
  channel_id: string;
  last_read_at: string;
  chat_channels: { id: string; type: ChatChannelType; name: string | null } | null;
}

interface OtherMemberRow {
  channel_id: string;
  profiles: { full_name: string } | null;
}

/**
 * The channel-list sidebar's data: every public channel (RLS already scopes
 * these to the tenant + general.workspace_access) plus the caller's own DMs
 * (private rows, only visible via membership), with unread state derived
 * from each membership's last_read_at vs. the channel's latest message.
 */
export async function getChannelList(supabase: SupabaseClient<Database>, profileId: string): Promise<ChannelListItem[]> {
  const [{ data: publicChannelRows }, { data: membershipRows }] = await Promise.all([
    supabase.from("chat_channels").select("id, type, name, created_at").eq("type", "channel").order("created_at", { ascending: true }),
    supabase
      .from("chat_channel_members")
      .select("channel_id, last_read_at, chat_channels(id, type, name)")
      .eq("profile_id", profileId),
  ]);

  const publicChannels = publicChannelRows ?? [];
  const memberships = (membershipRows ?? []) as unknown as MembershipRow[];
  const myDmMemberships = memberships.filter((m) => m.chat_channels?.type === "dm");
  const dmChannelIds = myDmMemberships.map((m) => m.channel_id);
  const lastReadByChannel = new Map(memberships.map((m) => [m.channel_id, m.last_read_at]));
  const allChannelIds = [...publicChannels.map((c) => c.id), ...dmChannelIds];

  const [{ data: otherMemberRows }, { data: latestMessageRows }] = await Promise.all([
    dmChannelIds.length > 0
      ? supabase.from("chat_channel_members").select("channel_id, profiles(full_name)").in("channel_id", dmChannelIds).neq("profile_id", profileId)
      : Promise.resolve({ data: [] as OtherMemberRow[] }),
    allChannelIds.length > 0
      ? supabase
          .from("chat_messages")
          .select("channel_id, created_at")
          .in("channel_id", allChannelIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as { channel_id: string; created_at: string }[] }),
  ]);

  const dmPartnerName = new Map<string, string>();
  for (const row of (otherMemberRows ?? []) as unknown as OtherMemberRow[]) {
    if (row.profiles?.full_name) dmPartnerName.set(row.channel_id, row.profiles.full_name);
  }

  const lastMessageByChannel = new Map<string, string>();
  for (const row of latestMessageRows ?? []) {
    if (!lastMessageByChannel.has(row.channel_id)) lastMessageByChannel.set(row.channel_id, row.created_at);
  }

  const items: ChannelListItem[] = [];

  for (const c of publicChannels) {
    const lastMessageAt = lastMessageByChannel.get(c.id) ?? null;
    const lastReadAt = lastReadByChannel.get(c.id) ?? null;
    items.push({
      id: c.id,
      type: "channel",
      label: c.name ?? "Untitled channel",
      lastMessageAt,
      unread: lastMessageAt !== null && (lastReadAt === null || lastMessageAt > lastReadAt),
    });
  }

  for (const m of myDmMemberships) {
    if (!m.chat_channels) continue;
    const lastMessageAt = lastMessageByChannel.get(m.channel_id) ?? null;
    items.push({
      id: m.channel_id,
      type: "dm",
      label: dmPartnerName.get(m.channel_id) ?? "Direct message",
      lastMessageAt,
      unread: lastMessageAt !== null && lastMessageAt > m.last_read_at,
    });
  }

  items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  return items;
}
