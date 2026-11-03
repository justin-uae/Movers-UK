-- 0067 gave booking_amendments a select and an insert policy, but
-- amendBookingAction also does one UPDATE after the fact — stamping
-- customer_notified_at/supplier_notified_at once the notification emails
-- have (or haven't) gone out. With no update policy, RLS silently denies
-- that update (0 rows affected, no error) — so those two columns stay null
-- forever regardless of whether the emails actually sent, which is exactly
-- what masked a real "customer never got notified" bug from being visible
-- in the amendment's own history. Same condition as the insert policy: the
-- same people allowed to create an amendment may update its own
-- notification stamps.
create policy booking_amendments_update on booking_amendments for update
  using (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.amend')))
  with check (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.amend')));
