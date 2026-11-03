-- =============================================================================
-- Global Transport CRM — BKG-02: multi-supplier / multi-vehicle dispatch.
--
-- Today a `jobs` row is 1:1 with a `quotes` row and has exactly one
-- `assigned_supplier_id` — even a multi-leg, multi-day booking (many
-- `enquiry_legs` rows under one enquiry) collapses into one job assigned to
-- one supplier for the entire itinerary. This migration adds a new
-- `job_allocations` layer beneath `jobs` so different legs of the same
-- booking can go to different suppliers, each with its own accept/confirm/
-- complete lifecycle, vehicle note, agreed cost, invoice and payment status —
-- while `jobs` itself stays the stable 1:1-with-quote "booking" container
-- (unchanged identity for bookings lists, customer_feedback, commissions,
-- and BI/accounting reports that key off jobs.id/quote_id).
--
-- Also fixes a real data-exposure bug: job_offer_view's `legs` column
-- (0042_job_offer_view_full_legs.sql) shows a supplier the *entire*
-- multi-leg itinerary once offered a job, by design, per that migration's
-- own comment ("one supplier is expected to see the whole multi-leg
-- itinerary"). The new job_allocation_offer_view scopes `legs` to only the
-- legs actually in that supplier's own allocation.
--
-- This is a full rework, not a shim: job_offers and the job-level
-- assignment/offer/invoice-note/payment-status columns on `jobs` are
-- dropped once everything is migrated onto job_allocations — see the
-- "drop everything superseded" section near the bottom.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New tables — job_allocations, job_allocation_legs, job_allocation_offers.
-- Reuses the existing job_status/job_offer_status enums (same lifecycle,
-- just at allocation granularity instead of whole-job granularity).
-- -----------------------------------------------------------------------------

create table job_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  status job_status not null default 'unassigned',
  assigned_supplier_id uuid references suppliers(id) on delete set null,
  vehicle_notes text,
  agreed_cost numeric(12, 2),
  currency text default 'EUR',
  offered_at timestamptz,
  responded_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  supplier_payment_status text not null default 'unpaid'
    check (supplier_payment_status in ('unpaid', 'partially_paid', 'paid')),
  manual_invoice_note text,
  manual_invoice_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index job_allocations_job_id_idx on job_allocations(job_id);
create index job_allocations_assigned_supplier_id_idx on job_allocations(assigned_supplier_id);

-- A leg belongs to at most one live allocation (the UNIQUE enforces this).
-- Cancelling an allocation frees its legs by explicitly deleting these rows
-- (app-layer, see cancelAllocation() in lib/dispatchAllocations.ts) — NOT
-- via ON DELETE CASCADE from job_allocations, since a cancelled allocation
-- row must be kept for cost/invoice history, so cascade-on-parent-delete
-- never fires. A leg's membership is only editable while its allocation is
-- still 'unassigned' — once offered, the leg set is locked.
create table job_allocation_legs (
  id uuid primary key default gen_random_uuid(),
  job_allocation_id uuid not null references job_allocations(id) on delete cascade,
  enquiry_leg_id uuid not null references enquiry_legs(id) on delete cascade,
  unique (enquiry_leg_id)
);
create index job_allocation_legs_job_allocation_id_idx on job_allocation_legs(job_allocation_id);

create table job_allocation_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_allocation_id uuid not null references job_allocations(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  status job_offer_status not null default 'sent',
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (job_allocation_id, supplier_id)
);
create index job_allocation_offers_job_allocation_id_idx on job_allocation_offers(job_allocation_id);
create index job_allocation_offers_supplier_id_idx on job_allocation_offers(supplier_id, status);

-- -----------------------------------------------------------------------------
-- 2. job_supplier_invoices / supplier_payments gain job_allocation_id, which
-- becomes the real identity going forward — job_id stays for convenient
-- booking-level joins, kept in sync automatically so call sites never need
-- to set both.
-- -----------------------------------------------------------------------------

alter table job_supplier_invoices add column job_allocation_id uuid references job_allocations(id) on delete cascade;
alter table supplier_payments add column job_allocation_id uuid references job_allocations(id) on delete cascade;

-- -----------------------------------------------------------------------------
-- 3. Backfill — one job_allocations row per existing job, covering every leg
-- of that job's enquiry (today's jobs implicitly cover the whole itinerary),
-- migrating existing job_offers/invoices/payments onto it.
-- -----------------------------------------------------------------------------

