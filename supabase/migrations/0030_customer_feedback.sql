-- =============================================================================
-- Global Transport CRM — Real Customer Experience module (Part 25, §153,
-- projectContext.md).
--
-- On job completion, request one NPS-style question (0-10) + optional
-- comment from the customer via a public, no-login link (same public_token
-- pattern as /q/[token]). A detractor score (<=6) auto-creates a follow-up
-- Task (reusing the Tasks module — a "follow-up case" is just a task here,
-- not a new entity). Deliberately out of scope for this pass: a separate
-- 5-star satisfaction scale, a real external review-platform hand-off,
-- response-time tracking, manual resend, reminder nudges, multi-question
-- surveys, and a distinct "retention" metric.
-- =============================================================================

create type feedback_category as enum ('promoter', 'passive', 'detractor');

create table customer_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_id uuid not null unique references jobs(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  score smallint check (score between 0 and 10),
  category feedback_category,
  comment text,
  follow_up_task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_feedback_tenant_idx on customer_feedback(tenant_id, submitted_at);
create index customer_feedback_public_token_idx on customer_feedback(public_token);

alter table customer_feedback enable row level security;

-- Only ever written by the admin (service-role) client — from
-- completeJobAction (request creation) and the anonymous /feedback/[token]
-- submission action, exactly like /q/[token]'s quote-decision flow. Staff
-- only ever read it, gated the same as every other workspace module.
create policy customer_feedback_select on customer_feedback for select
  using (tenant_id = current_tenant_id() and has_permission('general.workspace_access'));

-- ---------------------------------------------------------------------------
-- 9th fixed email template: feedback_request. Same mechanism as
-- 0021_lead_assigned_email_and_branding.sql's addition of "lead_assigned" —
-- redefine default_email_templates() with the 8 existing tuples unchanged
-- plus this new one, then backfill-insert it for every existing tenant.
-- ---------------------------------------------------------------------------

create or replace function default_email_templates()
returns table(key text, subject text, body_html text)
language sql
immutable
as $$
  values
    (
      'quote_sent',
      'Your quote {{quote_number}} from {{brand_name}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Hi {{customer_name}},</p>
  <p>Please find your quote <b>{{quote_number}}</b> from {{brand_name}} below.</p>
  <p><b>Total: {{currency}} {{selling_price}}</b></p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View &amp; Respond to Quote</a></p>
  <p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link: {{link}}</p>
  <p>Thanks,<br />{{brand_name}}</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'quote_accepted',
      'Quote {{quote_number}} accepted by {{customer_name}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Good news — <b>{{customer_name}}</b> has accepted quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'quote_rejected',
      'Quote {{quote_number}} rejected by {{customer_name}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{customer_name}}</b> has rejected quote <b>{{quote_number}}</b>.</p>
  <p><b>Reason:</b> {{reason}}</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'job_offered',
      'New job offer — {{pickup_date}} · {{region}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Hi {{supplier_name}},</p>
  <p>You have a new job offer:</p>
  <p><b>Region:</b> {{region}}<br />
     <b>Date:</b> {{pickup_date}} {{pickup_time}}<br />
     <b>Passengers:</b> {{passenger_count}}</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View &amp; Respond</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'job_accepted_by_supplier',
      '{{supplier_name}} accepted the job for {{quote_number}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has accepted the job for quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'job_rejected_by_supplier',
      '{{supplier_name}} declined the job for {{quote_number}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has declined the job for quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'supplier_invoice_submitted',
      'Invoice submitted by {{supplier_name}} for {{quote_number}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has submitted an invoice for quote <b>{{quote_number}}</b>: <b>{{currency}} {{amount}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review Job</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'lead_assigned',
      'New lead assigned to you — {{pickup}} to {{destination}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Hi {{staff_name}},</p>
  <p>A new order has just been assigned to you via {{brand_name}}.</p>
  <p><b>Source:</b> {{source}}<br />
     <b>Pickup:</b> {{pickup}}<br />
     <b>Destination:</b> {{destination}}<br />
     <b>Travel date:</b> {{travel_date}}<br />
     <b>Passengers:</b> {{passenger_count}}<br />
     <b>Vehicle requested:</b> {{vehicle_requested}}</p>
  <p>{{notes}}</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View My Leads</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    ),
    (
      'feedback_request',
      'How did we do, {{customer_name}}?',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Hi {{customer_name}},</p>
  <p>Thank you for travelling with {{brand_name}}. We'd love to know how it went — it only takes a moment.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Share Your Feedback</a></p>
  <p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link: {{link}}</p>
  <p>Thanks,<br />{{brand_name}}</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">{{brand_name}} in Association with Global Bus Rental Worldwide Group Transport</p>
</div>$q$
    )
$$;

insert into email_templates (tenant_id, key, subject, body_html)
select t.id, d.key, d.subject, d.body_html
from tenants t
cross join default_email_templates() d
where d.key = 'feedback_request'
on conflict (tenant_id, key) do nothing;
