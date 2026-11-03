-- =============================================================================
-- A staff-sent WhatsApp reply that 360dialog rejects (most commonly: it's
-- been over 24h since the contact's last message, and WhatsApp only allows
-- re-opening that window with an approved template, not freeform text) was
-- previously logged into whatsapp_messages identically to a real send —
-- the thread had no way to show it never actually reached the contact.
-- This adds a delivery status so a failed send can be marked and rendered
-- distinctly instead of looking indistinguishable from a delivered one.
-- =============================================================================

alter table whatsapp_messages
  add column delivery_status text not null default 'sent'
    check (delivery_status in ('sent', 'failed')),
  add column delivery_error text;
