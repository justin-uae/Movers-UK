import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatDateTime } from "@/lib/formatDate";
import {
  REMINDER_OFFSETS_HOURS,
  earliestTravelDate,
  reminderAnchor,
  reminderKindForStatus,
  reminderSchedule,
  reminderStepLabel,
  type QuoteReminderKind,
} from "@/lib/quoteReminderSchedule";
import { QuoteRemindersButton } from "./QuoteRemindersButtons";

export interface QuoteReminderRow {
  kind: QuoteReminderKind;
  step: number;
  sent_at: string;
  error: string | null;
}

type StepState = "sent" | "failed" | "skipped" | "due" | "upcoming" | "wont_send";

const STATE_STYLE: Record<StepState, string> = {
  sent: "text-emerald-700",
  failed: "text-red-600",
  skipped: "text-slate-400",
  due: "text-primary-600",
  upcoming: "text-slate-600",
  wont_send: "text-slate-400",
};

/**
 * Quote page "Follow-up reminders" panel — where this quote is in its
 * automatic reminder sequence (lib/quoteReminderSchedule.ts), plus
 * Pause/Resume. Every reminder actually sent also lands on the Timeline.
 */
export function QuoteRemindersPanel({
  quoteId,
  status,
  sentAt,
  decidedAt,
  expiryAt,
  legs,
  enabled,
  enabledAt,
  customerEmail,
  optedOutAt,
  pausedAt,
  pauseReason,
  hasPayments,
  reminders,
  canManage,
  isMasterAdmin,
}: {
  quoteId: string;
  status: string;
  sentAt: string | null;
  decidedAt: string | null;
  expiryAt: string | null;
  legs: { pickup_date: string | null }[];
  enabled: boolean;
  enabledAt: string | null;
  customerEmail: string | null;
  optedOutAt: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  hasPayments: boolean;
  reminders: QuoteReminderRow[];
  canManage: boolean;
  isMasterAdmin: boolean;
}) {
  const kind = reminderKindForStatus(status);
  const sorted = [...reminders].sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  let notice: string | null = null;
  if (!enabled) notice = "Automatic reminders are switched off for the whole CRM.";
  else if (!kind) notice = sorted.length > 0 ? "Reminders have stopped — this quote is no longer waiting on the customer." : "No reminders apply to a quote in this status.";
  else if (!customerEmail) notice = "No reminders — the customer has no email address on file.";
  else if (optedOutAt) notice = `The customer asked not to receive reminders (${formatDateTime(optedOutAt)}).`;
  else if (kind === "payment" && hasPayments) notice = "No payment reminders — a payment has already been made on this quote.";
  else if (pausedAt) notice = `Paused ${formatDateTime(pausedAt)}${pauseReason ? ` — ${pauseReason}` : ""}.`;

  // The current sequence, step by step. Shown even when paused/opted out so
  // staff can see where it got to.
  const start = kind === "sales" ? sentAt : kind === "payment" ? decidedAt : null;
  const steps: { step: number; label: string; state: StepState; when: string | null; error: string | null }[] = [];
  if (kind && start) {
    const schedule = reminderSchedule(kind, reminderAnchor(start, enabledAt), earliestTravelDate(legs), expiryAt);
    const sentForKind = new Map(reminders.filter((r) => r.kind === kind).map((r) => [r.step, r]));
    const lastSent = Math.max(0, ...sentForKind.keys());
    const now = Date.now();
    for (let step = 1; step <= REMINDER_OFFSETS_HOURS[kind].length; step++) {
      const label = reminderStepLabel(kind, step);
      const row = sentForKind.get(step);
      const scheduled = schedule.find((s) => s.step === step);
      if (row) steps.push({ step, label, state: row.error ? "failed" : "sent", when: row.sent_at, error: row.error });
      else if (!scheduled) steps.push({ step, label, state: "wont_send", when: null, error: null });
      else if (step < lastSent) steps.push({ step, label, state: "skipped", when: null, error: null });
      else steps.push({ step, label, state: scheduled.dueAt.getTime() <= now ? "due" : "upcoming", when: scheduled.dueAt.toISOString(), error: null });
    }
  }

  // Reminders from a sequence that no longer applies (e.g. sales reminders
  // sent before the customer accepted) — still worth seeing here.
  const earlier = sorted.filter((r) => r.kind !== kind);

  const STATE_TEXT: Record<StepState, (when: string | null) => string> = {
    sent: (w) => `Sent ${w ? formatDateTime(w) : ""}`,
    failed: (w) => `Failed ${w ? formatDateTime(w) : ""}`,
    skipped: () => "Skipped",
    due: () => "Due now — goes out within 15 minutes",
    upcoming: (w) => (w ? formatDateTime(w) : ""),
    wont_send: () => "Won't send — too close to the trip or quote expiry",
  };
  const active = enabled && !notice;

  return (
    <Panel>
      <SectionTitle title="Follow-up reminders" sub={kind === "payment" ? "Payment reminders until the customer pays" : "Automatic emails until the customer decides"} />
      {notice && <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{notice}</p>}
      {!enabled && isMasterAdmin && (
        <Link href="/settings/quote-reminders" className="mt-2 inline-block text-sm font-bold text-primary-600">
          Switch on in Settings →
        </Link>
      )}

      {steps.length > 0 && (
        <ol className="mt-4 space-y-2 text-sm">
          {steps.map((s) => (
            <li key={s.step} className="border-b pb-2 last:border-0">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                <span className="font-semibold">{s.label}</span>
                <span className={`text-xs font-bold ${STATE_STYLE[s.state]}`}>{active || s.state === "sent" || s.state === "failed" ? STATE_TEXT[s.state](s.when) : "—"}</span>
              </div>
              {s.error && <p className="mt-0.5 text-xs text-red-600">{s.error}</p>}
            </li>
          ))}
        </ol>
      )}

      {earlier.length > 0 && (
        <div className="mt-4 text-sm">
          <div className="text-xs font-bold uppercase text-slate-400">Earlier reminders</div>
          <ul className="mt-1 space-y-1">
            {earlier.map((r) => (
              <li key={`${r.kind}-${r.step}`} className="flex flex-wrap justify-between gap-x-3">
                <span>{reminderStepLabel(r.kind, r.step)}</span>
                <span className={`text-xs font-bold ${r.error ? "text-red-600" : "text-emerald-700"}`}>
                  {r.error ? "Failed" : "Sent"} {formatDateTime(r.sent_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && enabled && kind && customerEmail && (
        <>
          {optedOutAt ? (
            <QuoteRemindersButton quoteId={quoteId} action="allow" />
          ) : pausedAt ? (
            <QuoteRemindersButton quoteId={quoteId} action="resume" />
          ) : (
            <QuoteRemindersButton quoteId={quoteId} action="pause" />
          )}
        </>
      )}
    </Panel>
  );
}
