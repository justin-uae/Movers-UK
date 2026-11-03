import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getChannelList } from "@/lib/chat";

export default async function TeamChatIndexPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const channels = await getChannelList(supabase, profile.id);

  const first = channels[0];
  if (first) {
    redirect(`/team-chat/${first.id}`);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center">
      <MessagesSquare className="text-slate-300" size={40} />
      <p className="mt-3 font-bold text-slate-700">No channels yet</p>
      <p className="mt-1 text-sm text-slate-500">Create a channel or start a direct message to get going.</p>
    </div>
  );
}
