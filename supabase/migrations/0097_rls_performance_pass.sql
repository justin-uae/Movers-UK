-- Same fix as 0096_leads_select_rls_performance.sql, applied to every other
-- policy built on can_view_assignment() (plus jobs_select and lead_edits_select,
-- which follow the identical per-row-constant-function pattern) — all were
-- equally exposed to the same 57014 statement-timeout risk as the leads
-- table grows (Quotes, Dispatch, Confirmed/Completed/Lost Booking, and the
-- quote detail page's versions/decisions/events panels all read through one
-- or more of these). Pure performance rewrite: every `using`/`with check`
-- clause below is logically identical to its current definition — the only
-- change is wrapping per-query-constant calls (current_tenant_id(),
-- is_master_admin(), has_permission(...), auth.uid()) in `(select ...)` so
-- Postgres computes them once per statement instead of once per row.
-- Latest authoritative source of each policy, in case this ever needs
-- re-deriving: enquiries_select/enquiry_legs_select/quotes_select/
-- quote_versions_select/quote_decisions_select/quote_events_select —
-- 0009_payment_legs.sql; jobs_select — 0091_ai_role_bookings_view.sql;
-- lead_edits_select — 0076_lead_edits.sql; leads_update/enquiries_update —
-- 0002_sales_crm.sql (never redefined since).

drop policy if exists enquiries_select on enquiries;
create policy enquiries_select on enquiries for select
  using (
    tenant_id = (select current_tenant_id())
    and (
      (select has_permission('finance.view_invoices'))
      or (select is_master_admin())
      or (select has_permission('enquiries.view_all'))
      or assigned_user_id = (select auth.uid())
      or (
        (select has_permission('enquiries.view_team'))
        and exists (
          select 1 from profiles p1
          join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
          where p1.id = (select auth.uid()) and p2.id = enquiries.assigned_user_id
        )
      )
    )
  );

drop policy if exists enquiry_legs_select on enquiry_legs;
create policy enquiry_legs_select on enquiry_legs for select
  using (exists (
    select 1 from enquiries e
    where e.id = enquiry_legs.enquiry_id
      and (
        (select has_permission('finance.view_invoices'))
        or (select is_master_admin())
        or (select has_permission('enquiries.view_all'))
        or e.assigned_user_id = (select auth.uid())
        or (
          (select has_permission('enquiries.view_team'))
          and exists (
            select 1 from profiles p1
            join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
            where p1.id = (select auth.uid()) and p2.id = e.assigned_user_id
          )
        )
      )
  ));

drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select
  using (
    tenant_id = (select current_tenant_id())
    and (
      (select has_permission('finance.view_invoices'))
      or exists (
        select 1 from enquiries e
        where e.id = quotes.enquiry_id
          and (
            (select is_master_admin())
            or (select has_permission('enquiries.view_all'))
            or e.assigned_user_id = (select auth.uid())
            or (
              (select has_permission('enquiries.view_team'))
              and exists (
                select 1 from profiles p1
                join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
                where p1.id = (select auth.uid()) and p2.id = e.assigned_user_id
              )
            )
          )
      )
    )
  );

drop policy if exists quote_versions_select on quote_versions;
create policy quote_versions_select on quote_versions for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_versions.quote_id
      and (
        (select has_permission('finance.view_invoices'))
        or (select is_master_admin())
        or (select has_permission('enquiries.view_all'))
        or e.assigned_user_id = (select auth.uid())
        or (
          (select has_permission('enquiries.view_team'))
          and exists (
            select 1 from profiles p1
            join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
            where p1.id = (select auth.uid()) and p2.id = e.assigned_user_id
          )
        )
      )
  ));

drop policy if exists quote_decisions_select on quote_decisions;
create policy quote_decisions_select on quote_decisions for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_decisions.quote_id
      and (
        (select has_permission('finance.view_invoices'))
        or (select is_master_admin())
        or (select has_permission('enquiries.view_all'))
        or e.assigned_user_id = (select auth.uid())
        or (
          (select has_permission('enquiries.view_team'))
          and exists (
            select 1 from profiles p1
            join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
            where p1.id = (select auth.uid()) and p2.id = e.assigned_user_id
          )
        )
      )
  ));

drop policy if exists quote_events_select on quote_events;
create policy quote_events_select on quote_events for select
  using (exists (
    select 1 from quotes q
    join enquiries e on e.id = q.enquiry_id
    where q.id = quote_events.quote_id
      and (
        (select has_permission('finance.view_invoices'))
        or (select is_master_admin())
        or (select has_permission('enquiries.view_all'))
        or e.assigned_user_id = (select auth.uid())
        or (
          (select has_permission('enquiries.view_team'))
          and exists (
            select 1 from profiles p1
            join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
            where p1.id = (select auth.uid()) and p2.id = e.assigned_user_id
          )
        )
      )
  ));

drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select
  using (
    tenant_id = (select current_tenant_id())
    and (
      (select is_master_admin())
      or (select has_permission('bookings.view'))
      or (select has_permission('finance.pay_suppliers'))
      or (select has_permission('finance.view_invoices'))
      or (
        (select has_permission('bookings.view_own'))
        and exists (
          select 1 from quotes q
          join enquiries e on e.id = q.enquiry_id
          where q.id = jobs.quote_id and e.assigned_user_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists lead_edits_select on lead_edits;
create policy lead_edits_select on lead_edits for select
  using (
    tenant_id = (select current_tenant_id())
    and exists (
      select 1 from leads l
      where l.id = lead_edits.lead_id
        and (
          (select is_master_admin())
          or (select has_permission('enquiries.view_all'))
          or l.assigned_user_id = (select auth.uid())
          or (
            (select has_permission('enquiries.view_team'))
            and exists (
              select 1 from profiles p1
              join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
              where p1.id = (select auth.uid()) and p2.id = l.assigned_user_id
            )
          )
          or l.status = 'open_pool'
        )
    )
  );

-- Write policies too — lower urgency (an update/insert targets one row, not
-- a whole-table scan) but same wasted-recomputation cost, and consistent
-- with the rest of this pass while we're here.
drop policy if exists leads_update on leads;
create policy leads_update on leads for update
  using (
    tenant_id = (select current_tenant_id())
    and (
      assigned_user_id = (select auth.uid())
      or (select has_permission('enquiries.edit'))
      or (select has_permission('enquiries.reassign'))
      or (select has_permission('enquiries.return_to_pool'))
    )
  );

drop policy if exists enquiries_update on enquiries;
create policy enquiries_update on enquiries for update
  using (
    tenant_id = (select current_tenant_id())
    and (
      assigned_user_id = (select auth.uid())
      or (select has_permission('enquiries.edit'))
      or (select has_permission('enquiries.reassign'))
    )
  );
