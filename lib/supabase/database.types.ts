// Hand-written types for the Phase 1 (Foundation) schema. Once the schema is
// live in a real Supabase project, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
// and this file becomes redundant.

export type ProfileStatus = "invited" | "active" | "suspended" | "disabled" | "archived";
export type TerritoryType = "country" | "region" | "city" | "postcode" | "airport" | "custom";
export type PermissionOverrideEffect = "grant" | "revoke";
export type LoginEvent = "login_success" | "login_failed" | "logout" | "forced_logout" | "session_expired";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  /** Tenant-wide Terms & Conditions boilerplate — the fallback quotes fall back to (both the PDF and the public quote page) when a quote has no per-quote terms_snapshot override. Admin-editable from Settings → Bank Details & Terms. */
  terms_and_conditions: string | null;
  /** Master-Admin-only switch (Settings → AI Auto-Quote) — when true, the ai-auto-quote cron sweep is allowed to release stale leads and have OpenAI price/send a quote for them. */
  ai_auto_quote_enabled: boolean;
  /** Business hours (Mon–Sat, see lib/businessHours.ts) a lead can sit unquoted before the sweep takes over. Default 24. */
  ai_auto_quote_sla_hours: number;
  /** When the switch last flipped off -> on — the sweep floors a lead's SLA countdown here so turning it on doesn't treat the whole existing backlog as instantly overdue. Null until first enabled. */
  ai_auto_quote_enabled_at: string | null;
  /** Master-Admin-only switch (Settings → AI Assistant) — when true, a lead captured over WhatsApp is priced and quoted by AI immediately at creation (email + WhatsApp), instead of waiting for the SLA sweep above. See 0094_whatsapp_auto_quote.sql. */
  whatsapp_auto_quote_enabled: boolean;
  /** Same as whatsapp_auto_quote_enabled, for new website / email / manually-added leads — see 0106_instant_auto_quote_sources.sql and instantAutoQuoteNewLead in lib/aiAutoQuote.ts. */
  website_auto_quote_enabled: boolean;
  email_auto_quote_enabled: boolean;
  manual_auto_quote_enabled: boolean;
  /** Every quote AI prices and sends on its own (createAndSendQuote, any trigger) has its selling price increased by this percentage before it's saved/sent — Master-Admin-only (Settings → AI Assistant). Default 0 (no change). See 0101_ai_auto_quote_markup.sql. */
  ai_auto_quote_markup_percent: number;
  /** ISO currency every AI-priced quote is created in (Settings -> AI Assistant). Default USD — 0109_ai_quote_currency.sql. */
  ai_quote_currency: string;
  /** Master-Admin-only switch (Settings -> Quote Reminders) — when true, the quote-reminders cron emails customers follow-up reminders on unaccepted quotes and payment reminders on accepted-but-unpaid ones. See 0103_quote_reminders.sql and lib/quoteReminders.ts. */
  quote_reminders_enabled: boolean;
  /** When the switch last flipped off -> on — each quote's reminder schedule counts from whichever is later, this or when the quote was sent, so turning it on never fires a burst at every open quote. */
  quote_reminders_enabled_at: string | null;
  /** Default number of days a new quote stays valid (New Quote form default, and every AI-sent quote) — Settings -> Bank Details & Terms. Default 30. See 0104_quote_validity_days.sql. */
  quote_validity_days: number;
  /** Every lead the email-lead-intake sweep creates lands on this brand — set once (backfilled to the tenant's first brand, see 0088_email_lead_intake.sql) since 300+ forwarded sites can't be reliably attributed from email content alone. Null disables the sweep for this tenant entirely. */
  default_lead_inbox_brand_id: string | null;
  /** Master-Admin-only per-feature AI provider/model picks (Settings -> AI Models, see 0098_ai_model_settings.sql and lib/aiProviders.ts) — keyed by AiFeatureKey ("whatsapp_intake" | "pricing_engine" | "email_intake" | "complex_booking"), each value an {provider, model}. A missing key falls back to OpenAI/gpt-5.5 in code. */
  ai_model_settings: Record<string, { provider: string; model: string }>;
  /** Settings -> WhatsApp Takeover (Master Admin): during these hours/days, in this timezone, new WhatsApp messages on unowned chats pop up for sales users to take over. See 0113_whatsapp_sales_takeover.sql. */
  whatsapp_takeover_enabled: boolean;
  /** "HH:MM[:SS]" local time in whatsapp_takeover_timezone; end before start means an overnight window. */
  whatsapp_takeover_start: string;
  whatsapp_takeover_end: string;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  whatsapp_takeover_days: number[];
  whatsapp_takeover_timezone: string;
  /** Special Deals (0114_special_deals.sql) — automatic discount when a customer rejects a quote as "Too expensive". */
  special_deal_auto_enabled: boolean;
  special_deal_auto_percent: number;
  /** IMAP polling cursor for the shared lead-intake inbox — everything before this timestamp has already been swept. */
  email_lead_inbox_synced_since: string;
  created_at: string;
}

