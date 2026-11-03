import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TAKEOVER_SETTINGS_COLUMNS, takeoverSettingsFrom } from "@/lib/whatsappConversations";
import { WhatsAppTakeoverForm } from "./WhatsAppTakeoverForm";

export default async function WhatsAppTakeoverPage() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) notFound();

  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select(TAKEOVER_SETTINGS_COLUMNS).eq("id", profile.tenant_id).single();

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="WhatsApp Takeover"
        text="Choose when sales users get a popup for new WhatsApp messages and can take the chat over from the AI."
        action={
          <PageGuide
            title="WhatsApp Takeover"
            subtitle="Hand WhatsApp chats from the AI to your sales team during working hours."
            sections={[
              {
                heading: "During these hours",
                bullets: true,
                body: [
                  "When a WhatsApp message arrives on a chat nobody owns, every sales user gets a popup with a Take over button. The first to click it owns the chat, and the popup closes for everyone else.",
                  "The AI keeps replying until someone takes over. After that it stays silent on that chat until the owner clicks Hand back to AI.",
                ],
              },
              {
                heading: "Outside these hours",
                bullets: true,
                body: [
                  "No popups, and unowned chats can't be taken over — the AI answers them as usual.",
                  "Sales users can still reply in chats they already own, at any time.",
                ],
              },
              {
                heading: "Always, whatever the hours",
                bullets: true,
                body: [
                  "A customer a sales user has already quoted goes straight to that sales user's WhatsApp tab and isn't offered to anyone else.",
                  "Sales users only ever see their own chats. Master Admin sees every chat and its full history on the WhatsApp page, and can move a chat to someone else.",
                ],
              },
            ]}
          />
        }
      />

      <div className="max-w-4xl">
        <WhatsAppTakeoverForm initial={takeoverSettingsFrom(tenant as Record<string, unknown> | null)} />
      </div>
    </div>
  );
}
