"use client";

import { useState, useTransition } from "react";
import { Calculator, Mail, FileSearch, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Panel } from "@/components/ui/Panel";
import { AI_PROVIDER_REGISTRY, type AiFeatureKey, type AiProvider } from "@/lib/aiProviderRegistry";
import { WhatsAppIcon, PROVIDER_ICONS } from "./ProviderIcons";
import { updateAiModelSettingsAction } from "./actions";

type Settings = Record<AiFeatureKey, { provider: AiProvider; model: string }>;
type FeatureIcon = LucideIcon | typeof WhatsAppIcon;

const PROVIDER_OPTIONS = Object.entries(AI_PROVIDER_REGISTRY) as [AiProvider, (typeof AI_PROVIDER_REGISTRY)[AiProvider]][];

const FEATURE_CARDS: { key: AiFeatureKey; label: string; icon: FeatureIcon; text: string }[] = [
  {
    key: "whatsapp_intake",
    label: "WhatsApp Conversation",
    icon: WhatsAppIcon,
    text: "Chats with a customer over WhatsApp and gathers their trip details — name, email, pickup, destination, date, passengers, special requirements.",
  },
  {
    key: "pricing_engine",
    label: "Pricing & Auto-Quote",
    icon: Calculator,
    text: "Prices a trip for the SLA-breach sweep, instant quoting on a new WhatsApp lead, instant quoting on manual assign-to-AI, and the Master Admin benchmark button — all four always share this one model.",
  },
  {
    key: "email_intake",
    label: "Email Lead Intake",
    icon: Mail,
    text: "Reads the shared enquiry inbox every hour and decides which forwarded emails are genuine travel enquiries worth turning into a lead — including any attached image/PDF/Word document, not just the email text.",
  },
  {
    key: "complex_booking",
    label: "Complex Booking Extraction",
    icon: FileSearch,
    text: "Reads a pasted itinerary or an uploaded image/PDF/Word document and extracts a structured multi-leg booking.",
  },
];

export function AiModelsForm({ initialSettings }: { initialSettings: Settings }) {
  const notify = useToast();
  const [settings, setSettings] = useState<Settings>(initialSettings);
  // Tracks what's actually saved — compared against `settings` below to
  // decide whether the Save button shows at all. Separate from the
  // `initialSettings` prop (which never changes without a page reload) so
  // the button correctly disappears again right after a successful save.
  const [savedSettings, setSavedSettings] = useState<Settings>(initialSettings);
  const [pending, startTransition] = useTransition();

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  function setProvider(key: AiFeatureKey, provider: AiProvider) {
    // Reset to that provider's first model — the previously-selected model
    // id almost certainly doesn't exist under the new provider.
    const firstModel = AI_PROVIDER_REGISTRY[provider].models[0]?.id ?? "";
    setSettings((prev) => ({ ...prev, [key]: { provider, model: firstModel } }));
  }

  function setModel(key: AiFeatureKey, model: string) {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], model } }));
  }

  function save() {
    startTransition(async () => {
      const result = await updateAiModelSettingsAction(settings);
      if (result?.error) {
        notify(result.error);
        return;
      }
      setSavedSettings(settings);
      notify("AI Models settings saved");
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURE_CARDS.map(({ key, label, icon: Icon, text }) => {
          const choice = settings[key];
          const providerInfo = AI_PROVIDER_REGISTRY[choice.provider];
          // The icon next to "AI model" tracks whichever provider is
          // currently picked on this card, rather than one fixed glyph —
          // swap OpenAI/Claude/Gemini/Grok and the icon swaps with it.
          const ProviderIcon = PROVIDER_ICONS[choice.provider];
          return (
            <Panel key={key} className="h-full">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-black">{label}</h3>
                  <p className="mt-1 text-xs text-slate-500">{text}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                <ProviderIcon size={14} />
                AI model
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={choice.provider}
                  onChange={(e) => setProvider(key, e.target.value as AiProvider)}
                  className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                >
                  {PROVIDER_OPTIONS.map(([id, info]) => (
                    <option key={id} value={id}>
                      {info.label}
                    </option>
                  ))}
                </select>
                <select
                  value={choice.model}
                  onChange={(e) => setModel(key, e.target.value)}
                  className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                >
                  {providerInfo.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {key === "complex_booking" && !providerInfo.supportsPdf && (
                <p className="mt-2 text-xs text-amber-600">
                  {providerInfo.label} doesn&rsquo;t support PDF uploads for this feature yet — image uploads and pasted text still work.
                </p>
              )}
              {key === "email_intake" && !providerInfo.supportsPdf && (
                <p className="mt-2 text-xs text-amber-600">
                  {providerInfo.label} doesn&rsquo;t support PDF attachments for this feature yet — they&rsquo;re skipped, image attachments and the email text still work.
                </p>
              )}
            </Panel>
          );
        })}
      </div>

      {isDirty && (
        <button disabled={pending} onClick={save} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