export interface EmailLeadIntakeLog {
  id: string;
  tenant_id: string;
  message_id: string;
  from_address: string | null;
  subject: string | null;
  decision: "lead_created" | "discarded_not_travel" | "discarded_no_contact" | "error";
  lead_id: string | null;
  detail: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  tenant_id: string;
  legal_name: string;
  trading_name: string | null;
  registration_number: string | null;
  vat_number: string | null;
  registered_address: string | null;
  trading_address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  default_currency: string;
  created_at: string;
}

export interface Brand {
  id: string;
  tenant_id: string;
  company_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  default_currency: string;
  default_language: string;
  quote_number_prefix: string;
  booking_number_prefix: string;
  invoice_number_prefix: string;
  is_active: boolean;
  webhook_secret: string;
  created_at: string;
}

export interface Office {
  id: string;
  tenant_id: string;
  company_id: string;
  brand_id: string | null;
  name: string;
  country: string | null;
  city: string | null;
  address: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

export interface Team {
  id: string;
  tenant_id: string;
  department_id: string | null;
  office_id: string | null;
  name: string;
  manager_id: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Permission {
  id: string;
  key: string;
  category: string;
  description: string | null;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}

export interface UserPermissionOverride {
  id: string;
  tenant_id: string;
  user_id: string;
  permission_id: string;
  effect: PermissionOverrideEffect;
  created_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp_number: string | null;
  signature_switchboard: string | null;
  signature_emergency_email: string | null;
  signature_website: string | null;
  signature_logo_url: string | null;
  job_title: string | null;
  department_id: string | null;
  team_id: string | null;
  office_id: string | null;
  manager_id: string | null;
  role_id: string | null;
  default_company_id: string | null;
  default_brand_id: string | null;
  status: ProfileStatus;
  is_master_admin: boolean;
  requires_password_reset: boolean;
  requires_2fa: boolean;
  access_expires_at: string | null;
  avatar_url: string | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface UserBrand {
  user_id: string;
  brand_id: string;
}

/** A user can cover several regions — matched against lead pickup/destination text for routing. lat/lng are set when the region was added via the map picker; null for older rows added as plain text. */
export interface UserRegion {
  id: string;
  user_id: string;
  region: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface Territory {
  id: string;
  tenant_id: string;
  type: TerritoryType;
  value: string;
  label: string;
  created_at: string;
}

export interface UserTerritory {
  user_id: string;
  territory_id: string;
}

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface LoginHistoryEntry {
  id: string;
  tenant_id: string;
  user_id: string;
  event: LoginEvent;
  ip_address: string | null;
  user_agent: string | null;
  device: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Phase 2 — Sales CRM (0002_sales_crm.sql)
// -----------------------------------------------------------------------------

export type LeadSource =
  | "website"
  | "website_contact"
  | "email"
  | "whatsapp"
  | "phone"
  | "live_chat"
  | "manual"
  | "social"
  | "partner"
  | "affiliate"
  | "api"
  | "ad_form";

export type LeadStatus =
  | "new"
  | "assigned"
  | "open_pool"
  | "contacted"
  | "converted"
  | "closed"
  | "spam"
  | "duplicate"
  | "expired";

export type LeadPriority = "high" | "normal";

export type EnquiryStatus =
  | "new"
  | "contacted"
  | "quoting"
  | "awaiting_customer"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "converted_to_booking"
  | "completed";

export type JourneyType = "one_way" | "return" | "disposal" | "multi_day";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "partially_paid"
  | "rejected"
  | "expired"
  | "cancelled"
  | "converted"
  | "paid";

export type QuoteDecisionType = "accepted" | "rejected";

export type CustomerPaymentMethod = "stripe" | "bank_transfer";

export type QuoteEventType =
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | "partially_paid"
  | "paid"
  | "reassigned"
  | "card_payment_requested"
  | "card_payment_approved"
  | "card_payment_rejected"
  | "reminder_sent"
  | "reminders_paused"
  | "reminders_resumed"
  | "reminders_opted_out"
  | "reminders_opt_out_cleared"
  | "expiry_changed"
  | "price_changed"
  | "special_deal"
  | "special_deal_auto";

export interface Customer {
  id: string;
  tenant_id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  billing_address: string | null;
  country: string | null;
  vat_number: string | null;
  preferred_language: string;
  account_manager_id: string | null;
  default_brand_id: string | null;
  notes: string | null;
  /** Customer used "Stop reminders" in a reminder email (or staff marked it) — no more automatic quote reminders for any of their quotes. */
  reminders_opted_out_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleType {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  seat_capacity: number;
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  source: LeadSource;
  status: LeadStatus;
  customer_id: string | null;
  assigned_user_id: string | null;
  territory_id: string | null;
  claimed_at: string | null;
  priority: LeadPriority;
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  pickup_time: string | null;
  return_trip: boolean;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  is_complex_booking: boolean;
  vehicle_requested: string | null;
  notes: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Every past edit to a lead's journey/intake details, with who made it and why — see 0076_lead_edits.sql. */
export interface LeadEdit {
  id: string;
  tenant_id: string;
  lead_id: string;
  edited_by: string | null;
  reason: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}

export interface Enquiry {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  lead_id: string | null;
  customer_id: string;
  assigned_user_id: string | null;
  status: EnquiryStatus;
  quote_deadline: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  created_by: string | null;
  is_complex_booking: boolean;
  /** True when the ai-auto-quote sweep created this enquiry itself (no staff ever clicked "Create Quote") rather than a human via createEnquiryFromLeadAction. */
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnquiryLeg {
  id: string;
  enquiry_id: string;
  sequence: number;
  journey_type: JourneyType;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  via_points: string[];
  pickup_date: string | null;
  pickup_time: string | null;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  vehicle_type_id: string | null;
  vehicle_description: string | null;
  wheelchair_required: boolean;
  child_seats: number;
  special_requirements: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  tenant_id: string;
  brand_id: string;
  enquiry_id: string;
  customer_id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  expiry_at: string | null;
  public_token: string;
  current_version_id: string | null;
  created_by: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  decided_at: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  payment_proof_storage_path: string | null;
  payment_proof_file_name: string | null;
  payment_method_chosen: CustomerPaymentMethod | null;
  /** Why and by whom this booking was cancelled — set by cancelBookingAction, see 0077_quote_cancellation_history.sql. */
  cancellation_reason: string | null;
  cancelled_by: string | null;
  /** True when AI priced and sent this quote itself via the ai-auto-quote sweep (see lib/aiAutoQuote.ts), rather than a human via quotes/new/actions.ts. created_by stays null on these. */
  ai_generated: boolean;
  /** Which AI provider/model actually priced this quote (Settings -> AI Models -> Pricing Engine at the moment it was created) — see 0099_quote_ai_model.sql. Null for non-AI quotes and for anything created before this column existed. Set once, never updated — the tenant's live setting can change later without rewriting history. */
  ai_model: { provider: string; model: string } | null;
  /** An on-demand OpenAI price benchmark for this quote's journey (Master Admin only, see lib/aiPriceEstimate.ts) — an internal pricing sanity check, cached here so re-viewing it doesn't re-call OpenAI. Unrelated to ai_generated: any quote, human or AI-priced, can have one computed. */
  ai_estimated_price: number | null;
  ai_estimated_price_currency: string | null;
  ai_estimated_price_computed_at: string | null;
  /** Follow-up reminders paused for this quote — automatically when the customer replies by email, or by staff from the quote page. See 0103_quote_reminders.sql. */
  reminders_paused_at: string | null;
  reminders_pause_reason: string | null;
  /** Last "Resume" — customer replies before this don't re-pause it. */
  reminders_resumed_at: string | null;
  /** When the scheduled automatic "Too expensive" discount goes out — null when none is pending. See 0115_special_deal_delay.sql. */
  special_deal_auto_due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteVersion {
  id: string;
  quote_id: string;
  version_number: number;
  vehicle_type_id: string | null;
  vehicle_description: string | null;
  supplier_estimated_cost: number | null;
  /** The total the customer pays, INCLUDING VAT when vat_rate > 0. */
  selling_price: number;
  /** Special Deal (0114_special_deals.sql) — the struck-through pre-deal price, total % off, and where it came from. */
  original_price: number | null;
  discount_percent: number | null;
  discount_source: "special_deal" | "too_expensive_auto" | null;
  /** VAT % applied on top of the pre-VAT price (0 = none). Net/VAT split is derived — lib/vat.ts, 0105_quote_vat.sql. */
  vat_rate: number;
  currency: string;
  deposit_percentage: 25 | 50 | 75 | null;
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface CustomerPayment {
  id: string;
  tenant_id: string;
  quote_id: string;
  amount: number;
  currency: string;
  method: CustomerPaymentMethod;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  proof_storage_path: string | null;
  proof_file_name: string | null;
  recorded_by: string | null;
  paid_at: string;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  tenant_id: string;
  key: string;
  subject: string;
  body_html: string;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Per-user IMAP/SMTP mailboxes + synced mail (0022_email_accounts.sql)
// -----------------------------------------------------------------------------

export type EmailSecurity = "ssl" | "starttls" | "none";
export type EmailMessageDirection = "inbound" | "outbound";
export type EmailFolder = "inbox" | "sent" | "archived";

export interface EmailAccount {
  id: string;
  tenant_id: string;
  user_id: string;
  display_name: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_security: EmailSecurity;
  imap_username: string;
  imap_password_enc: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: EmailSecurity;
  smtp_username: string;
  smtp_password_enc: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAttachmentMeta {
  filename: string;
  size: number | null;
  contentType: string | null;
  /** Path in the email-attachments storage bucket, or null for a message
      synced before EML-01/EML-03 (metadata-only, no binary was kept). */
  storagePath: string | null;
}

export interface EmailMessage {
  id: string;
  tenant_id: string;
  email_account_id: string;
  direction: EmailMessageDirection;
  folder: EmailFolder;
  message_uid: string;
  message_id: string | null;
  in_reply_to: string | null;
  thread_key: string | null;
  from_name: string | null;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  has_attachments: boolean;
  attachment_meta: EmailAttachmentMeta[];
  is_read: boolean;
  occurred_at: string;
  created_at: string;
  customer_id: string | null;
  supplier_id: string | null;
  quote_id: string | null;
  /** Starred in Email Centre — see 0112_email_star_archive.sql. */
  is_starred: boolean;
  /** Archived in Email Centre (folder is left as-is so the IMAP sync doesn't re-insert it) — see 0112_email_star_archive.sql. */
  archived_at: string | null;
}

export type WhatsAppMessageDirection = "inbound" | "outbound";

export interface WhatsAppMessage {
  id: string;
  tenant_id: string;
  brand_id: string;
  customer_id: string | null;
  wa_id: string;
  direction: WhatsAppMessageDirection;
  message_type: string;
  body: string;
  sent_by: string | null;
  created_at: string;
}

/** One WhatsApp contact's chat — who owns it and whether the AI is paused. See 0113_whatsapp_sales_takeover.sql. */
export interface WhatsAppConversation {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  customer_id: string | null;
  wa_id: string;
  contact_name: string | null;
  owner_id: string | null;
  /** How the owner got it: a popup takeover, auto-assigned because they quoted this number, or set by Master Admin. */
  owner_source: "takeover" | "quoted" | "admin" | null;
  owned_at: string | null;
  /** True while a human has the chat — the 360dialog webhook doesn't run the AI. */
  ai_paused: boolean;
  last_inbound_at: string | null;
  last_inbound_preview: string | null;
  /** Latest message either way — kept current by a trigger on whatsapp_messages. */
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: WhatsAppMessageDirection | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteDecision {
  id: string;
  quote_id: string;
  decision: QuoteDecisionType;
  reason: string | null;
  free_text: string | null;
  decided_at: string;
  ip_address: string | null;
}

export interface QuoteEvent {
  id: string;
  quote_id: string;
  event: QuoteEventType;
  detail: string | null;
  created_at: string;
}

/** One automatic follow-up email the quote-reminders cron attempted — kind "sales" (steps 1-5, quote not yet accepted) or "payment" (steps 1-3, accepted but unpaid). error is set when the send failed. See 0103_quote_reminders.sql. */
export interface QuoteReminder {
  id: string;
  tenant_id: string;
  quote_id: string;
  kind: "sales" | "payment";
  step: number;
  sent_at: string;
  error: string | null;
}

/** Settings -> Card Payment Requests — staff asking Master Admin to allow Stripe on a specific quote that's normally bank-transfer-only above STRIPE_PRICE_THRESHOLD (lib/quoteMoney.ts). See 0102_card_payment_override_requests.sql. */
export interface CardPaymentOverrideRequest {
  id: string;
  tenant_id: string;
  quote_id: string;
  requested_by: string | null;
  reason: string | null;
  amount_gbp: number;
  status: "pending" | "approved" | "rejected";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface NumberSequence {
  tenant_id: string;
  doc_type: string;
  next_value: number;
}

// -----------------------------------------------------------------------------
// Phase 2.5 — Payments/invoice, suppliers, job dispatch (0003_operations.sql)
// -----------------------------------------------------------------------------

export type SupplierType = "company" | "individual";
export type SupplierStatus = "invited" | "submitted" | "approved" | "rejected" | "suspended";
export type JobStatus =
  | "unassigned"
  | "offered"
  | "accepted_by_supplier"
  | "rejected_by_supplier"
  | "pending_reapproval"
  | "confirmed"
  | "completed"
  | "cancelled";

export interface BankAccount {
  id: string;
  tenant_id: string;
  /** Nullable since 0055_bank_details_and_terms.sql — bank details are tenant-wide payment profiles now, not tied to a specific brand. */
  brand_id: string | null;
  /** e.g. "UK Local Payments", "International GBP Payments" — distinguishes the tenant's several simultaneous payment profiles. */
  profile_label: string | null;
  account_name: string;
  bank_name: string;
  account_number: string | null;
  iban: string | null;
  sort_code: string | null;
  swift_bic: string | null;
  /** Remittance address to quote if a sender's bank asks for one (e.g. Wise's own address) — free text, not this company's registered address. */
  bank_address: string | null;
  /** Free text shown alongside this profile, e.g. expected transfer timing ("SWIFT payments take 4-5 working days"). */
  payment_notes: string | null;
  currency: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  type: SupplierType;
  contact_name: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  region: string | null;
  status: SupplierStatus;
  registration_number: string | null;
  vat_number: string | null;
  insurance_details: string | null;
  license_number: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  suspension_reason: string | null;
  suspended_by: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Every past edit to a supplier's business details, with who made it and why — see 0081_supplier_edits.sql. */
export interface SupplierEdit {
  id: string;
  tenant_id: string;
  supplier_id: string;
  edited_by: string | null;
  reason: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}

export interface SupplierVehicle {
  id: string;
  supplier_id: string;
  vehicle_type: string;
  seat_capacity: number | null;
  plate_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface SupplierDocument {
  id: string;
  supplier_id: string;
  label: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
}

export type SupplierPaymentStatus = "unpaid" | "partially_paid" | "paid";

export interface Job {
  id: string;
  tenant_id: string;
  quote_id: string;
  brand_id: string | null;
  customer_id: string | null;
  region: string | null;
  status: JobStatus;
  created_by: string | null;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  tenant_id: string;
  job_id: string;
  job_allocation_id: string;
  amount: number;
  currency: string;
  bank_reference: string | null;
  notes: string | null;
  paid_by: string | null;
  paid_at: string;
  proof_storage_path: string | null;
  proof_file_name: string | null;
  created_at: string;
}

/** Why a supplier turned a job down — a fresh offer they never accepted, or an already-accepted job pulled back for re-approval after an edit (see 0074_job_rejection_log.sql). */
export interface JobRejectionLog {
  id: string;
  tenant_id: string;
  job_id: string;
  job_allocation_id: string;
  supplier_id: string | null;
  context: "initial_offer" | "post_edit_reapproval";
  reason: string;
  rejected_at: string;
}

/** Money actually received back from a supplier — the reverse of SupplierPayment, kept as its own table rather than a negative payment since it's a genuinely different event (see 0073_supplier_refunds.sql). */
export interface SupplierRefund {
  id: string;
  tenant_id: string;
  job_allocation_id: string;
  amount: number;
  currency: string;
  bank_reference: string | null;
  notes: string | null;
  proof_storage_path: string | null;
  proof_file_name: string | null;
  received_by: string | null;
  received_at: string;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Supplier invoice upload (0008_supplier_invoice_upload.sql) — a supplier
// uploads their own invoice once an allocation is confirmed/completed; a
// staff member with dispatch.transfer_supplier_invoice forwards it to
// accounting.
// -----------------------------------------------------------------------------

export type SupplierInvoiceStatus = "submitted" | "forwarded_to_accounting";

export interface JobSupplierInvoice {
  id: string;
  tenant_id: string;
  job_id: string;
  job_allocation_id: string;
  supplier_id: string;
  amount: number;
  currency: string;
  notes: string | null;
  storage_path: string;
  file_name: string;
  status: SupplierInvoiceStatus;
  forwarded_by: string | null;
  forwarded_at: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Multi-supplier / multi-vehicle dispatch (0054_job_allocations.sql, BKG-02)
// — a job (the stable 1:1-with-quote booking container) can be split into
// several job_allocations, each covering a subset of the booking's
// enquiry_legs (via job_allocation_legs) and carrying its own supplier,
// vehicle note, agreed cost, and accept/confirm/complete lifecycle.
// job_allocation_offers replaces the old job_offers broadcast mechanism at
// allocation granularity. JobOfferStatus is reused unchanged (same enum).
// -----------------------------------------------------------------------------

export type JobOfferStatus = "sent" | "accepted" | "rejected" | "withdrawn";

export interface JobAllocation {
  id: string;
  tenant_id: string;
  job_id: string;
  status: JobStatus;
  assigned_supplier_id: string | null;
  vehicle_notes: string | null;
  agreed_cost: number | null;
  currency: string | null;
  offered_at: string | null;
  responded_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  supplier_payment_status: SupplierPaymentStatus;
  manual_invoice_note: string | null;
  manual_invoice_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JobAllocationLeg {
  id: string;
  job_allocation_id: string;
  enquiry_leg_id: string;
}

export interface JobAllocationOffer {
  id: string;
  tenant_id: string;
  job_allocation_id: string;
  supplier_id: string;
  status: JobOfferStatus;
  offered_at: string;
  responded_at: string | null;
}

/** Supplier-safe read of one allocation's legs — only the legs actually in that allocation, never the whole booking's itinerary. */
export interface JobAllocationOfferLeg {
  sequence: number;
  journey_type: JourneyType;
  pickup_address: string;
  destination_address: string;
  via_points: string[];
  pickup_date: string | null;
  pickup_time: string | null;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  wheelchair_required: boolean;
  child_seats: number;
  special_requirements: string | null;
  vehicle_types: { name: string } | null;
}

export interface JobAllocationOfferView {
  offer_id: string;
  job_allocation_id: string;
  offer_status: JobOfferStatus;
  allocation_status: JobStatus;
  region: string | null;
  vehicle_notes: string | null;
  agreed_cost: number | null;
  currency: string | null;
  supplier_payment_status: SupplierPaymentStatus;
  manual_invoice_note: string | null;
  manual_invoice_url: string | null;
  offered_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  passenger_count: number | null;
  vehicle_type_id: string | null;
  quote_currency: string;
  pickup_address: string | null;
  destination_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  legs: JobAllocationOfferLeg[] | null;
}

// -----------------------------------------------------------------------------
// Commissions (0023_commissions.sql) — one row per completed job, created by
// the completion hook in app/supplier/dashboard/actions.ts, then moved
// through approval/payment/reversal by Finance. commission_plans holds the
// percentage-of-gross-profit rate: one tenant-default row (profile_id null)
// plus optional per-user overrides.
// -----------------------------------------------------------------------------

export interface CommissionPlan {
  id: string;
  tenant_id: string;
  profile_id: string | null;
  rate_percent: number;
  updated_at: string;
}

export type CommissionStatus = "pending_approval" | "approved" | "paid" | "reversed";

export interface Commission {
  id: string;
  tenant_id: string;
  job_id: string;
  quote_id: string;
  profile_id: string | null;
  selling_price: number;
  supplier_cost: number;
  gross_profit: number;
  rate_percent: number;
  amount: number;
  currency: string;
  status: CommissionStatus;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payroll_reference: string | null;
  reversed_by: string | null;
  reversed_at: string | null;
  reversed_reason: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Attendance (0024_attendance.sql) — append-only clock event log; current
// status/shift duration are always derived from this (see lib/attendance.ts),
// never stored as a mutable column.
// -----------------------------------------------------------------------------

export type AttendanceEventType = "clock_in" | "break_start" | "break_end" | "clock_out";

export interface AttendanceEvent {
  id: string;
  tenant_id: string;
  user_id: string;
  event: AttendanceEventType;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Documents (0025_documents.sql) — general document library, optionally
// linked to one customer/supplier/quote record.
// -----------------------------------------------------------------------------

export type DocumentType =
  | "contract"
  | "nda"
  | "customer_agreement"
  | "supplier_licence"
  | "insurance"
  | "driver_licence"
  | "vehicle_registration"
  | "invoice"
  | "receipt"
  | "credit_note"
  | "itinerary"
  | "passenger_list"
  | "quote"
  | "other";

export interface CrmDocument {
  id: string;
  tenant_id: string;
  doc_type: DocumentType;
  label: string;
  notes: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  customer_id: string | null;
  supplier_id: string | null;
  quote_id: string | null;
  lead_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Tasks (0026_tasks.sql) — tenant-wide task tracker with a single assignee,
// an inline checklist, and an optional link to one customer/supplier/quote.
// -----------------------------------------------------------------------------

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CrmTask {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  created_by: string | null;
  checklist: TaskChecklistItem[];
  customer_id: string | null;
  supplier_id: string | null;
  quote_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Tag set only by the /api/cron/task-automation sweep (e.g.
      "quote_followup") so it can dedup against its own prior runs — null on
      every manually created task. */
  source: string | null;
}

// -----------------------------------------------------------------------------
// Service ops (0050_service_ops.sql) — booking cancellation refunds,
// complaints, incidents. Status columns are plain text + check constraints
// (matching commissions' convention), not Postgres enum types.
// -----------------------------------------------------------------------------

export type RefundStatus = "pending" | "processed";

export interface Refund {
  id: string;
  tenant_id: string;
  quote_id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: RefundStatus;
  requested_by: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
}

export type ComplaintCategory = "service_quality" | "driver_behavior" | "vehicle_condition" | "billing" | "communication" | "other";
export type ServiceOpsStatus = "open" | "investigating" | "resolved" | "closed";
export type ServiceOpsSeverity = "low" | "medium" | "high" | "critical";

export interface Complaint {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  quote_id: string | null;
  feedback_id: string | null;
  category: ComplaintCategory;
  severity: ServiceOpsSeverity;
  description: string;
  status: ServiceOpsStatus;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type IncidentCategory = "accident" | "breakdown" | "delay" | "safety" | "other";

export interface Incident {
  id: string;
  tenant_id: string;
  job_id: string | null;
  quote_id: string | null;
  supplier_id: string | null;
  category: IncidentCategory;
  severity: ServiceOpsSeverity;
  description: string;
  status: ServiceOpsStatus;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// KPIs & Targets (0027_kpi_targets.sql) — individual, monthly, manager-
// assigned targets. Actuals are always derived live from quotes/payments
// (see lib/kpiSummary.ts), never stored here.
// -----------------------------------------------------------------------------

export type TargetMetric = "revenue_gbp" | "gross_profit_gbp" | "quotes_sent" | "paid_bookings";

export interface Target {
  id: string;
  tenant_id: string;
  profile_id: string;
  metric: TargetMetric;
  period_month: string;
  target_value: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Team Chat (0028_team_chat.sql) — public tenant-wide channels + direct
// messages (a DM is just a private 2-person chat_channels row).
// -----------------------------------------------------------------------------

export type ChatChannelType = "channel" | "dm";

export interface ChatChannel {
  id: string;
  tenant_id: string;
  type: ChatChannelType;
  name: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ChatChannelMember {
  id: string;
  channel_id: string;
  profile_id: string;
  last_read_at: string;
  joined_at: string;
}

export interface ChatMessage {
  id: string;
  tenant_id: string;
  channel_id: string;
  sender_id: string | null;
  body: string;
  attachment_storage_path: string | null;
  attachment_file_name: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  quote_id: string | null;
  task_id: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Customer Experience (0030_customer_feedback.sql) — one NPS-style request
// per completed job, submitted via a public no-login link. A detractor
// score auto-creates a follow-up Task (see lib/customerFeedback.ts).
// -----------------------------------------------------------------------------

export type FeedbackCategory = "promoter" | "passive" | "detractor";

export interface CustomerFeedback {
  id: string;
  tenant_id: string;
  job_id: string;
  quote_id: string;
  customer_id: string | null;
  public_token: string;
  requested_at: string;
  submitted_at: string | null;
  score: number | null;
  category: FeedbackCategory | null;
  comment: string | null;
  follow_up_task_id: string | null;
  created_at: string;
}

// Minimal shape of a table entry as @supabase/postgrest-js's generics expect
// it (Row/Insert/Update plus an empty Relationships tuple — we don't encode
// foreign-key relationship metadata by hand, so embedded-resource selects
// like `.select("brands(*)")` are typed as `any` rather than fully checked).
type Table<TRow> = { Row: TRow; Insert: Partial<TRow>; Update: Partial<TRow>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      tenants: Table<Tenant>;
      companies: Table<Company>;
      brands: Table<Brand>;
      offices: Table<Office>;
      departments: Table<Department>;
      teams: Table<Team>;
      roles: Table<Role>;
      permissions: Table<Permission>;
      role_permissions: Table<RolePermission>;
      user_permission_overrides: Table<UserPermissionOverride>;
      profiles: Table<Profile>;
      user_brands: Table<UserBrand>;
      user_regions: Table<UserRegion>;
      territories: Table<Territory>;
      user_territories: Table<UserTerritory>;
      audit_log: Table<AuditLogEntry>;
      login_history: Table<LoginHistoryEntry>;
      customers: Table<Customer>;
      vehicle_types: Table<VehicleType>;
      leads: Table<Lead>;
      lead_edits: Table<LeadEdit>;
      enquiries: Table<Enquiry>;
      enquiry_legs: Table<EnquiryLeg>;
      quotes: Table<Quote>;
      quote_versions: Table<QuoteVersion>;
      quote_decisions: Table<QuoteDecision>;
      quote_events: Table<QuoteEvent>;
      quote_reminders: Table<QuoteReminder>;
      card_payment_override_requests: Table<CardPaymentOverrideRequest>;
      number_sequences: Table<NumberSequence>;
      bank_accounts: Table<BankAccount>;
      suppliers: Table<Supplier>;
      supplier_edits: Table<SupplierEdit>;
      supplier_vehicles: Table<SupplierVehicle>;
      supplier_documents: Table<SupplierDocument>;
      jobs: Table<Job>;
      job_allocations: Table<JobAllocation>;
      job_allocation_legs: Table<JobAllocationLeg>;
      job_allocation_offers: Table<JobAllocationOffer>;
      job_supplier_invoices: Table<JobSupplierInvoice>;
      supplier_payments: Table<SupplierPayment>;
      supplier_refunds: Table<SupplierRefund>;
      job_rejection_log: Table<JobRejectionLog>;
      customer_payments: Table<CustomerPayment>;
      email_templates: Table<EmailTemplate>;
      email_accounts: Table<EmailAccount>;
      email_messages: Table<EmailMessage>;
      email_lead_intake_log: Table<EmailLeadIntakeLog>;
      whatsapp_messages: Table<WhatsAppMessage>;
      whatsapp_conversations: Table<WhatsAppConversation>;
      commission_plans: Table<CommissionPlan>;
      commissions: Table<Commission>;
      attendance_events: Table<AttendanceEvent>;
      documents: Table<CrmDocument>;
      tasks: Table<CrmTask>;
      targets: Table<Target>;
      chat_channels: Table<ChatChannel>;
      chat_channel_members: Table<ChatChannelMember>;
      chat_messages: Table<ChatMessage>;
      customer_feedback: Table<CustomerFeedback>;
    };
    Views: {
      job_allocation_offer_view: { Row: JobAllocationOfferView; Relationships: [] };
    };
    Functions: {
      current_tenant_id: { Args: Record<string, never>; Returns: string };
      is_master_admin: { Args: Record<string, never>; Returns: boolean };
      has_permission: { Args: { permission_key: string }; Returns: boolean };
      can_view_assignment: { Args: { p_assigned_user_id: string | null }; Returns: boolean };
      is_whatsapp_agent: { Args: { p_profile_id: string }; Returns: boolean };
      whatsapp_takeover_open: { Args: { p_tenant_id: string }; Returns: boolean };
      whatsapp_quote_owner: { Args: { p_tenant_id: string; p_wa_id: string }; Returns: string | null };
      claim_lead: { Args: { p_lead_id: string }; Returns: Lead };
      release_lead: { Args: { p_lead_id: string }; Returns: Lead };
      accept_job_allocation_offer: { Args: { p_allocation_id: string }; Returns: JobAllocation };
      reject_job_allocation_offer: { Args: { p_allocation_id: string }; Returns: JobAllocationOffer };
      next_document_number: {
        Args: { p_brand_id: string; p_doc_type: string; p_prefix: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
