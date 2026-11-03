-- =============================================================================
-- Global Transport CRM — Phase 2.5 (Real operating flow adjustments)
-- Region-based user assignment (replacing unused Territories for routing),
-- lead->quote fast path support, bank accounts + manual payment/invoice,
-- suppliers (entity + self-service verification + approval), and manual
-- region-suggested job dispatch with a two-step supplier confirmation.
-- Reuses the RLS/permission pattern from 0001/0002 throughout.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Users: single free-text region + at most one Master Admin per tenant
-- -----------------------------------------------------------------------------

alter table profiles add column region text;

-- If this fails, more than one profile in a tenant currently has
-- is_master_admin = true — demote the extras first, then re-run.
create unique index profiles_one_master_admin_per_tenant on profiles(tenant_id) where is_master_admin;

-- -----------------------------------------------------------------------------
-- 2. Lead routing: match leads.pickup_text against profiles.region instead of
-- the (unused, no UI) territories/user_territories tables from 0001.
-- -----------------------------------------------------------------------------

create or replace function route_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate uuid;
begin
  if new.status <> 'new' then
    return new;
  end if;

  select p.id into v_candidate
  from profiles p
  where p.tenant_id = new.tenant_id
    and p.status = 'active'
    and p.region is not null
    and p.region <> ''
    and (
      (new.pickup_text is not null and new.pickup_text ilike '%' || p.region || '%')
      or (new.destination_text is not null and new.destination_text ilike '%' || p.region || '%')
    )
  order by (
    select count(*) from leads l2
    where l2.assigned_user_id = p.id and l2.status in ('new', 'assigned', 'contacted')
  ) asc
  limit 1;

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

-- Open Pool is explicitly meant to be visible to every signed-in tenant
-- member, not filtered by the viewer's own region — simplify the policy.
drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  using (
    tenant_id = current_tenant_id()
    and (can_view_assignment(assigned_user_id) or status = 'open_pool')
  );

-- -----------------------------------------------------------------------------
-- 3. Payment (bank transfer) + lightweight invoice on the quote itself —
-- no separate accounting ledger.
-- -----------------------------------------------------------------------------

alter type quote_status add value if not exists 'paid';
alter table quotes add column invoice_number text;
alter table quotes add column invoiced_at timestamptz;

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  account_name text not null,
  bank_name text not null,
  account_number text,
  iban text,
  sort_code text,
  swift_bic text,
  currency text not null default 'EUR',
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);
create index bank_accounts_brand_id_idx on bank_accounts(brand_id);

alter table bank_accounts enable row level security;

create policy bank_accounts_select on bank_accounts for select
  using (tenant_id = current_tenant_id());
create policy bank_accounts_insert on bank_accounts for insert
  with check (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));
create policy bank_accounts_update on bank_accounts for update
  using (tenant_id = current_tenant_id() and has_permission('admin.manage_brands'));

-- -----------------------------------------------------------------------------
-- 4. Suppliers — entity, self-service verification (text + uploaded docs),
-- admin approval. supplier.id IS the auth.users id, same pattern as
-- profiles.id, created together at invite time.
-- -----------------------------------------------------------------------------

create type supplier_type as enum ('company', 'individual');
create type supplier_status as enum ('invited', 'submitted', 'approved', 'rejected', 'suspended');

create table suppliers (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  type supplier_type not null default 'company',
  contact_name text,
  email text not null,
  phone text,
  whatsapp text,
  region text,
  status supplier_status not null default 'invited',
  registration_number text,
  vat_number text,
  insurance_details text,
  license_number text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_tenant_id_idx on suppliers(tenant_id);
create index suppliers_status_idx on suppliers(tenant_id, status);

create table supplier_vehicles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  vehicle_type text not null,
  seat_capacity integer,
  plate_number text,
  notes text,
  created_at timestamptz not null default now()
);
create index supplier_vehicles_supplier_id_idx on supplier_vehicles(supplier_id);

create table supplier_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  label text not null,
  storage_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);
create index supplier_documents_supplier_id_idx on supplier_documents(supplier_id);

alter table suppliers enable row level security;
alter table supplier_vehicles enable row level security;
alter table supplier_documents enable row level security;

-- Any of these permissions (all seeded in 0001) lets tenant staff work with
-- suppliers; Operations roles already have suppliers.view_performance /
-- suppliers.send_jobs from the default seed.
create policy suppliers_select on suppliers for select
  using (
    id = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (
        has_permission('suppliers.add') or has_permission('suppliers.edit')
        or has_permission('suppliers.approve') or has_permission('suppliers.view_performance')
        or has_permission('suppliers.send_jobs')
      )
    )
  );
create policy suppliers_insert on suppliers for insert
  with check (tenant_id = current_tenant_id() and has_permission('suppliers.add'));
