-- =============================================================================
-- Global Transport CRM — AI-driven WhatsApp lead intake.
--
-- Replaces the fixed name -> email -> pickup -> destination -> passengers ->
-- date question sequence with a free-form conversation run by OpenAI
-- (lib/whatsappAiIntake.ts) — the webhook now stores the whole transcript
-- and the cumulative trip details the model has extracted from it, instead
-- of a single answer per rigid step.
-- =============================================================================

alter table whatsapp_intake_sessions drop constraint whatsapp_intake_sessions_step_check;

alter table whatsapp_intake_sessions
  add column messages jsonb not null default '[]'::jsonb,
  add column collected jsonb not null default '{}'::jsonb;

alter table whatsapp_intake_sessions
  drop column name,
  drop column email,
  drop column pickup,
  drop column destination,
  drop column passenger_count,
  drop column travel_date_raw;

alter table whatsapp_intake_sessions alter column step set default 'active';

-- Existing rows from the old fixed-step flow (awaiting_name, awaiting_email,
-- awaiting_pickup, awaiting_destination, awaiting_passengers, awaiting_date)
-- have no transcript to resume from — their per-field answers were just
-- dropped above — so they restart as a fresh AI conversation on the
-- contact's next message rather than being force-fit into the old steps.
update whatsapp_intake_sessions set step = 'active' where step <> 'done';

-- 'handed_off': the conversation hit the turn cap (lib/whatsappAiIntake.ts's
-- MAX_INTAKE_MESSAGES) without ever collecting enough to create a lead — the
-- webhook stops auto-replying and a human takes over from the WhatsApp inbox
-- (app/(staff)/whatsapp), rather than looping the AI on an unproductive
-- conversation indefinitely.
alter table whatsapp_intake_sessions add constraint whatsapp_intake_sessions_step_check
  check (step in ('active', 'done', 'handed_off'));
