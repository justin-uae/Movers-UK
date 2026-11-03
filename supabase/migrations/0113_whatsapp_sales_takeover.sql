-- =============================================================================
-- WhatsApp for sales users: per-chat ownership, live "take over" popups during
-- admin-set hours, and pausing the AI while a human has the chat.
--
-- * whatsapp_conversations — one row per contact (tenant + wa_id). owner_id
--   is the sales user the chat belongs to (taken over from a popup, or
--   auto-assigned because they already quoted that phone number);
--   ai_paused stops the 360dialog webhook's AI from replying until the
--   owner hands the chat back. The webhook bumps last_inbound_* on every
--   inbound message, which is what the popup listens for over realtime.
-- * tenants.whatsapp_takeover_* — the hours/days (in a set timezone) during
--   which unowned chats pop up for sales users and can be taken over.
-- * whatsapp_messages visibility narrows from "anyone with workspace access"
--   to Master Admin (everything) + the chat's owner.
-- =============================================================================

alter table tenants
  add column whatsapp_takeover_enabled boolean not null default false,
  add column whatsapp_takeover_start time not null default '09:00',
  add column whatsapp_takeover_end time not null default '18:00',
  -- ISO weekdays, 1 = Monday ... 7 = Sunday.
  add column whatsapp_takeover_days smallint[] not null default '{1,2,3,4,5,6}',
  add column whatsapp_takeover_timezone text not null default 'Asia/Dubai';

create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  wa_id text not null,
  contact_name text,
  owner_id uuid references profiles(id) on delete set null,
  owner_source text check (owner_source in ('takeover', 'quoted', 'admin')),
  owned_at timestamptz,
  ai_paused boolean not null default false,
  last_inbound_at timestamptz,
  last_inbound_preview text,
  -- Latest message either way — kept by the trigger below so the WhatsApp
  -- page can list every chat without scanning the whole message log.
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, wa_id)
);
create index whatsapp_conversations_owner_idx on whatsapp_conversations(owner_id);
create index whatsapp_conversations_recent_idx on whatsapp_conversations(tenant_id, last_message_at desc nulls last);

-- Every logged message (webhook, AI, staff reply, auto-quote) refreshes its
-- conversation's summary, creating the row if this is the first message.
create or replace function whatsapp_messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into whatsapp_conversations (tenant_id, brand_id, customer_id, wa_id, last_message_at, last_message_preview, last_message_direction)
  values (new.tenant_id, new.brand_id, new.customer_id, new.wa_id, new.created_at, left(new.body, 280), new.direction)
  on conflict (tenant_id, wa_id) do update set
    last_message_at = excluded.last_message_at,
    last_message_preview = excluded.last_message_preview,
    last_message_direction = excluded.last_message_direction,
    customer_id = coalesce(whatsapp_conversations.customer_id, excluded.customer_id),
    brand_id = coalesce(whatsapp_conversations.brand_id, excluded.brand_id)
  where whatsapp_conversations.last_message_at is null or excluded.last_message_at >= whatsapp_conversations.last_message_at;
  return new;
end;
$$;

create trigger whatsapp_messages_touch_conversation
  after insert on whatsapp_messages
  for each row execute function whatsapp_messages_touch_conversation();

-- Holds enquiries.claim_open_leads (role or per-user grant, not revoked) —
-- the same "is a sales user" test as lib/leadAssignees.ts.
create or replace function is_whatsapp_agent(p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = p_profile_id and p.status = 'active' and not p.is_master_admin
      and (
        exists (
          select 1 from user_permission_overrides upo join permissions perm on perm.id = upo.permission_id
          where upo.user_id = p.id and perm.key = 'enquiries.claim_open_leads' and upo.effect = 'grant'
        )
        or (
          exists (
            select 1 from role_permissions rp join permissions perm on perm.id = rp.permission_id
            where rp.role_id = p.role_id and perm.key = 'enquiries.claim_open_leads'
          )
          and not exists (
            select 1 from user_permission_overrides upo join permissions perm on perm.id = upo.permission_id
            where upo.user_id = p.id and perm.key = 'enquiries.claim_open_leads' and upo.effect = 'revoke'
          )
        )
      )
  );
