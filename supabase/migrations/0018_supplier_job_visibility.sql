-- =============================================================================
-- Global Transport CRM — Supplier sees full job logistics as soon as it's
-- offered, not only once confirmed.
--
-- Previously pickup/destination address stayed null until job status
-- reached confirmed/completed, matching a "don't reveal the route until the
-- supplier has committed" policy. That's been reversed: a supplier now
-- needs the full route, date/time and passenger count (already unconditional)
-- to decide whether to accept an offer at all — only the passenger's own
-- contact details (name/phone) stay gated on the job being confirmed AND
-- the supplier having been paid (unchanged from 0009_payment_legs.sql).
-- =============================================================================

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
  el.pickup_address,
  el.destination_address,
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
