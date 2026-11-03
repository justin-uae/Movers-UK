-- =============================================================================
-- Shared, tenant-wide document number counters
--
-- number_sequences used to have one row per (brand_id, doc_type), so every
-- brand started its own QT-00001 / INV-00001 and different brands could end
-- up with the same quote/invoice number. This migration collapses it to one
-- row per (tenant_id, doc_type), shared by every brand in the tenant, and
-- rewrites next_document_number() to use it.
--
-- Existing quote_number / invoice_number values on quotes are NOT touched or
-- renumbered, including any duplicates already sent to customers (a known
-- one today: QT-00001 exists on 3 quotes across 3 brands). The new shared
-- counter for each doc_type starts above the highest number already in use
-- for that doc_type across all brands, so it can never collide with an
-- existing number.
-- =============================================================================

alter table number_sequences add column tenant_id uuid references tenants(id) on delete cascade;

update number_sequences ns
set tenant_id = b.tenant_id
from brands b
where b.id = ns.brand_id;

alter table number_sequences alter column tenant_id set not null;

-- The old RLS policy reads brand_id directly, so it must be dropped before
-- that column is dropped below. The replacement policy (using tenant_id
-- directly) is created further down, once the column exists to back it.
drop policy number_sequences_select on number_sequences;

-- Compute the collapsed, per-tenant starting value for each doc_type as the
-- greater of: (a) the highest next_value among the per-brand rows being
-- merged, and (b) one past the highest numeric suffix actually found in the
-- real quote_number / invoice_number columns. (b) is a self-check so the new
-- counter can never issue a number that collides with one already in use,
-- even if a brand's counter and its real data had ever drifted apart.
create temporary table number_sequences_shared as
with per_brand_max as (
  select tenant_id, doc_type, max(next_value) as candidate_next_value
  from number_sequences
  group by tenant_id, doc_type
),
quote_number_max as (
  select tenant_id, 'quote'::text as doc_type,
         coalesce(max((regexp_match(quote_number, '(\d+)$'))[1]::int), 0) + 1 as candidate_next_value
  from quotes
  group by tenant_id
),
invoice_number_max as (
  select tenant_id, 'invoice'::text as doc_type,
         coalesce(max((regexp_match(invoice_number, '(\d+)$'))[1]::int), 0) + 1 as candidate_next_value
  from quotes
  where invoice_number is not null
  group by tenant_id
),
combined as (
  select * from per_brand_max
  union all
  select * from quote_number_max
  union all
  select * from invoice_number_max
)
select tenant_id, doc_type, max(candidate_next_value) as next_value
from combined
group by tenant_id, doc_type;

-- Replace the per-brand rows with the collapsed, shared rows.
delete from number_sequences;

alter table number_sequences drop constraint number_sequences_pkey;
alter table number_sequences drop column brand_id;
alter table number_sequences add primary key (tenant_id, doc_type);

insert into number_sequences (tenant_id, doc_type, next_value)
select tenant_id, doc_type, next_value from number_sequences_shared;

drop table number_sequences_shared;

-- RLS: was joined through brands.tenant_id via brand_id; now tenant_id is
-- direct on the table, matching the pattern used everywhere else.
create policy number_sequences_select on number_sequences for select
  using (tenant_id = current_tenant_id());

-- Same signature as before, so no application code needs to change: it still
-- takes p_brand_id, but now resolves the brand's tenant and increments the
-- shared per-tenant counter. Still a single atomic UPDATE ... RETURNING, so
-- still race-safe — two concurrent callers for the same tenant/doc_type
-- serialize on that row's lock exactly as they did per-brand before.
create or replace function next_document_number(p_brand_id uuid, p_doc_type text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_next integer;
begin
  select tenant_id into v_tenant_id from brands where id = p_brand_id;

  insert into number_sequences (tenant_id, doc_type, next_value)
  values (v_tenant_id, p_doc_type, 1)
  on conflict (tenant_id, doc_type) do nothing;

  update number_sequences
  set next_value = next_value + 1
  where tenant_id = v_tenant_id and doc_type = p_doc_type
  returning next_value - 1 into v_next;

  return p_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;

-- Tenant-wide uniqueness, enforced only for rows created from this moment
-- on. Existing numbers (including the QT-00001 duplicates) predate the
-- cutover captured below and are left alone; only newly created rows are
-- checked against every brand in the tenant, not just their own brand.
do $$
declare
  v_cutover timestamptz := now();
begin
  execute format(
    'create unique index quotes_tenant_quote_number_future_uidx on quotes (tenant_id, quote_number) where created_at >= %L',
    v_cutover
  );
  execute format(
    'create unique index quotes_tenant_invoice_number_future_uidx on quotes (tenant_id, invoice_number) where invoice_number is not null and created_at >= %L',
    v_cutover
  );
end $$;
