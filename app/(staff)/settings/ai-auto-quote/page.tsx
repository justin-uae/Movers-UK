import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brandConfig";
import { AiAutoQuoteForm } from "./AiAutoQuoteForm";

export default async function AiAutoQuotePage() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) notFound();

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("ai_auto_quote_enabled, ai_auto_quote_sla_hours, whatsapp_auto_quote_enabled, website_auto_quote_enabled, email_auto_quote_enabled, manual_auto_quote_enabled, ai_auto_quote_markup_percent, ai_quote_currency")
    .eq("id", profile.tenant_id)
    .single();

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="AI Assistant"
        text={`Have ${BRAND.aiAssistantName} price and send a quote automatically when a lead sits unquoted too long.`}
        action={
          <PageGuide
            title="AI Assistant"
            subtitle="A safety net for leads nobody's got to in time — not a replacement for a human quote."
            sections={[
              {
                heading: "How it decides a lead is overdue",
                bullets: true,
                body: [
                  "The clock starts when a lead is created — but if it's ever claimed or assigned to a sales user, the clock restarts from that moment instead, giving them a full fresh time-limit window before AI would ever take it. An unclaimed lead sitting in the open pool keeps counting from when it came in.",
                  "Only Monday-Saturday counts — Sunday never adds to the total, so a lead created Saturday evening with a 24-hour time limit breaches Monday evening, not on the Sunday in between.",
                  "Turning this on never treats existing leads as instantly overdue — every lead's countdown is floored at the moment you switch it on, so the first sweep only ever catches ones that are still unquoted after a fresh time limit window from now.",
                  "A lead that's already been quoted, closed, marked spam/duplicate, or whose travel date has already passed is never picked up.",
                ],
              },
              {
                heading: "What happens on breach",
                bullets: true,
                body: [
                  "If the lead is currently assigned to a sales user, it's released back to the open pool first — visible on the lead's Assignment history.",
                  `${BRAND.aiAssistantName} estimates a market-rate selling price and supplier cost for the trip, and a real quote is created and emailed to the customer automatically — same email, PDF and quote lifecycle as a human-sent quote.`,
                  "Every AI-priced quote shows up in Sales -> Pending Quotes (or wherever it's since moved on to, e.g. a Bookings tab) alongside everything else, marked with a small \"AI\" badge next to its status so it's easy to tell what went out automatically.",
                ],
              },
              {
                heading: "Instant quote for new leads",
                bullets: true,
                body: [
                  "Separate switches, below, for WhatsApp, website, email and manually added leads — when one is on, a new lead from that source is priced and quoted by AI immediately, over email AND WhatsApp, instead of waiting for the time limit above. Exactly the same pricing and sending as a WhatsApp lead, whichever source it came from.",
                  "Skipped (left for a salesperson, like before) if the lead has no pickup, destination or customer, is a duplicate, or its travel date has already passed.",
                  "A manually added lead that AI quotes takes the person who added it straight to the lead, with its quote, instead of the quote builder — so it never ends up with two quotes.",
                  "All off by default. When off, a lead from that source behaves exactly as before — it waits for a sales user (or, eventually, the time limit above).",
                ],
              },
              {
                heading: "Instant quoting on manual assignment",
                bullets: true,
                body: [
                  "Always on, not a switch — whenever a Master Admin or Sales Manager explicitly assigns any lead to the AI role's profile from Leads, that's treated the same as a breach: a quote is priced and sent immediately (email and, if the customer has a WhatsApp number on file, WhatsApp too) rather than waiting for the time limit.",
                  "Skipped silently (the assignment itself still goes through) if the lead is missing a pickup, destination or customer, or its travel date has already passed — exactly the same guardrails as the time-limit sweep.",
                ],
              },
              {
                heading: "Price increase on AI-priced quotes",
                bullets: true,
                body: [
                  `A percentage markup, below — applied on top of whatever price ${BRAND.aiAssistantName} itself calculated, right before the quote is saved and sent. 0% (the default) changes nothing.`,
                  "Applies to every quote AI prices and sends unattended, no matter which of the three triggers above created it.",
                  "Shown on the lead's own Assignment history timeline whenever it was used — both the price before and after the increase.",
                ],
              },
              {
                heading: "Who can change this",
                body: ["Master Admin only — this runs hourly for the whole organisation, so it's kept out of individual role permissions."],
              },
            ]}
          />
        }
      />

      <Panel>
        <SectionTitle title="Settings" sub="Applies tenant-wide, checked every hour" />
        <AiAutoQuoteForm
          initialEnabled={tenant?.ai_auto_quote_enabled ?? false}
          initialSlaHours={tenant?.ai_auto_quote_sla_hours ?? 24}
          initialInstant={{
            whatsapp: tenant?.whatsapp_auto_quote_enabled ?? false,
            website: tenant?.website_auto_quote_enabled ?? false,
            email: tenant?.email_auto_quote_enabled ?? false,
            manual: tenant?.manual_auto_quote_enabled ?? false,
          }}
          initialMarkupPercent={tenant?.ai_auto_quote_markup_percent ?? 0}
          initialQuoteCurrency={tenant?.ai_quote_currency ?? BRAND.defaultCurrency}
        />
      </Panel>
    </div>
  );
}
