-- =============================================================================
-- Global Transport CRM — WhatsApp inbound message de-duplication.
--
-- 360dialog/Meta's Cloud API webhook is at-least-once, not exactly-once — the
-- same inbound message can be POSTed to our webhook more than once. The AI
-- intake webhook (app/api/webhooks/360dialog/route.ts) had no way to tell a
-- redelivery apart from a genuinely new message, so each redelivery ran its
-- own OpenAI call and appended a second, differently-worded reply to the same
-- conversation — visible to the contact as the bot answering twice, and
-- burning through MAX_INTAKE_MESSAGES (lib/whatsappAiIntake.ts) roughly twice
-- as fast as a real conversation would, sometimes tripping the turn cap
-- before a lead that had already gathered everything it needed ever got
-- created.
--
-- wa_message_id stores WhatsApp's own message id (present on every inbound
-- payload) so a unique index (per brand, inbound rows only) turns the log
-- insert itself into the dedup check — a redelivery hits the constraint and
-- is skipped before any OpenAI call happens.
-- =============================================================================

alter table whatsapp_messages add column wa_message_id text;

create unique index whatsapp_messages_inbound_dedup_idx
  on whatsapp_messages(brand_id, wa_message_id)
  where direction = 'inbound' and wa_message_id is not null;
