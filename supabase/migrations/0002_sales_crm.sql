-- =============================================================================
-- Global Transport CRM — Phase 2 (Sales CRM)
-- Customers, vehicle types, omnichannel lead intake + territory-based
-- routing, the open lead pool (race-safe claim), enquiries/journey legs, and
-- versioned quotes with a token-based customer accept/reject flow.
-- Reuses the RLS/permission pattern established in 0001_foundation.sql —
-- current_tenant_id(), is_master_admin(), has_permission() — and the
-- enquiries.*/quotes.* permission keys already seeded there.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Customers (Part 18/39)
-- -----------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_name text,
  contact_name text not null,
  email text,
  phone text,
  mobile text,
  whatsapp text,
  billing_address text,
  country text,
  vat_number text,
  preferred_language text not null default 'en',
  account_manager_id uuid references profiles(id) on delete set null,
  default_brand_id uuid references brands(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_tenant_id_idx on customers(tenant_id);
create index customers_email_idx on customers(tenant_id, email);
create index customers_phone_idx on customers(tenant_id, phone);

-- -----------------------------------------------------------------------------
-- Vehicle type catalog — replaces the hardcoded prototype vehicle list;
-- reused unchanged by supplier fleet matching in a later phase.
-- -----------------------------------------------------------------------------

create table vehicle_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  seat_capacity integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index vehicle_types_tenant_id_idx on vehicle_types(tenant_id);

-- -----------------------------------------------------------------------------
-- Leads — omnichannel intake + geographic routing + open pool (Part 20-38)
-- -----------------------------------------------------------------------------

create type lead_source as enum (
  'website', 'email', 'whatsapp', 'phone', 'live_chat', 'manual',
  'social', 'partner', 'affiliate', 'api', 'ad_form'
);

create type lead_status as enum (
  'new', 'assigned', 'open_pool', 'contacted', 'converted', 'closed', 'spam', 'duplicate'
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  source lead_source not null,
  status lead_status not null default 'new',
  customer_id uuid references customers(id) on delete set null,
  assigned_user_id uuid references profiles(id) on delete set null,
  territory_id uuid references territories(id) on delete set null,
  claimed_at timestamptz,
  priority text not null default 'normal' check (priority in ('high', 'normal')),
  pickup_text text,
  destination_text text,
  travel_date date,
  passenger_count integer,
  vehicle_requested text,
  notes text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_tenant_id_idx on leads(tenant_id);
create index leads_assigned_user_id_idx on leads(assigned_user_id);
create index leads_status_idx on leads(tenant_id, status);
create index leads_territory_id_idx on leads(territory_id);

-- -----------------------------------------------------------------------------
-- Enquiries & journey legs (Part 39-41)
-- -----------------------------------------------------------------------------

create type enquiry_status as enum (
  'new', 'contacted', 'quoting', 'awaiting_customer',
  'accepted', 'declined', 'expired', 'cancelled', 'converted_to_booking', 'completed'
);

create table enquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  customer_id uuid not null references customers(id) on delete cascade,
  assigned_user_id uuid references profiles(id) on delete set null,
  status enquiry_status not null default 'new',
  quote_deadline timestamptz,
  internal_notes text,
  customer_notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index enquiries_tenant_id_idx on enquiries(tenant_id);
create index enquiries_assigned_user_id_idx on enquiries(assigned_user_id);
create index enquiries_customer_id_idx on enquiries(customer_id);

create table enquiry_legs (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  sequence integer not null default 1,
  journey_type text not null default 'one_way'
    check (journey_type in ('one_way', 'return', 'disposal', 'multi_day')),
  pickup_address text not null,
  pickup_lat double precision,
  pickup_lng double precision,
  destination_address text not null,
  destination_lat double precision,
  destination_lng double precision,
  via_points jsonb not null default '[]'::jsonb,
  pickup_date date,
  pickup_time time,
  return_date date,
  return_time time,
  passenger_count integer,
  luggage_count integer,
  vehicle_type_id uuid references vehicle_types(id) on delete set null,
  wheelchair_required boolean not null default false,
  child_seats integer not null default 0,
  special_requirements text,
  created_at timestamptz not null default now()
);
create index enquiry_legs_enquiry_id_idx on enquiry_legs(enquiry_id);

-- -----------------------------------------------------------------------------
-- Quotes, versions, decisions & events (Part 51-57)
-- -----------------------------------------------------------------------------

create type quote_status as enum (
  'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'converted'
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  quote_number text not null,
  status quote_status not null default 'draft',
  currency text not null default 'EUR',
  expiry_at timestamptz,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  current_version_id uuid,
  created_by uuid references profiles(id) on delete set null,
  sent_at timestamptz,
  viewed_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, quote_number)
);
create index quotes_tenant_id_idx on quotes(tenant_id);
create index quotes_enquiry_id_idx on quotes(enquiry_id);
create index quotes_public_token_idx on quotes(public_token);

create table quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  version_number integer not null default 1,
  vehicle_type_id uuid references vehicle_types(id) on delete set null,
  vehicle_description text,
  supplier_estimated_cost numeric(12, 2),
  selling_price numeric(12, 2) not null,
  currency text not null default 'EUR',
  deposit_options jsonb not null default '[25, 50, 100]'::jsonb,
  payment_methods jsonb not null default '{"stripe": true, "bank_transfer": true}'::jsonb,
  customer_notes text,
  terms_snapshot text,
  brand_snapshot jsonb not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_id, version_number)
);
create index quote_versions_quote_id_idx on quote_versions(quote_id);

