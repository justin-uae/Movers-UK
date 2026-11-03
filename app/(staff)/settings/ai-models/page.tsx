import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MODEL_SETTING, type AiFeatureKey, type AiProvider } from "@/lib/aiProviders";
import { AiModelsForm } from "./AiModelsForm";
import { AiAccountsPanel } from "./AiAccountsPanel";

export default async function AiModelsPage() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) notFound();

  const supabase = await createClient();
  const { data: tenant } = await supabase.from("tenants").select("ai_model_settings").eq("id", profile.tenant_id).single();

  const saved = (tenant?.ai_model_settings ?? {}) as Partial<Record<AiFeatureKey, { provider: AiProvider; model: string }>>;
  const initialSettings: Record<AiFeatureKey, { provider: AiProvider; model: string }> = {
    whatsapp_intake: saved.whatsapp_intake ?? DEFAULT_MODEL_SETTING,
    pricing_engine: saved.pricing_engine ?? DEFAULT_MODEL_SETTING,
    email_intake: saved.email_intake ?? DEFAULT_MODEL_SETTING,
    complex_booking: saved.complex_booking ?? DEFAULT_MODEL_SETTING,
  };

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="AI Models"
        text="Choose which AI provider and model answers each AI-powered feature in the CRM."
        action={
          <PageGuide
            title="AI Models"
            subtitle="Every AI feature can run on a different provider — OpenAI, Anthropic (Claude), Google (Gemini), or xAI (Grok)."
            sections={[
              {
                heading: "What each card controls",
                bullets: true,
                body: [
                  "WhatsApp Conversation — the bot that chats with a customer over WhatsApp and gathers their trip details.",
                  "Pricing & Auto-Quote — the one pricing engine behind the SLA-breach sweep, instant quoting for new WhatsApp leads, instant quoting when a lead is manually assigned to AI, and the Master Admin benchmark button on an existing quote. All four always use the same model, so pricing never disagrees with itself depending on which one triggered it.",
                  "Email Lead Intake — the hourly sweep that reads the shared enquiry inbox and decides which forwarded emails are genuine travel enquiries.",
                  "Complex Booking Extraction — reads a pasted itinerary or an uploaded file (image, PDF, or Word document) and extracts a structured multi-leg booking. The only feature here that sends images/files to the model, not just text.",
                ],
              },
              {
                heading: "If a provider isn't configured",
                body: [
                  "Each provider needs its own API key set on the server (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, XAI_API_KEY). Selecting a provider whose key isn't set will fail clearly when that feature next runs, rather than silently falling back to another provider.",
                ],
              },
              {
                heading: "Who can change this",
                body: ["Master Admin only."],
              },
            ]}
          />
        }
      />

      <AiModelsForm initialSettings={initialSettings} />
      <AiAccountsPanel />
    </div>
  );
}
