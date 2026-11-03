import type { LeadSource } from "./supabase/database.types";

/** Human-friendly labels for lead_source — shown in the Leads workspace and the Control Centre channel-mix chart. */
export const SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  website_contact: "Contact Form",
  email: "Email",
  whatsapp: "WhatsApp",
  phone: "Phone",
  live_chat: "Live Chat",
  manual: "Manual",
  social: "Social",
  partner: "Partner",
  affiliate: "Affiliate",
  api: "API",
  ad_form: "Ad Form",
};
