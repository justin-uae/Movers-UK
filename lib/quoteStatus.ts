import type { QuoteEventType, QuoteStatus } from "./supabase/database.types";

/**
 * Single source of truth for how a quote's raw status reads to a human —
 * the enum values themselves (e.g. "accepted", "partially_paid") were being
 * rendered as-is with only a CSS capitalize, so "partially_paid" showed
 * with a literal underscore and "accepted" gave no hint that a customer
 * accepting a quote just means it's now waiting to be paid, not that
 * anything is finished. Used everywhere a quote's status is shown to staff.
 */
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent — awaiting response",
  viewed: "Viewed — awaiting response",
  accepted: "Waiting for payment",
  partially_paid: "Partially paid — balance due",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  converted: "Converted",
  paid: "Paid",
};

export const QUOTE_STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-50 text-blue-700",
  viewed: "bg-blue-50 text-blue-700",
  accepted: "bg-amber-50 text-amber-700",
  partially_paid: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  converted: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
};

/** How each quote timeline event reads to staff — quote detail timeline and Email Centre's recent activity. */
export const QUOTE_EVENT_LABEL: Record<QuoteEventType, string> = {
  sent: "Quote sent to customer",
  viewed: "Customer viewed the quote",
  accepted: "Customer accepted the quote",
  rejected: "Customer rejected the quote",
  expired: "Quote expired",
  cancelled: "Quote cancelled",
  partially_paid: "Deposit/partial payment received",
  paid: "Paid in full",
  reassigned: "Reassigned",
  card_payment_requested: "Card payment requested",
  card_payment_approved: "Card payment approved",
  card_payment_rejected: "Card payment request rejected",
  reminder_sent: "Reminder email sent",
  reminders_paused: "Reminders paused",
  reminders_resumed: "Reminders resumed",
  reminders_opted_out: "Customer stopped reminders",
  reminders_opt_out_cleared: "Reminders allowed again for this customer",
  expiry_changed: "Expiry date changed",
  price_changed: "Price changed",
  special_deal: "Today’s Special Deal applied",
  special_deal_auto: "Automatic discount (customer said too expensive)",
};
