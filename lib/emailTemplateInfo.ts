// Pure metadata shared by server code (lib/emailTemplates.ts) and client
// components (EmailTemplatesPage) — deliberately has no "server-only"
// import so it can be pulled into both.

export type EmailTemplateKey =
  | "quote_sent"
  | "quote_accepted"
  | "quote_rejected"
  | "job_offered"
  | "job_accepted_by_supplier"
  | "job_rejected_by_supplier"
  | "supplier_invoice_submitted"
  | "lead_assigned"
  | "feedback_request"
  | "staff_invited"
  | "supplier_invited"
  | "payment_received"
  | "booking_amended"
  | "job_amended"
  | "job_reapproval_required"
  | "job_reapproval_rejected"
  | "card_payment_override_requested"
  | "card_payment_override_decided"
  | "quote_reminder_1"
  | "quote_reminder_2"
  | "quote_reminder_3"
  | "quote_reminder_4"
  | "quote_reminder_5"
  | "quote_payment_reminder"
  | "quote_accepted_customer";

/** Friendly labels + the {{variable}} tokens each template supports — shown as an editing hint in Email Centre -> Templates. */
export const EMAIL_TEMPLATE_INFO: Record<EmailTemplateKey, { label: string; description: string; variables: string[] }> = {
  quote_sent: {
    label: "Quote sent",
    description: "Sent to the customer when a quote is sent.",
    variables: ["customer_name", "quote_number", "brand_name", "currency", "selling_price", "link"],
  },
  quote_accepted: {
    label: "Quote accepted",
    description: "Sent to the assigned salesperson when a customer accepts a quote.",
    variables: ["customer_name", "quote_number", "brand_name", "link"],
  },
  quote_rejected: {
    label: "Quote rejected",
    description: "Sent to the assigned salesperson when a customer rejects a quote.",
    variables: ["customer_name", "quote_number", "brand_name", "reason", "link"],
  },
  job_offered: {
    label: "Job offered to supplier",
    description: "Sent to a supplier when a job is offered to them.",
    variables: ["supplier_name", "brand_name", "region", "pickup_date", "pickup_time", "passenger_count", "link"],
  },
  job_accepted_by_supplier: {
    label: "Job accepted by supplier",
    description: "Sent to the job's creator when a supplier accepts the job.",
    variables: ["supplier_name", "quote_number", "brand_name", "link"],
  },
  job_rejected_by_supplier: {
    label: "Job declined by supplier",
    description: "Sent to the job's creator when a supplier declines the job.",
    variables: ["supplier_name", "quote_number", "brand_name", "link"],
  },
  supplier_invoice_submitted: {
    label: "Supplier invoice submitted",
    description: "Sent to the job's creator when a supplier submits their invoice.",
    variables: ["supplier_name", "quote_number", "brand_name", "currency", "amount", "link"],
  },
  lead_assigned: {
    label: "Lead assigned to you",
    description: "Sent to a staff member when a new lead auto-routes to them.",
    variables: [
      "staff_name",
      "brand_name",
      "source",
      "pickup",
      "destination",
      "travel_date",
      "passenger_count",
      "vehicle_requested",
      "notes",
      "link",
    ],
  },
  feedback_request: {
    label: "Feedback request",
    description: "Sent to the customer when their job is marked completed.",
    variables: ["customer_name", "brand_name", "link"],
  },
  staff_invited: {
    label: "Staff invite",
    description: "Sent to a new staff user when they're invited, and again each time an admin resends the invite.",
    variables: ["user_name", "brand_name", "link"],
  },
  supplier_invited: {
    label: "Supplier invite",
    description: "Sent to a new supplier when they're invited, and again each time an admin resends the invite.",
    variables: ["supplier_name", "brand_name", "link"],
  },
  payment_received: {
    label: "Payment received",
    description: "Sent to the customer once a payment is verified/counted (immediately for card payments, after Finance verifies a bank transfer).",
    variables: ["customer_name", "quote_number", "brand_name", "currency", "amount", "balance", "link"],
  },
  booking_amended: {
    label: "Booking updated",
    description: "Sent to the customer when staff edit an already-accepted/paid booking's journey details or price.",
    variables: ["customer_name", "quote_number", "brand_name", "reason", "changes_summary", "currency", "adjustment_amount", "new_balance", "link"],
  },
  job_amended: {
    label: "Job updated",
    description: "Sent to the supplier when staff edit a job's journey details or their payout.",
    variables: ["supplier_name", "quote_number", "brand_name", "reason", "changes_summary", "payout_note", "link"],
  },
  job_reapproval_required: {
    label: "Job needs re-approval",
    description: "Sent to the supplier instead of \"Job updated\" when the edit is to a job they've already accepted or confirmed — they must approve or reject it again.",
    variables: ["supplier_name", "quote_number", "brand_name", "reason", "changes_summary", "payout_note", "link"],
  },
  job_reapproval_rejected: {
    label: "Job re-approval rejected",
    description: "Sent to the booking's owner when a supplier rejects an edited job — it's open for dispatch to a new supplier.",
    variables: ["supplier_name", "quote_number", "brand_name", "link"],
  },
  card_payment_override_requested: {
    label: "Card payment approval needed",
    description: "Sent to every Master Admin when staff request card payment on a quote that's normally bank-transfer-only at its amount.",
    variables: ["admin_name", "quote_number", "requested_by", "amount", "reason", "link"],
  },
  card_payment_override_decided: {
    label: "Card payment request decided",
    description: "Sent to the staff member who requested it, once a Master Admin approves or rejects their card-payment request.",
    variables: ["requested_by", "quote_number", "decision", "decided_by", "decision_note", "link"],
  },
  quote_reminder_1: {
    label: "Quote reminder 1 (2 hours)",
    description: "Automatic follow-up to the customer 2 hours after a quote is sent and not yet accepted — friendly reminder and easy booking. Shortened for trips coming up soon. Settings -> Quote Reminders.",
    variables: ["customer_name", "quote_number", "brand_name", "travel_date", "vehicle", "pickup", "destination", "currency", "selling_price", "link", "stop_link"],
  },
  quote_reminder_2: {
    label: "Quote reminder 2 (24 hours)",
    description: "Automatic follow-up to the customer 24 hours after a quote is sent and not yet accepted — explains the benefits of booking and encourages a decision. Shortened for trips coming up soon. Settings -> Quote Reminders.",
    variables: ["customer_name", "quote_number", "brand_name", "travel_date", "vehicle", "pickup", "destination", "currency", "selling_price", "link", "stop_link"],
  },
  quote_reminder_3: {
    label: "Quote reminder 3 (48 hours)",
    description: "Automatic follow-up to the customer 48 hours after a quote is sent and not yet accepted — offers to review the price. Shortened for trips coming up soon. Settings -> Quote Reminders.",
    variables: ["customer_name", "quote_number", "brand_name", "travel_date", "vehicle", "pickup", "destination", "currency", "selling_price", "link", "stop_link"],
  },
  quote_reminder_4: {
    label: "Quote reminder 4 (72 hours)",
    description: "Automatic follow-up to the customer 72 hours after a quote is sent and not yet accepted — asks the customer to reply 1-4 with their decision. Shortened for trips coming up soon. Settings -> Quote Reminders.",
    variables: ["customer_name", "quote_number", "brand_name", "travel_date", "vehicle", "pickup", "destination", "currency", "selling_price", "link", "stop_link"],
  },
  quote_reminder_5: {
    label: "Quote reminder 5 (5 days)",
    description: "Automatic follow-up to the customer 5 days after a quote is sent and not yet accepted — final follow-up asking for a decision. Shortened for trips coming up soon. Settings -> Quote Reminders.",
    variables: ["customer_name", "quote_number", "brand_name", "travel_date", "vehicle", "pickup", "destination", "currency", "selling_price", "link", "stop_link"],
  },
  quote_payment_reminder: {
    label: "Payment reminder",
    description: "Automatic reminder (1, 3 and 5 days after acceptance) to a customer who accepted a quote but hasn't paid yet, with their secure payment link. Settings -> Quote Reminders.",
    variables: ["customer_name", "quote_number", "brand_name", "travel_date", "currency", "amount_due", "link", "stop_link"],
  },
  quote_accepted_customer: {
    label: "Booking confirmed (to customer)",
    description: "Sent to the customer the moment they accept a quote, with the quote PDF attached (price, bank details and payment reference for bank transfers) and a link to complete payment.",
    variables: ["customer_name", "quote_number", "brand_name", "currency", "selling_price", "link"],
  },
};
