-- =============================================================================
-- Global Transport CRM — Multi-supplier dispatch (first-accept-wins)
--
-- Splits job assignment into two layers:
--   jobs          aggregate state (unassigned/offered/accepted_by_supplier/...)
--   job_offers    per-supplier state (sent/accepted/rejected/withdrawn)
--
-- A job can now be offered to several suppliers at once. jobs.assigned_supplier_id
-- only gets populated once one of them accepts — accept_job_offer() is an
-- atomic first-accept-wins guard (same atomic-UPDATE-guard style as
-- claim_lead()/release_lead()): the winner's UPDATE succeeds, every other
-- live offer for that job is auto-withdrawn, and a supplier who loses the
-- race gets a clean "already accepted by someone else" error instead of
-- silently double-assigning the job.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. job_offers
-- -----------------------------------------------------------------------------

create type job_offer_status as enum ('sent', 'accepted', 'rejected', 'withdrawn');

create table job_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  status job_offer_status not null default 'sent',
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (job_id, supplier_id)
);
create index job_offers_job_id_idx on job_offers(job_id);
create index job_offers_supplier_id_idx on job_offers(supplier_id, status);

alter table job_offers enable row level security;

create policy job_offers_select on job_offers for select
  using (
    supplier_id = auth.uid()
    or (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.view')))
  );

-- Staff writes (creating/withdrawing offers) go through the normal
-- RLS-scoped client, gated the same way jobs_update already is: the job's
-- creator, or a dispatch permission holder. Supplier writes (accept/reject)
-- only ever happen through the SECURITY DEFINER RPCs below, which bypass
-- RLS and do their own auth.uid() checks — mirrors claim_lead()/release_lead().
create policy job_offers_insert on job_offers for insert
  with check (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from jobs j
      where j.id = job_id
        and j.tenant_id = current_tenant_id()
        and (j.created_by = auth.uid() or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier'))
    )
  );
create policy job_offers_update on job_offers for update
  using (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from jobs j
      where j.id = job_id
        and j.tenant_id = current_tenant_id()
        and (j.created_by = auth.uid() or has_permission('dispatch.send_manual') or has_permission('dispatch.reassign_supplier'))
    )
  );

-- -----------------------------------------------------------------------------
-- 2. accept_job_offer() — first-accept-wins
-- -----------------------------------------------------------------------------

create or replace function accept_job_offer(p_job_id uuid)
returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer job_offers;
  result jobs;
begin
  update job_offers
  set status = 'accepted', responded_at = now()
  where job_id = p_job_id and supplier_id = auth.uid() and status = 'sent'
  returning * into v_offer;

  if v_offer.id is null then
    raise exception 'This job offer is no longer available.';
  end if;

  update jobs
  set assigned_supplier_id = auth.uid(),
      status = 'accepted_by_supplier',
      responded_at = now()
  where id = p_job_id and status = 'offered'
  returning * into result;

  if result.id is null then
    -- Someone else's accept_job_offer() call won the race between our two
    -- updates above — roll back our own offer flip so it doesn't show as
    -- falsely "accepted" to this supplier.
    update job_offers set status = 'sent', responded_at = null
    where job_id = p_job_id and supplier_id = auth.uid();
    raise exception 'Another supplier has already accepted this job.';
  end if;

  update job_offers
  set status = 'withdrawn', responded_at = now()
  where job_id = p_job_id and supplier_id <> auth.uid() and status = 'sent';

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. reject_job_offer() — if it was the last live offer, flip the job back
-- so Dispatch knows to re-offer it.
-- -----------------------------------------------------------------------------

create or replace function reject_job_offer(p_job_id uuid)
returns job_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  result job_offers;
  v_remaining int;
begin
  update job_offers
  set status = 'rejected', responded_at = now()
  where job_id = p_job_id and supplier_id = auth.uid() and status = 'sent'
  returning * into result;

  if result.id is null then
    raise exception 'This job offer is no longer available.';
  end if;

  select count(*) into v_remaining from job_offers where job_id = p_job_id and status = 'sent';

  if v_remaining = 0 then
    update jobs set status = 'rejected_by_supplier', responded_at = now()
    where id = p_job_id and status = 'offered';
  end if;

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. job_offer_view — rewritten to key off job_offers.supplier_id rather
-- than jobs.assigned_supplier_id, since a supplier may hold a live offer on
-- a job that never ends up assigned to them. Address/customer contact
-- reveal is unchanged (job confirmed/completed).
-- -----------------------------------------------------------------------------

drop view if exists job_offer_view;

create view job_offer_view as
select
  jo.id as offer_id,
  jo.job_id,
  jo.status as offer_status,
  j.status as job_status,
  j.region,
  jo.offered_at,
  jo.responded_at,
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
from job_offers jo
join jobs j on j.id = jo.job_id
join quotes q on q.id = j.quote_id
join enquiries e on e.id = q.enquiry_id
left join enquiry_legs el on el.enquiry_id = e.id and el.sequence = 1
left join customers c on c.id = j.customer_id
where jo.supplier_id = auth.uid();

grant select on job_offer_view to authenticated;