insert into job_allocations (
  tenant_id, job_id, status, assigned_supplier_id, offered_at, responded_at,
  confirmed_at, completed_at, supplier_payment_status, manual_invoice_note,
  manual_invoice_url, created_by, created_at
)
select
  tenant_id, id, status, assigned_supplier_id, offered_at, responded_at,
  confirmed_at, completed_at, supplier_payment_status, supplier_invoice_note,
  supplier_invoice_url, created_by, created_at
from jobs;

insert into job_allocation_legs (job_allocation_id, enquiry_leg_id)
select ja.id, el.id
from job_allocations ja
join jobs j on j.id = ja.job_id
join quotes q on q.id = j.quote_id
join enquiry_legs el on el.enquiry_id = q.enquiry_id;

insert into job_allocation_offers (tenant_id, job_allocation_id, supplier_id, status, offered_at, responded_at)
select jo.tenant_id, ja.id, jo.supplier_id, jo.status, jo.offered_at, jo.responded_at
from job_offers jo
join job_allocations ja on ja.job_id = jo.job_id;

update job_supplier_invoices jsi
set job_allocation_id = ja.id
from job_allocations ja
where ja.job_id = jsi.job_id;

update supplier_payments sp
set job_allocation_id = ja.id
from job_allocations ja
where ja.job_id = sp.job_id;

-- -----------------------------------------------------------------------------
-- 4. Auto-populate job_id from job_allocation_id going forward, and lock in
-- job_allocation_id as the real identity now that backfill is complete.
-- -----------------------------------------------------------------------------

create or replace function sync_job_id_from_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select job_id into new.job_id from job_allocations where id = new.job_allocation_id;
  return new;
end;
$$;

create trigger job_supplier_invoices_sync_job_id
  before insert or update of job_allocation_id on job_supplier_invoices
  for each row execute function sync_job_id_from_allocation();

create trigger supplier_payments_sync_job_id
  before insert or update of job_allocation_id on supplier_payments
  for each row execute function sync_job_id_from_allocation();

alter table job_supplier_invoices alter column job_allocation_id set not null;
alter table job_supplier_invoices drop constraint job_supplier_invoices_job_id_key;
alter table job_supplier_invoices add constraint job_supplier_invoices_job_allocation_id_key unique (job_allocation_id);
create index job_supplier_invoices_job_allocation_id_idx on job_supplier_invoices(job_allocation_id);

alter table supplier_payments alter column job_allocation_id set not null;
create index supplier_payments_job_allocation_id_idx on supplier_payments(job_allocation_id);

-- -----------------------------------------------------------------------------
-- 5. Drop everything superseded by the allocation layer — in dependency
-- order: the view first (references soon-to-drop jobs columns), then RLS
-- policies that reference jobs.assigned_supplier_id/status, then the
-- payment-status trigger, then the old RPCs and job_offers table, then
-- finally the now-dead jobs columns themselves.
-- -----------------------------------------------------------------------------

drop view if exists job_offer_view;

drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select
  using (
    tenant_id = current_tenant_id()
    and (is_master_admin() or has_permission('bookings.view') or has_permission('finance.pay_suppliers') or has_permission('finance.view_invoices'))
  );

drop policy if exists jobs_update on jobs;
-- Drops the assigned_supplier_id clause (suppliers no longer write to jobs
-- directly, only to their own allocations) but keeps created_by = auth.uid()
-- — added by 0004_sales_can_dispatch_own_jobs.sql and still relied on by
-- cancelBookingAction (app/(staff)/quotes/actions.ts) for a booking's owner.
create policy jobs_update on jobs for update
  using (
    created_by = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier') or has_permission('bookings.edit'))
    )
  );

drop policy if exists job_supplier_invoices_insert on job_supplier_invoices;
create policy job_supplier_invoices_insert on job_supplier_invoices for insert
  with check (
    supplier_id = auth.uid()
    and exists (
      select 1 from job_allocations ja
      where ja.id = job_allocation_id and ja.assigned_supplier_id = auth.uid() and ja.status in ('confirmed', 'completed')
    )
  );

