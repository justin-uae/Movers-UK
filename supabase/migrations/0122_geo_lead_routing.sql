-- Geography-based lead routing.
--
-- route_lead() (0100_lead_routing_token_match.sql) matched a user's region
-- NAME as a word inside the lead's address text, which misses real matches
-- ("China" never appears in "Grand Hyatt Shanghai") and over-matches compound
-- regions ("New York, NY, USA" grabbed every address containing "USA").
--
-- Now each lead endpoint is resolved with Google before insert
-- (lib/geoLookup.ts → country code, first-level admin area, lat/lng) and each
-- user region is classified once (country / admin_area / locality). Matching:
--   country region    — same country code                        → level 1
--   admin_area region — same country code + same admin area (ci)  → level 2
--   locality region   — haversine distance ≤ radius_km (def. 50)  → level 3
--   region unclassified, or the endpoint has no country code      → old word match, level 1
-- Pickup and destination both count (higher level wins); only matches at the
-- highest level found are kept, and exactly one distinct active user gets the
-- lead. Zero or several → open_pool, as before. A routing_note records why.
--
-- Every column is nullable, so with unclassified regions and leads without
-- geo fields the outcome is identical to 0100's.
--
-- DEPLOY ORDER: apply this BEFORE deploying the matching code — the new
-- intake code writes the new lead columns, and inserts fail without them.

alter table leads add column if not exists pickup_country_code text;
alter table leads add column if not exists pickup_admin_area text;
alter table leads add column if not exists pickup_lat double precision;
alter table leads add column if not exists pickup_lng double precision;
alter table leads add column if not exists destination_country_code text;
alter table leads add column if not exists destination_admin_area text;
alter table leads add column if not exists destination_lat double precision;
alter table leads add column if not exists destination_lng double precision;
alter table leads add column if not exists routing_note text;

alter table user_regions add column if not exists geo_type text
  check (geo_type in ('country', 'admin_area', 'locality'));
alter table user_regions add column if not exists country_code text;
alter table user_regions add column if not exists admin_area text;
alter table user_regions add column if not exists radius_km double precision;
alter table user_regions add column if not exists geo_checked_at timestamptz;

create or replace function geo_haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Match level (0 = no match) of one user region against one lead endpoint.
create or replace function lead_endpoint_region_level(
  p_text text,
  p_country_code text,
  p_admin_area text,
  p_lat double precision,
  p_lng double precision,
  r_region text,
  r_geo_type text,
  r_country_code text,
  r_admin_area text,
  r_lat double precision,
  r_lng double precision,
  r_radius_km double precision
)
returns int
language sql
immutable
as $$
  select case
    -- Unclassified region (or a continent-style one), or the endpoint's lookup
    -- failed: the original word match.
    when r_geo_type is null or p_country_code is null
         or (r_geo_type = 'locality' and (r_lat is null or r_lng is null or p_lat is null or p_lng is null)) then
      case when p_text is not null and lead_route_region_matches(p_text, r_region) then 1 else 0 end
    when r_geo_type = 'country' then
      case when upper(p_country_code) = upper(r_country_code) then 1 else 0 end
    when r_geo_type = 'admin_area' then
      case when upper(p_country_code) = upper(r_country_code)
                and lower(coalesce(p_admin_area, '')) = lower(coalesce(r_admin_area, ''))
                and p_admin_area is not null then 2 else 0 end
    when r_geo_type = 'locality' then
      case when geo_haversine_km(p_lat, p_lng, r_lat, r_lng) <= coalesce(r_radius_km, 50) then 3 else 0 end
    else 0
  end;
$$;

-- Every (active user, region) pair matching this lead, with its match level.
create or replace function lead_region_matches(l leads)
returns table (user_id uuid, full_name text, region text, lvl int)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.full_name, m.region, m.lvl
  from (
    select ur.user_id, p.full_name, ur.region,
      greatest(
        case when l.pickup_text is null and l.pickup_country_code is null then 0 else
          lead_endpoint_region_level(l.pickup_text, l.pickup_country_code, l.pickup_admin_area, l.pickup_lat, l.pickup_lng,
            ur.region, ur.geo_type, ur.country_code, ur.admin_area, ur.lat, ur.lng, ur.radius_km) end,
        case when l.destination_text is null and l.destination_country_code is null then 0 else
          lead_endpoint_region_level(l.destination_text, l.destination_country_code, l.destination_admin_area, l.destination_lat, l.destination_lng,
            ur.region, ur.geo_type, ur.country_code, ur.admin_area, ur.lat, ur.lng, ur.radius_km) end
      ) as lvl
    from user_regions ur
    join profiles p on p.id = ur.user_id
    where p.tenant_id = l.tenant_id
      and p.status = 'active'
  ) m
  where m.lvl > 0;
$$;

create or replace function route_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top_level int;
  v_distinct_candidates int := 0;
  v_candidate uuid;
  v_candidate_name text;
  v_candidate_regions text;
  v_all_regions text;
begin
  if new.status <> 'new' then
    return new;
  end if;

  select max(m.lvl) into v_top_level from lead_region_matches(new) m;

  if v_top_level is not null then
    select count(distinct m.user_id), string_agg(distinct m.region, ', ')
      into v_distinct_candidates, v_all_regions
    from lead_region_matches(new) m
    where m.lvl = v_top_level;

    if v_distinct_candidates = 1 then
      select m.user_id, max(m.full_name), string_agg(distinct m.region, '", "')
        into v_candidate, v_candidate_name, v_candidate_regions
      from lead_region_matches(new) m
      where m.lvl = v_top_level
      group by m.user_id;
    end if;
  end if;

  if v_candidate is not null then
    new.assigned_user_id := v_candidate;
    new.status := 'assigned';
    new.claimed_at := now();
    new.routing_note := 'Auto-assigned to ' || coalesce(v_candidate_name, 'a colleague')
      || ' — matches their region "' || v_candidate_regions || '"';
  else
    new.status := 'open_pool';
    new.routing_note := case
      when v_distinct_candidates > 1 then
        'Open pool — ' || v_distinct_candidates || ' people cover this area (' || v_all_regions || ')'
      when new.pickup_text is null and new.destination_text is null then
        'Open pool — no pickup or destination to match against regions'
      else
        'Open pool — no one''s region covers this pickup or destination'
    end;
  end if;

  return new;
end;
$$;
