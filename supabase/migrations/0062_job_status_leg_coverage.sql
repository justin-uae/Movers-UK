-- =============================================================================
-- Fixes recalc_job_status() (0054_job_allocations.sql): it rolled a job's
-- overall status up to the LEAST-ADVANCED status among its EXISTING
-- allocations only — it never checked whether every leg of the trip was
-- actually covered by one. A 3-leg trip with a single allocation created
-- (and completed) for leg 1, while legs 2-3 were never allocated to any
-- supplier at all, rolled the whole booking up to 'completed', since
-- 'completed' was trivially the only (and therefore "least advanced") status
-- in the set. Bookings then appeared in the Completed list while most of
-- the trip hadn't even been dispatched.
--
-- Fix: any enquiry leg with no live (non-cancelled) allocation covering it
-- caps the job's status at 'unassigned' (unless the worst live allocation is
-- 'rejected_by_supplier', which is more informative and stays). This mirrors
-- treating an uncovered leg as an implicit unassigned allocation.
-- =============================================================================

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
  v_has_uncovered_legs boolean;
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

  select exists (
    select 1
    from enquiry_legs el
    join quotes q on q.enquiry_id = el.enquiry_id
    join jobs j on j.quote_id = q.id
    where j.id = v_job_id
      and not exists (
        select 1
        from job_allocation_legs jal
        join job_allocations ja on ja.id = jal.job_allocation_id
        where jal.enquiry_leg_id = el.id and ja.status <> 'cancelled'
      )
  ) into v_has_uncovered_legs;

  if v_has_uncovered_legs and (v_next_status is null or v_next_status <> 'rejected_by_supplier') then
    v_next_status := 'unassigned';
  end if;

  update jobs set status = coalesce(v_next_status, 'unassigned') where id = v_job_id;

  return coalesce(new, old);
end;
$$;

-- One-time backfill: recompute every non-cancelled job's status under the
-- corrected rule above, so bookings already mis-classified as further along
-- than they really are get corrected immediately rather than waiting for
-- their next allocation change to re-trigger the recalc.
with worst_alloc as (
  select distinct on (job_id) job_id, status
  from job_allocations
  where status <> 'cancelled'
  order by
    job_id,
    case status
      when 'rejected_by_supplier' then 0
      when 'unassigned' then 1
      when 'offered' then 2
      when 'accepted_by_supplier' then 3
      when 'confirmed' then 4
      when 'completed' then 5
    end
),
uncovered_jobs as (
  select distinct j.id as job_id
  from jobs j
  join quotes q on q.id = j.quote_id
  join enquiry_legs el on el.enquiry_id = q.enquiry_id
  where not exists (
    select 1
    from job_allocation_legs jal
    join job_allocations ja on ja.id = jal.job_allocation_id
    where jal.enquiry_leg_id = el.id and ja.status <> 'cancelled'
  )
),
affected as (
  select id from jobs where status <> 'cancelled'
)
update jobs j
set status = case
  when uj.job_id is not null and coalesce(wa.status, 'unassigned') <> 'rejected_by_supplier' then 'unassigned'
  else coalesce(wa.status, 'unassigned')
end
from affected
left join worst_alloc wa on wa.job_id = affected.id
left join uncovered_jobs uj on uj.job_id = affected.id
where j.id = affected.id;
