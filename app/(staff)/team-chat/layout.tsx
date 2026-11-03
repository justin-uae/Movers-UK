import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getChannelList } from "@/lib/chat";
import { ChatSidebar } from "@/components/layout/ChatSidebar";
import { PageGuide } from "@/components/ui/PageGuide";
import { TeamChatDiagram } from "@/components/ui/guide-diagrams/TeamChatDiagram";

export default async function TeamChatLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [channels, { data: profiles }] = await Promise.all([
    getChannelList(supabase, profile.id),
    supabase.from("profiles").select("id, full_name").neq("id", profile.id).order("full_name"),
  ]);

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[560px] flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-lg font-black">Team Chat</h1>
        <PageGuide
          title="Team Chat"
          subtitle="Channels and direct messages, with quick links to a customer, supplier, quote or task."
          screenshot={<TeamChatDiagram />}
          sections={[
            {
              heading: "What this page is",
              body: [
                "Internal messaging for the team — public channels anyone can join, and one-on-one direct messages, separate from the customer/supplier-facing WhatsApp and Email Centre modules.",
              ],
            },
            {
              heading: "Channels & DMs",
              bullets: true,
              body: [
                "The + next to Channels starts a new public channel; the + next to Direct Messages starts (or reopens) a 1:1 with anyone in your organisation.",
                "A dot next to a channel means there's something unread in it.",
                "Search messages… searches every channel and DM you're in, not just the one you're viewing.",
              ],
            },
            {
              heading: "In a conversation",
              bullets: true,
              body: [
                "@mention a teammate to call them out directly — it's highlighted in the thread.",
                "Attach a file, or link a message to a customer, supplier, quote or task so the context travels with it.",
              ],
            },
          ]}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <ChatSidebar channels={channels} profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))} />
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
