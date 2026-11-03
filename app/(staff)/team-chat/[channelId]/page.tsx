import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatChannelView, type ChatMessageRow, type MemberOption, type PickerOption } from "@/components/pages/ChatChannelView";

interface MessageRow {
  id: string;
  sender_id: string | null;
  body: string;
  attachment_storage_path: string | null;
  attachment_file_name: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
  customers: { contact_name: string; company_name: string | null } | null;
  suppliers: { name: string } | null;
  quotes: { quote_number: string } | null;
  tasks: { title: string } | null;
}

export default async function ChatChannelRoutePage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: channel } = await supabase.from("chat_channels").select("id, type, name").eq("id", channelId).maybeSingle();
  if (!channel) notFound();

  const [{ data: messageRows }, { data: memberRows }, { data: customers }, { data: suppliers }, { data: quotes }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("chat_messages")
        .select(
          "id, sender_id, body, attachment_storage_path, attachment_file_name, created_at, profiles(full_name), customers(contact_name, company_name), suppliers(name), quotes(quote_number), tasks(title)",
        )
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(50),
      supabase.from("chat_channel_members").select("profile_id, profiles(full_name)").eq("channel_id", channelId),
      supabase.from("customers").select("id, contact_name, company_name").order("contact_name").limit(200),
      supabase.from("suppliers").select("id, name").order("name").limit(200),
      supabase.from("quotes").select("id, quote_number").order("created_at", { ascending: false }).limit(200),
      supabase.from("tasks").select("id, title").order("created_at", { ascending: false }).limit(200),
    ]);

  const members = (memberRows ?? []) as unknown as { profile_id: string; profiles: { full_name: string } | null }[];
  const channelLabel =
    channel.type === "dm"
      ? (members.find((m) => m.profile_id !== profile.id)?.profiles?.full_name ?? "Direct message")
      : (channel.name ?? "Channel");

  const messages = ((messageRows ?? []) as unknown as MessageRow[]).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: m.profiles?.full_name ?? "Unknown",
    body: m.body,
    attachmentFileName: m.attachment_file_name,
    attachmentStoragePath: m.attachment_storage_path,
    linkedLabel:
      m.customers?.company_name ||
      m.customers?.contact_name ||
      m.suppliers?.name ||
      (m.quotes ? `Quote ${m.quotes.quote_number}` : null) ||
      (m.tasks ? `Task: ${m.tasks.title}` : null) ||
      null,
    createdAt: m.created_at,
  }));

  const urlEntries = await Promise.all(
    messages
      .filter((m) => m.attachmentStoragePath)
      .map(async (m) => {
        const { data: signed } = await supabase.storage.from("chat-files").createSignedUrl(m.attachmentStoragePath as string, 3600);
        return [m.id, signed?.signedUrl ?? null] as const;
      }),
  );
  const attachmentUrls = Object.fromEntries(urlEntries);
  const initialMessages: ChatMessageRow[] = messages.map((m) => ({ ...m, attachmentUrl: attachmentUrls[m.id] ?? null }));

  const memberOptions: MemberOption[] = members
    .filter((m) => m.profiles)
    .map((m) => ({ id: m.profile_id, name: m.profiles!.full_name }));

  const customerOptions: PickerOption[] = (customers ?? []).map((c) => ({ id: c.id, label: c.company_name || c.contact_name }));
  const supplierOptions: PickerOption[] = (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }));
  const quoteOptions: PickerOption[] = (quotes ?? []).map((q) => ({ id: q.id, label: q.quote_number }));
  const taskOptions: PickerOption[] = (tasks ?? []).map((t) => ({ id: t.id, label: t.title }));

  return (
    <ChatChannelView
      channelId={channelId}
      channelLabel={channelLabel}
      tenantId={profile.tenant_id}
      currentProfileId={profile.id}
      initialMessages={initialMessages}
      members={memberOptions}
      customers={customerOptions}
      suppliers={supplierOptions}
      quotes={quoteOptions}
      tasks={taskOptions}
    />
  );
}
