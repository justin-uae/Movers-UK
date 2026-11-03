-- =============================================================================
-- Global Transport CRM — Automated task creation (TSK-02).
--
-- Adds a `source` tag to tasks so the new /api/cron/task-automation sweep can
-- dedup against its own previously-created tasks (a manually created task
-- leaves this null and is never touched by the sweep). Deliberately not a
-- foreign key or enum — the four trigger kinds ('quote_followup',
-- 'payment_due', 'supplier_confirmation', 'travel_prep') are just string tags
-- the cron route itself defines and checks against, the same "app owns the
-- meaning, DB just stores it" choice already made for tasks.checklist (jsonb).
-- =============================================================================

alter table tasks add column source text;
create index tasks_source_idx on tasks(source) where source is not null;
