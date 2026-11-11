-- =============================================================================
-- Cheap Mover CRM — the move model, step 1 of 2 (additive only).
--
-- A job is one move: pickup address -> destination address on a move date,
-- described by the same move details the website form captures on a lead
-- (0117_lead_move_details.sql) and done with a van of a given size. This
-- adds those columns everywhere a job is quoted, dispatched or shown:
--   - enquiry_legs: the 12 move-detail columns + van_size
--   - quote_versions / supplier_vehicles: van_size
--   - job_allocation_offer_view: move details + van size for suppliers
--
-- Nothing is removed here, so code still reading the old coach-hire columns
-- (passengers, luggage, vehicle types, return trips, seats) keeps working
-- until it's redeployed. 0119_drop_coach_columns.sql removes them.
-- =============================================================================

alter table enquiry_legs
  add column if not exists move_type text,
  add column if not exists property_type text,
  add column if not exists rooms text,
  add column if not exists estimated_boxes integer check (estimated_boxes is null or estimated_boxes >= 0),
  add column if not exists pickup_floor text,
  add column if not exists destination_floor text,
  add column if not exists lift_available boolean,
  add column if not exists packing_needed boolean,
  add column if not exists dismantling_needed boolean,
  add column if not exists assembly_needed boolean,
  add column if not exists storage_needed boolean,
  add column if not exists fragile_items boolean,
  add column if not exists van_size text;

alter table quote_versions add column if not exists van_size text;

alter table supplier_vehicles add column if not exists van_size text;
update supplier_vehicles set van_size = vehicle_type where van_size is null;

alter type document_type add value if not exists 'inventory_list';

-- Same view as before (0054_job_allocations.sql and later), with the move
-- details and van size appended — existing columns keep their position, as
-- create or replace view requires.
create or replace view job_allocation_offer_view as
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
        'vehicle_types', case when vt2.name is not null then jsonb_build_object('name', vt2.name) else null end,
        'move_type', el2.move_type,
        'property_type', el2.property_type,
        'rooms', el2.rooms,
        'estimated_boxes', el2.estimated_boxes,
        'pickup_floor', el2.pickup_floor,
        'destination_floor', el2.destination_floor,
        'lift_available', el2.lift_available,
        'packing_needed', el2.packing_needed,
        'dismantling_needed', el2.dismantling_needed,
        'assembly_needed', el2.assembly_needed,
        'storage_needed', el2.storage_needed,
        'fragile_items', el2.fragile_items,
        'van_size', el2.van_size
      )
      order by el2.sequence
    )
    from job_allocation_legs jal2
    join enquiry_legs el2 on el2.id = jal2.enquiry_leg_id
    left join vehicle_types vt2 on vt2.id = el2.vehicle_type_id
    where jal2.job_allocation_id = ja.id
  ) as legs,
  el.move_type,
  el.van_size
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