alter table quotes
  add constraint quotes_current_version_id_fkey
  foreign key (current_version_id) references quote_versions(id) on delete set null;

create table quote_decisions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'rejected')),
  reason text,
  free_text text,
  decided_at timestamptz not null default now(),
  ip_address text
);
create index quote_decisions_quote_id_idx on quote_decisions(quote_id);

create table quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  event text not null check (event in ('sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);
create index quote_events_quote_id_idx on quote_events(quote_id);

-- -----------------------------------------------------------------------------
-- Per-brand document numbering (Part 11) — reused unchanged for
-- booking/invoice/receipt/credit-note numbers in later phases.
-- -----------------------------------------------------------------------------

create table number_sequences (
  brand_id uuid not null references brands(id) on delete cascade,
  doc_type text not null,
  next_value integer not null default 1,
  primary key (brand_id, doc_type)
);

create or replace function next_document_number(p_brand_id uuid, p_doc_type text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into number_sequences (brand_id, doc_type, next_value)
  values (p_brand_id, p_doc_type, 1)
  on conflict (brand_id, doc_type) do nothing;

  update number_sequences
  set next_value = next_value + 1
  where brand_id = p_brand_id and doc_type = p_doc_type
  returning next_value - 1 into v_next;

  return p_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;

-- -----------------------------------------------------------------------------
-- Webhook secret for the website lead intake API (Part 22)
-- -----------------------------------------------------------------------------

alter table brands add column webhook_secret text not null default encode(gen_random_bytes(16), 'hex');

-- =============================================================================
-- Lead routing — territory text-match, then fewest-open-leads tiebreak,
-- else the open pool. Runs BEFORE INSERT so it sets the row in one pass
-- (Part 29/30/32). Round-robin weighting, capacity limits and shift
-- awareness (Part 34/35) are a later refinement, not implemented here.
-- =============================================================================

create or replace function route_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_territory_id uuid;
  v_candidate uuid;
begin
  if new.status <> 'new' then
    return new;
  end if;

  select t.id into v_territory_id
  from territories t
  where t.tenant_id = new.tenant_id
    and (
      (new.pickup_text is not null and new.pickup_text ilike '%' || t.value || '%')
      or (new.destination_text is not null and new.destination_text ilike '%' || t.value || '%')
    )
  order by length(t.value) desc
  limit 1;

  if v_territory_id is not null then
    select ut.user_id into v_candidate
    from user_territories ut
    join profiles p on p.id = ut.user_id
    where ut.territory_id = v_territory_id
      and p.tenant_id = new.tenant_id
      and p.status = 'active'
    order by (
      select count(*) from leads l2
      where l2.assigned_user_id = ut.user_id and l2.status in ('new', 'assigned', 'contacted')
    ) asc
    limit 1;
  end if;

  new.territory_id := v_territory_id;

  if v_candidate is not null then
    new.assigned_user_id := v_candidate;
    new.status := 'assigned';
    new.claimed_at := now();
  else
    new.status := 'open_pool';
  end if;

  return new;
end;
$$;

create trigger leads_route_before_insert
  before insert on leads
  for each row execute function route_lead();

-- =============================================================================
-- Race-safe open-pool claim (Part 32) — a single atomic UPDATE guarded by
-- `status = 'open_pool' and assigned_user_id is null`; the second concurrent
-- caller updates zero rows and gets the exception below instead of silently
-- double-claiming.
-- =============================================================================

create or replace function claim_lead(p_lead_id uuid)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  result leads;
begin
  update leads
  set assigned_user_id = auth.uid(),
      status = 'assigned',
      claimed_at = now(),
      updated_at = now()
  where id = p_lead_id
    and tenant_id = current_tenant_id()
    and status = 'open_pool'
    and assigned_user_id is null
  returning * into result;

  if result.id is null then
    raise exception 'This lead has already been claimed.';
  end if;

  return result;
end;
$$;

-- =============================================================================
-- Shared visibility helper — a user may see a lead/enquiry they are assigned
-- to, any if they hold enquiries.view_all, or their team's if they hold
-- enquiries.view_team (Part 8/33). Quotes have no separate view permission —
-- visibility is inherited from the parent enquiry (Part 51).
-- =============================================================================

create or replace function can_view_assignment(p_assigned_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    is_master_admin()
    or has_permission('enquiries.view_all')
    or p_assigned_user_id = auth.uid()
    or (
      has_permission('enquiries.view_team')
      and exists (
        select 1 from profiles p1
        join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
        where p1.id = auth.uid() and p2.id = p_assigned_user_id
      )
    );
$$;

-- =============================================================================
-- Row-Level Security
-- =============================================================================

alter table customers enable row level security;
alter table vehicle_types enable row level security;
alter table leads enable row level security;
alter table enquiries enable row level security;
alter table enquiry_legs enable row level security;
alter table quotes enable row level security;
alter table quote_versions enable row level security;
alter table quote_decisions enable row level security;
alter table quote_events enable row level security;
alter table number_sequences enable row level security;

-- customers: any signed-in tenant member can read/search; writes require the
-- same permission that lets a user work an enquiry, since creating a
-- customer record is normally part of that flow (Part 8 has no standalone
-- customers.* permission key).
create policy customers_select on customers for select
  using (tenant_id = current_tenant_id());
create policy customers_insert on customers for insert
  with check (tenant_id = current_tenant_id() and has_permission('enquiries.add'));
create policy customers_update on customers for update
  using (tenant_id = current_tenant_id() and has_permission('enquiries.edit'));

create policy vehicle_types_select on vehicle_types for select
  using (tenant_id = current_tenant_id());
create policy vehicle_types_write on vehicle_types for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));
create policy vehicle_types_update on vehicle_types for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));

