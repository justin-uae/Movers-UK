-- Complex Booking dispatch: job_offer_view previously joined only
-- enquiry_legs.sequence = 1, so a supplier assigned a multi-leg job could
-- only ever see the first leg — every leg after it was invisible to them
-- (a job is 1:1 with a quote/enquiry, so one supplier is expected to see the
-- whole multi-leg itinerary, not just its first segment). The existing
-- single-leg columns stay exactly as they were (still used for the
-- supplier's job list's compact one-line preview); a new `legs` column
-- carries every leg as JSON, ordered by sequence, for the job detail page.
create or replace view job_offer_view as
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
  case when j.status in ('confirmed', 'completed') and j.supplier_payment_status = 'paid' then c.phone else null end as customer_phone,
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
    from enquiry_legs el2
    left join vehicle_types vt2 on vt2.id = el2.vehicle_type_id
    where el2.enquiry_id = e.id
  ) as legs
from job_offers jo
join jobs j on j.id = jo.job_id
join quotes q on q.id = j.quote_id
left join quote_versions qv on qv.id = q.current_version_id
join enquiries e on e.id = q.enquiry_id
left join enquiry_legs el on el.enquiry_id = e.id and el.sequence = 1
left join customers c on c.id = j.customer_id
where jo.supplier_id = auth.uid();

grant select on job_offer_view to authenticated;