drop policy if exists supplier_payments_select on supplier_payments;
create policy supplier_payments_select on supplier_payments for select
  using (
    exists (select 1 from job_allocations ja where ja.id = job_allocation_id and ja.assigned_supplier_id = auth.uid())
    or (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('finance.view_invoices') or has_permission('finance.view_bank_details')))
  );

drop policy if exists supplier_payments_insert on supplier_payments;
create policy supplier_payments_insert on supplier_payments for insert
  with check (
    tenant_id = current_tenant_id()
    and has_permission('finance.pay_suppliers')
    and exists (
      select 1 from job_supplier_invoices jsi
      where jsi.job_allocation_id = supplier_payments.job_allocation_id and jsi.status = 'forwarded_to_accounting'
    )
  );

drop trigger if exists supplier_payments_recalc on supplier_payments;
drop function if exists recalc_supplier_payment_status();

drop function if exists accept_job_offer(uuid);
drop function if exists reject_job_offer(uuid);
drop table if exists job_offers;

alter table jobs
  drop column assigned_supplier_id,
  drop column offered_at,
  drop column responded_at,
  drop column confirmed_at,
  drop column completed_at,
  drop column supplier_invoice_note,
  drop column supplier_invoice_url,
  drop column supplier_payment_status;

-- -----------------------------------------------------------------------------
-- 6. New payment-status trigger, scoped to job_allocations.
-- -----------------------------------------------------------------------------

create or replace function recalc_allocation_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_amount numeric(12, 2);
  v_paid numeric(12, 2);
begin
  select amount into v_invoice_amount from job_supplier_invoices where job_allocation_id = new.job_allocation_id;
  select coalesce(sum(amount), 0) into v_paid from supplier_payments where job_allocation_id = new.job_allocation_id;

  update job_allocations
  set supplier_payment_status = case
    when v_invoice_amount is null then 'unpaid'
    when v_paid >= v_invoice_amount then 'paid'
    when v_paid > 0 then 'partially_paid'
    else 'unpaid'
  end
  where id = new.job_allocation_id;

  return new;
end;
$$;

create trigger supplier_payments_recalc_allocation
  after insert on supplier_payments
  for each row execute function recalc_allocation_payment_status();

-- -----------------------------------------------------------------------------
-- 7. New RPCs — line-for-line the same SECURITY DEFINER first-accept-wins
-- shape as the old accept_job_offer()/reject_job_offer(), just operating on
-- job_allocations/job_allocation_offers instead of jobs/job_offers.
-- -----------------------------------------------------------------------------

create function accept_job_allocation_offer(p_allocation_id uuid)
returns job_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer job_allocation_offers;
  result job_allocations;
begin
  update job_allocation_offers
  set status = 'accepted', responded_at = now()
  where job_allocation_id = p_allocation_id and supplier_id = auth.uid() and status = 'sent'
  returning * into v_offer;

  if v_offer.id is null then
    raise exception 'This job offer is no longer available.';
  end if;

  update job_allocations
  set assigned_supplier_id = auth.uid(),
      status = 'accepted_by_supplier',
      responded_at = now()
  where id = p_allocation_id and status = 'offered'
  returning * into result;

  if result.id is null then
    -- Someone else's accept call won the race between our two updates above
    -- — roll back our own offer flip so it doesn't show as falsely
    -- "accepted" to this supplier.
    update job_allocation_offers set status = 'sent', responded_at = null
    where job_allocation_id = p_allocation_id and supplier_id = auth.uid();
    raise exception 'Another supplier has already accepted this job.';
  end if;

  update job_allocation_offers
  set status = 'withdrawn', responded_at = now()
  where job_allocation_id = p_allocation_id and supplier_id <> auth.uid() and status = 'sent';

  return result;
end;
$$;

create function reject_job_allocation_offer(p_allocation_id uuid)
returns job_allocation_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  result job_allocation_offers;
  v_remaining int;
begin
  update job_allocation_offers
  set status = 'rejected', responded_at = now()
  where job_allocation_id = p_allocation_id and supplier_id = auth.uid() and status = 'sent'
  returning * into result;

  if result.id is null then
    raise exception 'This job offer is no longer available.';
  end if;

  select count(*) into v_remaining from job_allocation_offers where job_allocation_id = p_allocation_id and status = 'sent';

  if v_remaining = 0 then
    update job_allocations set status = 'rejected_by_supplier', responded_at = now()
    where id = p_allocation_id and status = 'offered';
  end if;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. jobs.status becomes a trigger-maintained rollup of its allocations — a
