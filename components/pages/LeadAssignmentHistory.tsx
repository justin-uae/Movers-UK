import { Bot } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatDateTime } from "@/lib/formatDate";
import { getAiModelLabel } from "@/lib/aiProviderRegistry";

export interface LeadAssignmentEvent {
  id: string;
  action: string;
  created_at: string;
  new_value: {
    assignedToName?: string;
    quoteNumber?: string;
    aiModel?: { provider: string; model: string } | null;
    /** Settings -> AI Assistant's price-increase percentage, applied on top of whatever the AI itself priced — only present (and only non-zero) on the three ai_quote_created_* actions, see createAndSendQuote (lib/aiAutoQuote.ts). */
    markupPercent?: number;
    currency?: string;
    sellingPrice?: number;
    basePriceBeforeMarkup?: number;
    /** card_payment_override_* actions only — see requestCardPaymentOverrideAction/decideCardPaymentOverrideAction. */
    amountGbp?: number;
    reason?: string | null;
    note?: string | null;
  } | null;
  actor: { full_name: string } | null;
}

/** " (12% AI markup applied — USD 892.50 -> USD 999.60)" — empty string when no markup was configured at the time this quote was created, so older/unmarked-up quotes read exactly as before. */
function markupNote(newValue: LeadAssignmentEvent["new_value"]): string {
  if (!newValue?.markupPercent) return "";
  const { currency = "", basePriceBeforeMarkup: base, sellingPrice: final } = newValue;
  if (base == null || final == null) return ` (${newValue.markupPercent}% AI markup applied)`;
  return ` (${newValue.markupPercent}% AI markup applied — ${currency} ${base.toFixed(2)} → ${currency} ${final.toFixed(2)})`;
}

function describe(e: LeadAssignmentEvent): string {
  const actor = e.actor?.full_name ?? "Someone";
  switch (e.action) {
    case "lead_assigned_by_manager":
      return `${actor} assigned this lead to ${e.new_value?.assignedToName ?? "a sales user"}`;
    case "lead_claimed":
      return `${actor} claimed this lead from the open pool`;
    case "lead_released":
      return `${actor} released this lead back to the open pool`;
    case "lead_released_sla_breach":
      return "Automatically released back to the open pool — it sat unquoted past the AI Assistant's time limit";
    case "ai_quote_created_sla":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically — it sat unquoted past the AI Assistant's time limit${markupNote(e.new_value)}`;
    case "ai_quote_created_whatsapp_lead":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically the moment this WhatsApp lead was captured${markupNote(e.new_value)}`;
    case "ai_quote_created_website_lead":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically the moment this website lead came in${markupNote(e.new_value)}`;
    case "ai_quote_created_email_lead":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically the moment this email lead came in${markupNote(e.new_value)}`;
    case "ai_quote_created_manual_lead":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically when ${actor} added this lead${markupNote(e.new_value)}`;
    case "ai_quote_created_manual_assign":
      return `AI priced and sent quote ${e.new_value?.quoteNumber ?? ""} automatically — ${actor} assigned this lead to it${markupNote(e.new_value)}`;
    case "card_payment_override_requested":
      return `${actor} requested card payment approval for quote ${e.new_value?.quoteNumber ?? ""} (£${(e.new_value?.amountGbp ?? 0).toFixed(2)})${e.new_value?.reason ? ` — ${e.new_value.reason}` : ""}`;
    case "card_payment_override_approved":
      return `${actor} approved card payment for quote ${e.new_value?.quoteNumber ?? ""} (£${(e.new_value?.amountGbp ?? 0).toFixed(2)})${e.new_value?.note ? ` — ${e.new_value.note}` : ""}`;
    case "card_payment_override_rejected":
      return `${actor} rejected the card payment request for quote ${e.new_value?.quoteNumber ?? ""} (£${(e.new_value?.amountGbp ?? 0).toFixed(2)})${e.new_value?.note ? ` — ${e.new_value.note}` : ""}`;
    default:
      return `${actor} updated this lead's ownership`;
  }
}

const AI_TRIGGER_LABEL: Record<string, string> = {
  ai_quote_created_sla: "Time limit",
  lead_released_sla_breach: "Time limit",
  ai_quote_created_whatsapp_lead: "WhatsApp lead",
  ai_quote_created_manual_assign: "Assigned to AI",
  ai_quote_created_website_lead: "Website lead",
  ai_quote_created_email_lead: "Email lead",
  ai_quote_created_manual_lead: "Manual lead",
};

/** Small tag distinguishing what kind of event this was, at a glance —
    "AI · <trigger> · <model>" for anything the AI Assistant did on its own,
    "Manual" for a human claim/assign/release. Kept as three sub-labels
    rather than one generic "AI" badge so the timeline actually tells the
    three AI triggers (SLA time limit, WhatsApp lead, manual assign) apart
    — and, where available, which provider/model actually priced it
    (new_value.aiModel, only present on the two ai_quote_created_* actions
    that go through createAndSendQuote; lead_released_sla_breach has none
    since releasing isn't itself a pricing event). */
const CARD_PAYMENT_BADGE_STYLE: Record<string, string> = {
  card_payment_override_requested: "bg-amber-50 text-amber-700",
  card_payment_override_approved: "bg-emerald-50 text-emerald-700",
  card_payment_override_rejected: "bg-red-50 text-red-700",
};

function Badge({ action, newValue }: { action: string; newValue: LeadAssignmentEvent["new_value"] }) {
  const trigger = AI_TRIGGER_LABEL[action];
  if (trigger) {
    const modelLabel = getAiModelLabel(newValue?.aiModel);
    return (
      <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
        <Bot size={11} /> AI · {trigger}
        {modelLabel ? ` · ${modelLabel}` : ""}
      </span>
    );
  }
  const cardPaymentStyle = CARD_PAYMENT_BADGE_STYLE[action];
  if (cardPaymentStyle) {
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cardPaymentStyle}`}>Payment</span>;
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Manual</span>;
}

/**
 * Who assigned/reassigned/claimed/released this lead, and when — plus every
 * time AI Assistant priced and sent a quote for it on its own (SLA time
 * limit, an instant WhatsApp lead, or being explicitly assigned to the AI
 * role), each tagged with its own badge so the three triggers read
 * distinctly instead of one generic "AI did something" line. Separate from
 * LeadEditHistory (field-level content edits, lead_edits table) since this
 * reads audit_log instead (assignLeadAction/claimLeadAction/
 * releaseLeadAction/lib/aiAutoQuote.ts all call recordAudit against
 * entity_type = 'lead'). Only fetched for, and only visible to, someone
 * holding admin.view_audit_logs (Master Admin, Sales Manager) — audit_log's
 * own select policy is gated on that permission tenant-wide, not something
 * this component can widen.
 */
export function LeadAssignmentHistory({ events }: { events: LeadAssignmentEvent[] }) {
  if (events.length === 0) return null;

  return (
    <Panel>
      <SectionTitle title="Assignment history" sub="Who this lead has been assigned, claimed or released by, and when — including anything AI Assistant did on its own, and any card payment requests on its quotes" />
      <ol className="mt-4 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border p-3 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              <Badge action={e.action} newValue={e.new_value} />
              <span>{describe(e)}</span>
            </span>
            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(e.created_at)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
