-- Root cause of leads showing empty under load (Open Pool returning 0 with
-- a 57014 statement timeout, even on a trivial "select id, status" with no
-- joins at all — proven by running the real query as a real user session).
--
-- leads_select (0003_operations.sql) calls can_view_assignment(assigned_user_id)
-- per row, which internally calls is_master_admin() and has_permission(...)
-- — both SECURITY DEFINER functions whose arguments never vary per row
-- (there's exactly one answer to "am I a master admin" / "do I hold
-- enquiries.view_all" per query, not per row). Postgres does not inline or
-- cache SECURITY DEFINER function calls across rows, so with ~1,000 leads
-- in the table, every row re-ran several multi-table EXISTS subqueries
-- (role_permissions/permissions/user_permission_overrides) that already had
-- the same answer the previous row got.
--
-- The fix (Postgres/Supabase's documented RLS performance pattern): wrap
-- every per-query-constant call — current_tenant_id(), is_master_admin(),
-- has_permission(...), auth.uid() — in `(select ...)` so Postgres can
-- compute it once per statement (an InitPlan) instead of once per row. Only
-- the genuinely per-row comparisons (assigned_user_id = ..., status = ...)
-- stay as plain row-level predicates. This is can_view_assignment()'s exact
-- same logic, inlined here so the wrapping actually takes effect — wrapping
-- the opaque can_view_assignment(assigned_user_id) call itself wouldn't
-- help, since its argument does vary per row.
drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  using (
    tenant_id = (select current_tenant_id())
    and (
      (select is_master_admin())
      or (select has_permission('enquiries.view_all'))
      or assigned_user_id = (select auth.uid())
      or (
        (select has_permission('enquiries.view_team'))
        and exists (
          select 1 from profiles p1
          join profiles p2 on p1.team_id = p2.team_id and p1.team_id is not null
          where p1.id = (select auth.uid()) and p2.id = leads.assigned_user_id
        )
      )
      or status = 'open_pool'
    )
  );