-- booking is only as far along as its least-advanced live leg-group. Frozen
-- once a booking is explicitly cancelled (cancelBookingAction sets
-- jobs.status = 'cancelled' directly before force-cancelling its
-- allocations, so this guard keeps it from bouncing back to 'unassigned').
-- -----------------------------------------------------------------------------

create or replace function recalc_job_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_current_status job_status;
  v_next_status job_status;
begin
  v_job_id := coalesce(new.job_id, old.job_id);

  select status into v_current_status from jobs where id = v_job_id;
  if v_current_status is null or v_current_status = 'cancelled' then
    return coalesce(new, old);
  end if;

  select status into v_next_status
  from job_allocations
  where job_id = v_job_id and status <> 'cancelled'
  order by
    case status
      when 'rejected_by_supplier' then 0
      when 'unassigned' then 1
      when 'offered' then 2
      when 'accepted_by_supplier' then 3
      when 'confirmed' then 4
      when 'completed' then 5
    end
  limit 1;

  update jobs set status = coalesce(v_next_status, 'unassigned') where id = v_job_id;

  return coalesce(new, old);
end;
$$;

create trigger job_allocations_recalc_job_status
  after insert or update of status or delete on job_allocations
  for each row execute function recalc_job_status();

-- -----------------------------------------------------------------------------
-- 9. RLS on the three new tables. job_allocations needs a direct
-- assigned_supplier_id = auth.uid() clause (exactly like jobs_select/
-- jobs_update used to have) because confirmAllocationAction/
-- completeAllocationAction/uploadSupplierInvoiceAction read and update this
-- table straight from the supplier's own session, not through a RPC — only
-- accept/reject go through the SECURITY DEFINER functions above.
-- job_allocation_legs/job_allocation_offers stay staff-only: the supplier
-- dashboard reads offers+legs exclusively via job_allocation_offer_view
-- below, and offer accept/reject is RPC-only.
-- -----------------------------------------------------------------------------

alter table job_allocations enable row level security;
alter table job_allocation_legs enable row level security;
alter table job_allocation_offers enable row level security;

create policy job_allocations_select on job_allocations for select
  using (
    assigned_supplier_id = auth.uid()
    or (
      tenant_id = current_tenant_id()
      and (is_master_admin() or has_permission('bookings.view') or has_permission('finance.pay_suppliers') or has_permission('finance.view_invoices'))
    )
  );
create policy job_allocations_insert on job_allocations for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from jobs j
      where j.id = job_id and j.tenant_id = current_tenant_id()
        and (j.created_by = auth.uid() or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier') or has_permission('bookings.edit'))
    )
  );
