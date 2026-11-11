-- =============================================================================
-- Cheap Mover CRM — Move details on leads.
--
-- The website's 4-step "Get your moving quote" form captures the property
-- and access details a removal is priced on, which had nowhere to go but
-- free-text notes. Each one becomes a real column so the Leads workspace can
-- show it, and quote creation / AI pricing can read it, without parsing.
--
-- Booleans are nullable on purpose: null = "not asked" (a manually-added or
-- email/WhatsApp lead), false = the customer saw the checkbox and left it
-- unticked. Floors and rooms stay free text ("Ground", "3 bed + study").
-- =============================================================================

alter table leads
  add column if not exists move_type text,
  add column if not exists property_type text,
  add column if not exists rooms text,
  add column if not exists estimated_boxes integer check (estimated_boxes is null or estimated_boxes >= 0),
  add column if not exists pickup_floor text,
  add column if not exists destination_floor text,
  add column if not exists lift_available boolean,
  add column if not exists packing_needed boolean,
  add column if not exists dismantling_needed boolean,
  add column if not exists assembly_needed boolean,
  add column if not exists storage_needed boolean,
  add column if not exists fragile_items boolean,
  add column if not exists privacy_consent boolean not null default false,
  add column if not exists privacy_consent_at timestamptz;
