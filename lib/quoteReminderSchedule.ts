// Pure schedule math for automated quote reminders — shared by the
// quote-reminders cron (lib/quoteReminders.ts) and the quote detail page's
// Reminders panel, so what the page says "is due next" is exactly what the
// sweep will send. No server-only imports.

import type { EmailTemplateKey } from "./emailTemplateInfo";

export type QuoteReminderKind = "sales" | "payment";

const HOUR = 3600000;

/** Hours after the anchor (quote sent, or accepted for payment reminders) each step is due — before any short-notice compression. */
export const REMINDER_OFFSETS_HOURS: Record<QuoteReminderKind, number[]> = {
  sales: [2, 24, 48, 72, 120],
  payment: [24, 72, 120],
};

export const REMINDER_TEMPLATE_KEYS: Record<QuoteReminderKind, EmailTemplateKey[]> = {
  sales: ["quote_reminder_1", "quote_reminder_2", "quote_reminder_3", "quote_reminder_4", "quote_reminder_5"],
  payment: ["quote_payment_reminder", "quote_payment_reminder", "quote_payment_reminder"],
};

/** No reminder goes out in the last 12 hours before the trip — by then it's a phone call, not an email. */
const TRAVEL_CUTOFF_HOURS = 12;

/** Status -> which sequence applies. Anything else (paid, rejected, cancelled, expired, partially paid…) gets none. */
export function reminderKindForStatus(status: string): QuoteReminderKind | null {
  if (status === "sent" || status === "viewed") return "sales";
  if (status === "accepted") return "payment";
  return null;
}

export function offsetLabel(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function reminderStepLabel(kind: QuoteReminderKind, step: number): string {
  const offsets = REMINDER_OFFSETS_HOURS[kind];
  const prefix = kind === "sales" ? "Reminder" : "Payment reminder";
  return `${prefix} ${step} of ${offsets.length} (${offsetLabel(offsets[step - 1] ?? 0)})`;
}

export interface ScheduledReminder {
  step: number;
  dueAt: Date;
}

/**
 * When each step of the sequence is due. Normally anchor + the step's
 * offset; for a trip coming up soon, every offset is scaled down
 * proportionally so the whole sequence still fits before the trip (minus
 * TRAVEL_CUTOFF_HOURS), rather than the later reminders landing after the
 * customer has already travelled. Steps that would fall after the quote's
 * expiry, or after the cutoff, are dropped.
 */
export function reminderSchedule(
  kind: QuoteReminderKind,
  anchor: Date,
  travelDate: string | null,
  expiryAt: string | null,
): ScheduledReminder[] {
  const offsets = REMINDER_OFFSETS_HOURS[kind];
  const deadline = travelDate ? new Date(`${travelDate}T00:00:00Z`).getTime() - TRAVEL_CUTOFF_HOURS * HOUR : null;
  const expiry = expiryAt ? new Date(expiryAt).getTime() : null;

  let scale = 1;
  if (deadline !== null) {
    const available = deadline - anchor.getTime();
    if (available <= 0) return [];
    const lastOffset = offsets[offsets.length - 1]! * HOUR;
    if (available < lastOffset) scale = available / lastOffset;
  }

  return offsets
    .map((hours, i) => ({ step: i + 1, dueAt: new Date(anchor.getTime() + hours * HOUR * scale) }))
    .filter((r) => (deadline === null || r.dueAt.getTime() < deadline) && (expiry === null || r.dueAt.getTime() < expiry));
}

/** The later of the sequence's natural start and when reminders were switched on — see quote_reminders_enabled_at in 0103_quote_reminders.sql. */
export function reminderAnchor(start: string, enabledAt: string | null): Date {
  const startMs = new Date(start).getTime();
  const enabledMs = enabledAt ? new Date(enabledAt).getTime() : 0;
  return new Date(Math.max(startMs, enabledMs));
}

/** Earliest pickup date across the quote's legs — the trip start the schedule is compressed against. */
export function earliestTravelDate(legs: { pickup_date: string | null }[]): string | null {
  const dates = legs.map((l) => l.pickup_date).filter((d): d is string => !!d).sort();
  return dates[0] ?? null;
}