-- Mirrors jobs_update as amended by 0004_sales_can_dispatch_own_jobs.sql
-- (still live today) — the job's creator can always update its allocations,
-- on top of the supplier-direct and dispatch-permission clauses.
create policy job_allocations_update on job_allocations for update
  using (
    assigned_supplier_id = auth.uid()
    or exists (select 1 from jobs j where j.id = job_id and j.created_by = auth.uid())
    or (
      tenant_id = current_tenant_id()
      and (has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier') or has_permission('bookings.edit'))
    )
  );

create policy job_allocation_legs_select on job_allocation_legs for select
  using (exists (
    select 1 from job_allocations ja
    where ja.id = job_allocation_id
      and ja.tenant_id = current_tenant_id()
      and (is_master_admin() or has_permission('bookings.view') or has_permission('finance.pay_suppliers') or has_permission('finance.view_invoices'))
  ));
create policy job_allocation_legs_insert on job_allocation_legs for insert
  with check (exists (
    select 1 from job_allocations ja
    join jobs j on j.id = ja.job_id
    where ja.id = job_allocation_id
      and ja.tenant_id = current_tenant_id()
      and (j.created_by = auth.uid() or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier') or has_permission('bookings.edit'))
  ));
create policy job_allocation_legs_delete on job_allocation_legs for delete
  using (exists (
    select 1 from job_allocations ja
    join jobs j on j.id = ja.job_id
    where ja.id = job_allocation_id
      and ja.tenant_id = current_tenant_id()
      and (j.created_by = auth.uid() or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier') or has_permission('bookings.edit'))
  ));

create policy job_allocation_offers_select on job_allocation_offers for select
  using (
    tenant_id = current_tenant_id()
    and (is_master_admin() or has_permission('bookings.view') or has_permission('finance.pay_suppliers') or has_permission('finance.view_invoices'))
  );
create policy job_allocation_offers_insert on job_allocation_offers for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from job_allocations ja
      join jobs j on j.id = ja.job_id
      where ja.id = job_allocation_id and ja.tenant_id = current_tenant_id()
        and (j.created_by = auth.uid() or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier'))
    )
  );
create policy job_allocation_offers_update on job_allocation_offers for update
  using (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from job_allocations ja
      join jobs j on j.id = ja.job_id
      where ja.id = job_allocation_id and ja.tenant_id = current_tenant_id()
        and (j.created_by = auth.uid() or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier'))
    )
  );

-- -----------------------------------------------------------------------------
-- 10. job_allocation_offer_view — replaces job_offer_view as the supplier-
-- facing read surface. `legs` is scoped through job_allocation_legs to only
-- this allocation's own legs (the actual data-leak fix); the "first leg
-- preview" columns pick the allocation's own lowest-sequence leg via a
-- lateral join rather than a hardcoded sequence = 1, since an allocation
-- covering legs 2-3 must preview leg 2. Address exposure stays ungated
-- (matches the current, already-shipped job_offer_view behaviour) — only
-- customer identity (name/phone) stays gated on payment status.
-- -----------------------------------------------------------------------------

create view job_allocation_offer_view as
select
  jo.id as offer_id,
  jo.job_allocation_id,
  jo.status as offer_status,
  ja.status as allocation_status,
  j.region,
  ja.vehicle_notes,
  ja.agreed_cost,
  ja.currency,
  ja.supplier_payment_status,
  ja.manual_invoice_note,
  ja.manual_invoice_url,
  jo.offered_at,
  jo.responded_at,
  ja.confirmed_at,
  ja.completed_at,
  el.pickup_date,
  el.pickup_time,
  el.passenger_count,
  el.vehicle_type_id,
  q.currency as quote_currency,
  el.pickup_address,
  el.destination_address,
  case when ja.supplier_payment_status = 'paid' then c.contact_name else null end as customer_name,
  case when ja.supplier_payment_status = 'paid' then c.phone else null end as customer_phone,
  (
    select jsonb_agg(
      jsonb_build_object(
        'sequence', el2.sequence,
        'journey_type', el2.journey_type,
        'pickup_address', el2.pickup_address,
        'destination_address', el2.destination_address,
        'via_points', el2.via_points,
        'pickup_date', el2.pickup_date,
        'pickup_time', el2.pickup_time,
        'return_date', el2.return_date,
        'return_time', el2.return_time,
        'passenger_count', el2.passenger_count,
        'luggage_count', el2.luggage_count,
        'wheelchair_required', el2.wheelchair_required,
        'child_seats', el2.child_seats,
        'special_requirements', el2.special_requirements,
        'vehicle_types', case when vt2.name is not null then jsonb_build_object('name', vt2.name) else null end
      )
      order by el2.sequence
    )
    from job_allocation_legs jal2
    join enquiry_legs el2 on el2.id = jal2.enquiry_leg_id
    left join vehicle_types vt2 on vt2.id = el2.vehicle_type_id
    where jal2.job_allocation_id = ja.id
  ) as legs
from job_allocation_offers jo
join job_allocations ja on ja.id = jo.job_allocation_id
join jobs j on j.id = ja.job_id
join quotes q on q.id = j.quote_id
left join customers c on c.id = j.customer_id
left join lateral (
  select el0.*
  from job_allocation_legs jal0
  join enquiry_legs el0 on el0.id = jal0.enquiry_leg_id
  where jal0.job_allocation_id = ja.id
  order by el0.sequence
  limit 1
) el on true
where jo.supplier_id = auth.uid();

grant select on job_allocation_offer_view to authenticated;
