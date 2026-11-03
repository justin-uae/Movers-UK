"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateAiAutoQuoteSettingsAction } from "./actions";
import { CURRENCIES } from "@/lib/currencies";
import { BRAND } from "@/lib/brandConfig";

type InstantSource = "whatsapp" | "website" | "email" | "manual";

const INSTANT_SOURCES: { key: InstantSource; label: string; text: string }[] = [
  {
    key: "whatsapp",
    label: "WhatsApp leads",
    text: "The moment a WhatsApp conversation gathers enough to create a lead.",
  },
  {
    key: "website",
    label: "Website leads",
    text: "The moment a website quote form is submitted. Contact-form messages with no journey aren't quoted.",
  },
  {
    key: "email",
    label: "Email leads",
    text: "The moment the enquiry inbox turns a forwarded email into a lead (checked every 5 minutes).",
  },
  {
    key: "manual",
    label: "Manually added leads",
    text: "When staff add a lead by hand — they land on the lead with its AI quote instead of the quote builder.",
  },
];

export function AiAutoQuoteForm({
  initialEnabled,
  initialSlaHours,
  initialInstant,
  initialMarkupPercent,
  initialQuoteCurrency,
}: {
  initialEnabled: boolean;
  initialSlaHours: number;
  initialInstant: Record<InstantSource, boolean>;
  initialMarkupPercent: number;
  initialQuoteCurrency: string;
}) {
  const notify = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [slaHours, setSlaHours] = useState(String(initialSlaHours));
  const [instant, setInstant] = useState(initialInstant);
  const [markupPercent, setMarkupPercent] = useState(String(initialMarkupPercent));
  const [quoteCurrency, setQuoteCurrency] = useState(initialQuoteCurrency);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateAiAutoQuoteSettingsAction({
        enabled,
        slaHours: Number(slaHours),
        markupPercent: Number(markupPercent),
        quoteCurrency,
        whatsappAutoQuoteEnabled: instant.whatsapp,
        websiteAutoQuoteEnabled: instant.website,
        emailAutoQuoteEnabled: instant.email,
        manualAutoQuoteEnabled: instant.manual,
      });
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("AI Assistant settings saved");
    });
  }

  return (
    <div className="mt-4 max-w-md space-y-5">
      <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <span>
          <span className="block text-sm font-bold">Enable AI Assistant</span>
          <span className="block text-xs text-slate-500">When off, unquoted leads are left for staff regardless of how long they sit.</span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-primary-500"
        />
      </label>

      <div>
        <label className="block text-sm font-bold" htmlFor="ai-auto-quote-sla-hours">
          Time limit (business hours before AI takes over)
        </label>
        <p className="mt-1 text-xs text-slate-500">Monday-Saturday only — Sundays don&rsquo;t count toward this total. Default 24.</p>
        <input
          id="ai-auto-quote-sla-hours"
          type="number"
          min={1}
          max={500}
          value={slaHours}
          onChange={(e) => setSlaHours(e.target.value)}
          disabled={!enabled}
          className="mt-2 w-32 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-sm font-bold" htmlFor="ai-auto-quote-markup-percent">
          Price increase on AI-priced quotes (%)
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Added on top of whatever {BRAND.aiAssistantName} itself prices, before the quote is saved and sent. 0 = no change. Shown on the lead&rsquo;s own timeline whenever it&rsquo;s used.
        </p>
        <input
          id="ai-auto-quote-markup-percent"
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={markupPercent}
          onChange={(e) => setMarkupPercent(e.target.value)}
          disabled={!enabled}
          className="mt-2 w-32 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-sm font-bold" htmlFor="ai-quote-currency">
          Currency for AI quotes
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Every quote AI creates — from the time limit, an instant quote, or an assign-to-AI — is priced in this currency. Customers still see
          their own local currency on the quote page. Default {BRAND.defaultCurrency}.
        </p>
        <select
          id="ai-quote-currency"
          value={quoteCurrency}
          onChange={(e) => setQuoteCurrency(e.target.value)}
          className="mt-2 w-full max-w-xs rounded-xl border px-3 py-2.5 text-sm font-semibold"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 border-t pt-5">
        <div>
          <span className="block text-sm font-bold">Instant quote for new leads</span>
          <span className="block text-xs text-slate-500">
            When on for a source, a new lead from it is priced and quoted by AI straight away — email and WhatsApp both —
            instead of waiting for a salesperson or the time limit above. Each is off by default and separate from AI
            Assistant itself.
          </span>
        </div>
        {INSTANT_SOURCES.map((s) => (
          <label key={s.key} className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <span>
              <span className="block text-sm font-bold">{s.label}</span>
              <span className="block text-xs text-slate-500">{s.text}</span>
            </span>
            <input
              type="checkbox"
              checked={instant[s.key]}
              onChange={(e) => setInstant((prev) => ({ ...prev, [s.key]: e.target.checked }))}
              className="h-5 w-5 shrink-0 accent-primary-500"
            />
          </label>
        ))}
      </div>

      <button
        disabled={pending}
        onClick={save}
        className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
