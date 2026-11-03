-- =============================================================================
-- Adds the one profile field the new email-signature feature needs that
-- doesn't already exist — profiles.phone (unused anywhere in the app until
-- now) becomes the signature's "Direct Dial" number, and this adds a
-- WhatsApp number alongside it. Both are self-service: a staff member edits
-- their own via Email Centre (app/(staff)/email/actions.ts), no admin
-- permission required, since they're personal contact details, not account
-- security settings.
-- =============================================================================

alter table profiles add column if not exists whatsapp_number text;