-- leads: assigned/team/all per can_view_assignment(), plus open-pool rows
-- matching the viewer's own territories (or untargeted pool rows).
create policy leads_select on leads for select
  using (
    tenant_id = current_tenant_id()
    and (
      can_view_assignment(assigned_user_id)
      or (
        status = 'open_pool'
        and (
          territory_id is null
          or exists (select 1 from user_territories ut where ut.user_id = auth.uid() and ut.territory_id = leads.territory_id)
        )
      )
    )
  );
create policy leads_insert on leads for insert
  with check (tenant_id = current_tenant_id() and has_permission('enquiries.add'));
create policy leads_update on leads for update
  using (
    tenant_id = current_tenant_id()
    and (
      assigned_user_id = auth.uid()
      or has_permission('enquiries.edit')
      or has_permission('enquiries.reassign')
      or has_permission('enquiries.return_to_pool')
    )
  );

create policy enquiries_select on enquiries for select
  using (tenant_id = current_tenant_id() and can_view_assignment(assigned_user_id));
create policy enquiries_insert on enquiries for insert
  with check (tenant_id = current_tenant_id() and has_permission('enquiries.add'));
create policy enquiries_update on enquiries for update
  using (
    tenant_id = current_tenant_id()
    and (assigned_user_id = auth.uid() or has_permission('enquiries.edit') or has_permission('enquiries.reassign'))
  );

create policy enquiry_legs_select on enquiry_legs for select
  using (exists (
    select 1 from enquiries e where e.id = enquiry_legs.enquiry_id and can_view_assignment(e.assigned_user_id)
  ));
create policy enquiry_legs_insert on enquiry_legs for insert
  with check (exists (
    select 1 from enquiries e
    where e.id = enquiry_legs.enquiry_id
      and e.tenant_id = current_tenant_id()
      and (e.assigned_user_id = auth.uid() or has_permission('enquiries.edit'))
  ));
create policy enquiry_legs_update on enquiry_legs for update
  using (exists (
    select 1 from enquiries e
    where e.id = enquiry_legs.enquiry_id
      and e.tenant_id = current_tenant_id()
      and (e.assigned_user_id = auth.uid() or has_permission('enquiries.edit'))
  ));

-- quotes: visibility inherited from the parent enquiry; writes gated by the
-- quotes.* permission catalog.
create policy quotes_select on quotes for select
  using (
    tenant_id = current_tenant_id()
    and exists (select 1 from enquiries e where e.id = quotes.enquiry_id and can_view_assignment(e.assigned_user_id))
  );
create policy quotes_insert on quotes for insert
  with check (tenant_id = current_tenant_id() and has_permission('quotes.create'));
create policy quotes_update on quotes for update
  using (
    tenant_id = current_tenant_id()
    and (
      created_by = auth.uid()
      or has_permission('quotes.edit')
      or has_permission('quotes.send')
      or has_permission('quotes.cancel')
    )
  );

create policy quote_versions_select on quote_versions for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_versions.quote_id and can_view_assignment(e.assigned_user_id)
  ));
create policy quote_versions_insert on quote_versions for insert
  with check (exists (
    select 1 from quotes q where q.id = quote_versions.quote_id and q.tenant_id = current_tenant_id()
  ) and (has_permission('quotes.create') or has_permission('quotes.edit')));

create policy quote_decisions_select on quote_decisions for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_decisions.quote_id and can_view_assignment(e.assigned_user_id)
  ));
-- No authenticated-user insert policy: decisions are written by the public
-- /q/[token] flow via the service-role client (no Supabase session exists
-- for a customer), the same trust model already used by invite/reset links.

create policy quote_events_select on quote_events for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_events.quote_id and can_view_assignment(e.assigned_user_id)
  ));

create policy number_sequences_select on number_sequences for select
  using (exists (select 1 from brands b where b.id = number_sequences.brand_id and b.tenant_id = current_tenant_id()));
