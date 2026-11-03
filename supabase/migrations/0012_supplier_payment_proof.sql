-- =============================================================================
-- Global Transport CRM — Payment-proof attachment for supplier payments +
-- job_offer_view prefill amount for the supplier invoice form.
--
-- supplier_payments already models "one bank-transfer event" per row
-- (partial payments supported); attaching proof to that same row (rather
-- than a new table) keeps the 1:1 relationship simple. Reuses the exact
-- private-bucket-per-owner-folder pattern from job-invoices (0008).
-- =============================================================================

alter table supplier_payments
  add column if not exists proof_storage_path text,
  add column if not exists proof_file_name text;

insert into storage.buckets (id, name, public)
values ('supplier-payment-proofs', 'supplier-payment-proofs', false)
on conflict (id) do nothing;

-- Folder-per-uploader (the accountant, not the supplier, uploads these) —
-- keyed by the paying staff member's own id, mirroring job-invoices'
-- folder-per-uploader convention.
drop policy if exists supplier_payment_proofs_storage_insert on storage.objects;
create policy supplier_payment_proofs_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'supplier-payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists supplier_payment_proofs_storage_read on storage.objects;
create policy supplier_payment_proofs_storage_read on storage.objects for select
  using (
    bucket_id = 'supplier-payment-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or has_permission('finance.view_invoices')
      or has_permission('finance.pay_suppliers')
      or is_master_admin()
    )
  );

-- job_offer_view: add supplier_estimated_cost + quote_currency so the
-- supplier's invoice-upload form can be pre-filled with the company's own
-- cost estimate captured at quote-creation time (still editable — the
-- supplier's actual invoice can legitimately differ).
drop view if exists job_offer_view;

create view job_offer_view as
select
  jo.id as offer_id,
  jo.job_id,
  jo.status as offer_status,
  j.status as job_status,
  j.region,
  j.supplier_payment_status,
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
  qv.supplier_estimated_cost,
  q.currency as quote_currency,
  case when j.status in ('confirmed', 'completed') then el.pickup_address else null end as pickup_address,
  case when j.status in ('confirmed', 'completed') then el.destination_address else null end as destination_address,
  case when j.status in ('confirmed', 'completed') and j.supplier_payment_status = 'paid' then c.contact_name else null end as customer_name,
  case when j.status in ('confirmed', 'completed') and j.supplier_payment_status = 'paid' then c.phone else null end as customer_phone
from job_offers jo
join jobs j on j.id = jo.job_id
join quotes q on q.id = j.quote_id
left join quote_versions qv on qv.id = q.current_version_id
join enquiries e on e.id = q.enquiry_id
left join enquiry_legs el on el.enquiry_id = e.id and el.sequence = 1
left join customers c on c.id = j.customer_id
where jo.supplier_id = auth.uid();

grant select on job_offer_view to authenticated;