create policy suppliers_update on suppliers for update
  using (
    id = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (has_permission('suppliers.edit') or has_permission('suppliers.approve') or has_permission('suppliers.suspend'))
    )
  );

create policy supplier_vehicles_select on supplier_vehicles for select
  using (
    supplier_id = auth.uid()
    or exists (
      select 1 from suppliers s
      where s.id = supplier_vehicles.supplier_id and s.tenant_id = current_tenant_id()
        and (has_permission('suppliers.approve') or has_permission('suppliers.edit') or has_permission('suppliers.view_performance'))
    )
  );
create policy supplier_vehicles_write on supplier_vehicles for insert
  with check (supplier_id = auth.uid());
create policy supplier_vehicles_update on supplier_vehicles for update
  using (supplier_id = auth.uid());
create policy supplier_vehicles_delete on supplier_vehicles for delete
  using (supplier_id = auth.uid());

create policy supplier_documents_select on supplier_documents for select
  using (
    supplier_id = auth.uid()
    or exists (
      select 1 from suppliers s
      where s.id = supplier_documents.supplier_id and s.tenant_id = current_tenant_id()
        and (has_permission('suppliers.approve') or has_permission('suppliers.edit') or has_permission('suppliers.view_performance'))
    )
  );
create policy supplier_documents_write on supplier_documents for insert
  with check (supplier_id = auth.uid());
create policy supplier_documents_delete on supplier_documents for delete
  using (supplier_id = auth.uid());

-- Storage bucket for verification documents — private, path-prefixed by
-- supplier id so a supplier can only reach their own folder.
insert into storage.buckets (id, name, public)
values ('supplier-documents', 'supplier-documents', false)
on conflict (id) do nothing;

create policy supplier_documents_storage_read on storage.objects for select
  using (
    bucket_id = 'supplier-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_permission('suppliers.approve')
      or has_permission('suppliers.view_performance')
      or is_master_admin()
    )
  );
create policy supplier_documents_storage_insert on storage.objects for insert
  with check (bucket_id = 'supplier-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy supplier_documents_storage_delete on storage.objects for delete
  using (bucket_id = 'supplier-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 5. Jobs — one per paid quote, manually assigned to an approved supplier,
-- with a two-step accept/confirm before full journey details are revealed
-- (Part 85 of the project brief: no customer name/exact address before
-- formal assignment).
-- -----------------------------------------------------------------------------

create type job_status as enum (
  'unassigned', 'offered', 'accepted_by_supplier', 'rejected_by_supplier',
  'confirmed', 'completed', 'cancelled'
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null unique references quotes(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  region text,
  status job_status not null default 'unassigned',
  assigned_supplier_id uuid references suppliers(id) on delete set null,
  offered_at timestamptz,
  responded_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  supplier_invoice_note text,
  supplier_invoice_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index jobs_tenant_id_idx on jobs(tenant_id);
create index jobs_assigned_supplier_id_idx on jobs(assigned_supplier_id);

alter table jobs enable row level security;

create policy jobs_select on jobs for select
  using (
    assigned_supplier_id = auth.uid()
    or (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.view')))
  );
create policy jobs_insert on jobs for insert
  with check (tenant_id = current_tenant_id());
create policy jobs_update on jobs for update
  using (
    assigned_supplier_id = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier') or has_permission('bookings.edit'))
    )
  );

-- Supplier-safe read: full pickup/destination address and customer contact
-- are only exposed once the supplier has completed the two-step
-- confirmation (status = confirmed/completed). This is enforced here, not
-- just in the UI — the view filters to the calling supplier's own jobs
-- itself (it intentionally runs with the view owner's privileges, since a
-- supplier has no `profiles` row and so can't pass the staff-oriented RLS
-- on quotes/enquiries/customers at all).
create view job_offer_view as
select
  j.id,
  j.tenant_id,
  j.assigned_supplier_id,
  j.status,
  j.region,
  j.offered_at,
  j.responded_at,
  j.confirmed_at,
  j.completed_at,
  j.supplier_invoice_note,
  j.supplier_invoice_url,
  el.pickup_date,
  el.pickup_time,
  el.passenger_count,
  el.vehicle_type_id,
  case when j.status in ('confirmed', 'completed') then el.pickup_address else null end as pickup_address,
  case when j.status in ('confirmed', 'completed') then el.destination_address else null end as destination_address,
  case when j.status in ('confirmed', 'completed') then c.contact_name else null end as customer_name,
  case when j.status in ('confirmed', 'completed') then c.phone else null end as customer_phone
from jobs j
join quotes q on q.id = j.quote_id
join enquiries e on e.id = q.enquiry_id
left join enquiry_legs el on el.enquiry_id = e.id and el.sequence = 1
left join customers c on c.id = j.customer_id
where j.assigned_supplier_id = auth.uid();

grant select on job_offer_view to authenticated;
