-- =============================================================================
-- Global Transport CRM — Multi-region users + lead unclaim
--
-- 1. Replaces profiles.region (single free-text value, 0003_operations.sql)
--    with user_regions — a user can now cover several regions. A lead whose
--    pickup/destination text matches exactly one distinct user auto-assigns
--    as before; a lead matching two or more distinct users is left in the
--    open pool so all of them can see it and race to claim it (claim_lead()
--    is already an atomic race-safe UPDATE — no change needed there).
-- 2. Adds release_lead(), a self-service "unclaim" mirroring claim_lead()'s
--    atomic-UPDATE-guard style: a user can release their own assigned lead
--    back to the open pool.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_regions
-- -----------------------------------------------------------------------------

create table user_regions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  region text not null,
  created_at timestamptz not null default now(),
  unique (user_id, region)
);
create index user_regions_user_id_idx on user_regions(user_id);
create index user_regions_region_idx on user_regions(region);

-- Backfill existing single-value regions, then drop the old column.
insert into user_regions (user_id, region)
select id, region from profiles where region is not null and region <> '';

alter table profiles drop column region;

alter table user_regions enable row level security;

create policy user_regions_select on user_regions for select
  using (exists (select 1 from profiles p where p.id = user_id and p.tenant_id = current_tenant_id()));
create policy user_regions_insert on user_regions for insert
  with check (
    exists (select 1 from profiles p where p.id = user_id and p.tenant_id = current_tenant_id())
    and has_permission('admin.manage_users')
  );
create policy user_regions_delete on user_regions for delete
  using (
    exists (select 1 from profiles p where p.id = user_id and p.tenant_id = current_tenant_id())
    and has_permission('admin.manage_users')
  );

-- -----------------------------------------------------------------------------
-- 2. route_lead() — multi-region aware. A lead matching exactly one distinct
-- candidate user auto-assigns (fewest-open-leads tiebreak, scoped to that
-- user's matching region rows). Two or more distinct candidates -> open pool.
-- -----------------------------------------------------------------------------

create or replace function route_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distinct_candidates int;
  v_candidate uuid;
begin
  if new.status <> 'new' then
    return new;
  end if;

  select count(distinct ur.user_id) into v_distinct_candidates
  from user_regions ur
  join profiles p on p.id = ur.user_id
  where p.tenant_id = new.tenant_id
    and p.status = 'active'
    and (
      (new.pickup_text is not null and new.pickup_text ilike '%' || ur.region || '%')
      or (new.destination_text is not null and new.destination_text ilike '%' || ur.region || '%')
    );

  if v_distinct_candidates = 1 then
    select ur.user_id into v_candidate
    from user_regions ur
    join profiles p on p.id = ur.user_id
    where p.tenant_id = new.tenant_id
      and p.status = 'active'
      and (
        (new.pickup_text is not null and new.pickup_text ilike '%' || ur.region || '%')
        or (new.destination_text is not null and new.destination_text ilike '%' || ur.region || '%')
      )
    order by (
      select count(*) from leads l2
      where l2.assigned_user_id = ur.user_id and l2.status in ('new', 'assigned', 'contacted')
    ) asc
    limit 1;
  end if;

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

-- -----------------------------------------------------------------------------
-- 3. release_lead() — self-service unclaim, mirrors claim_lead()'s atomic
-- UPDATE-guard style exactly. Only the lead's current owner can release it,
-- and only while it's still in a "working" state (not converted/closed).
-- -----------------------------------------------------------------------------

create or replace function release_lead(p_lead_id uuid)
returns leads
language plpgsql
security definer
set search_path = public
as $$
declare
  result leads;
begin
  update leads
  set assigned_user_id = null,
      status = 'open_pool',
      claimed_at = null,
      updated_at = now()
  where id = p_lead_id
    and tenant_id = current_tenant_id()
    and assigned_user_id = auth.uid()
    and status in ('assigned', 'contacted')
  returning * into result;

  if result.id is null then
    raise exception 'This lead cannot be released right now.';
  end if;

  return result;
end;
$$;
