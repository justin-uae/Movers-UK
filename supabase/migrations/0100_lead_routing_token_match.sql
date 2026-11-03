-- route_lead() (0006_multiregion_leads.sql) auto-assigns a new lead to a
-- staff member whose user_regions.region appears as a substring of the
-- lead's pickup_text/destination_text — but a plain `ilike '%' || region ||
-- '%'` requires the ENTIRE region string to appear verbatim. That works for
-- single-word regions ("France", "Spain") since country names often do
-- appear literally in an address, but regions stored as "City, Country"
-- ("Tokyo, Japan", "London, UK", "New York, NY, USA") essentially never
-- match real-world text, which never contains that exact comma-punctuated
-- phrase — e.g. "Haneda Airport / Delegation Hotel in Tokyo CBD" contains
-- "Tokyo" but not "Tokyo, Japan", so a lead headed straight for a configured
-- Tokyo region fell through to open_pool every time. This was silent: there
-- is no audit trail for a trigger-level routing decision, so it looked like
-- routing simply "didn't happen" for whole categories of leads (observed
-- worst on email-intake leads, whose AI-extracted pickup/destination text is
-- freer-form than a website form's structured address, but the bug affects
-- every intake channel equally).
--
-- Fix: split each region on commas and match if ANY individual part (a
-- single city or country name) appears in the lead's text, instead of
-- requiring the full compound string. Word-boundary regex (`~*` with `\m`/
-- `\M` anchors) is used instead of plain ILIKE so this doesn't trade the old
-- false-negative for a new false-positive — a naive substring match on a
-- short part like "NY" would otherwise match inside unrelated words (e.g.
-- "Germany" contains "ny"). Parts under 3 characters are dropped entirely
-- for the same reason. Pure function replacement — no data/schema change,
-- safe to apply independently of a code deploy.

create or replace function lead_route_region_matches(haystack text, region text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    bool_or(
      haystack ~* ('\m' || regexp_replace(trim(part), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M')
    ),
    false
  )
  from unnest(string_to_array(region, ',')) as part
  where length(trim(part)) >= 3;
$$;

create or replace function route_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distinct_candidates int;
  v_candidate uuid;
begin
  if new.status <> 'new' then
    return new;
  end if;

  select count(distinct ur.user_id) into v_distinct_candidates
  from user_regions ur
  join profiles p on p.id = ur.user_id
  where p.tenant_id = new.tenant_id
    and p.status = 'active'
    and (
      (new.pickup_text is not null and lead_route_region_matches(new.pickup_text, ur.region))
      or (new.destination_text is not null and lead_route_region_matches(new.destination_text, ur.region))
    );

  if v_distinct_candidates = 1 then
    select ur.user_id into v_candidate
    from user_regions ur
    join profiles p on p.id = ur.user_id
    where p.tenant_id = new.tenant_id
      and p.status = 'active'
      and (
        (new.pickup_text is not null and lead_route_region_matches(new.pickup_text, ur.region))
        or (new.destination_text is not null and lead_route_region_matches(new.destination_text, ur.region))
      )
    order by (
      select count(*) from leads l2
      where l2.assigned_user_id = ur.user_id and l2.status in ('new', 'assigned', 'contacted')
    ) asc
    limit 1;
  end if;

  if v_candidate is not null then
    new.assigned_user_id := v_candidate;
    new.status := 'assigned';
    new.claimed_at := now();
  else
    new.status := 'open_pool';
  end if;

  return new;
end;
$$;