$$;

-- True when the tenant's takeover window is open right now.
create or replace function whatsapp_takeover_open(p_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select t.whatsapp_takeover_enabled
      and extract(isodow from (now() at time zone t.whatsapp_takeover_timezone))::smallint = any(t.whatsapp_takeover_days)
      and case
        when t.whatsapp_takeover_start <= t.whatsapp_takeover_end then
          (now() at time zone t.whatsapp_takeover_timezone)::time >= t.whatsapp_takeover_start
          and (now() at time zone t.whatsapp_takeover_timezone)::time < t.whatsapp_takeover_end
        -- Overnight window, e.g. 20:00 -> 06:00.
        else
          (now() at time zone t.whatsapp_takeover_timezone)::time >= t.whatsapp_takeover_start
          or (now() at time zone t.whatsapp_takeover_timezone)::time < t.whatsapp_takeover_end
      end
    from tenants t where t.id = p_tenant_id
  ), false);
$$;

-- The sales user who most recently (human-)quoted this WhatsApp number, if
-- any — matched on the customer's whatsapp or phone, digits only, so
-- "+971 50 123 4567" matches wa_id "971501234567".
create or replace function whatsapp_quote_owner(p_tenant_id uuid, p_wa_id text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select q.created_by
  from quotes q
  join customers c on c.id = q.customer_id
  where q.tenant_id = p_tenant_id
    and not q.ai_generated
    and q.created_by is not null
    and (
      regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') = p_wa_id
      or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = p_wa_id
    )
    and is_whatsapp_agent(q.created_by)
  order by q.created_at desc
  limit 1;
$$;

alter table whatsapp_conversations enable row level security;

-- Master Admin sees every chat; a sales user sees their own, plus unowned
-- ones only while the takeover window is open (that's what lets the popup
-- arrive over realtime). All writes go through server actions / the
-- webhook using the service-role client, so there are no write policies.
create policy whatsapp_conversations_select on whatsapp_conversations for select
  using (
    tenant_id = current_tenant_id()
    and (
      is_master_admin()
      or owner_id = auth.uid()
      or (owner_id is null and whatsapp_takeover_open(tenant_id) and is_whatsapp_agent(auth.uid()))
    )
  );

drop policy whatsapp_messages_select on whatsapp_messages;
create policy whatsapp_messages_select on whatsapp_messages for select
  using (
    tenant_id = current_tenant_id()
    and (
      is_master_admin()
      or exists (
        select 1 from whatsapp_conversations wc
        where wc.tenant_id = whatsapp_messages.tenant_id and wc.wa_id = whatsapp_messages.wa_id and wc.owner_id = auth.uid()
      )
    )
  );

alter publication supabase_realtime add table whatsapp_conversations;

-- Backfill one conversation per contact already in the log, auto-assigned
-- to whoever last quoted that number.
insert into whatsapp_conversations (
  tenant_id, brand_id, customer_id, wa_id, contact_name, last_inbound_at, last_inbound_preview,
  last_message_at, last_message_preview, last_message_direction
)
select distinct on (m.tenant_id, m.wa_id)
  m.tenant_id, m.brand_id, m.customer_id, m.wa_id,
  coalesce(nullif(c.company_name, ''), c.contact_name),
  (select max(i.created_at) from whatsapp_messages i where i.tenant_id = m.tenant_id and i.wa_id = m.wa_id and i.direction = 'inbound'),
  null,
  m.created_at, left(m.body, 280), m.direction
from whatsapp_messages m
left join customers c on c.id = m.customer_id
order by m.tenant_id, m.wa_id, m.created_at desc
on conflict (tenant_id, wa_id) do nothing;

update whatsapp_conversations wc
set owner_id = o.owner_id, owner_source = 'quoted', owned_at = now()
from (select id, whatsapp_quote_owner(tenant_id, wa_id) as owner_id from whatsapp_conversations) o
where o.id = wc.id and o.owner_id is not null and wc.owner_id is null;
