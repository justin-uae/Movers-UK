-- =============================================================================
-- Global Transport CRM — Transactional email templates.
--
-- Seven fixed, per-tenant, editable templates (subject + HTML body with
-- {{variable}} placeholders substituted at send time by
-- lib/emailTemplates.ts). Rows are seeded once per tenant here (and via
-- seed_tenant_defaults() for every tenant created from now on) — staff only
-- ever UPDATE the subject/body of an existing row, never create/delete one,
-- so there's no insert/delete policy.
-- =============================================================================

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  subject text not null,
  body_html text not null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);
create index email_templates_tenant_id_idx on email_templates(tenant_id);

alter table email_templates enable row level security;

create policy email_templates_select on email_templates for select
  using (tenant_id = current_tenant_id());

create policy email_templates_update on email_templates for update
  using (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('admin.manage_templates')));

-- ---------------------------------------------------------------------------
-- Shared source of the 7 default (key, subject, body_html) rows — used both
-- to backfill every existing tenant below and by seed_tenant_defaults() for
-- every tenant created from now on, so the HTML only needs to live in one
-- place.
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
</div>$q$
    ),
    (
      'quote_accepted',
      'Quote {{quote_number}} accepted by {{customer_name}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Good news — <b>{{customer_name}}</b> has accepted quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>
</div>$q$
    ),
    (
      'quote_rejected',
      'Quote {{quote_number}} rejected by {{customer_name}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{customer_name}}</b> has rejected quote <b>{{quote_number}}</b>.</p>
  <p><b>Reason:</b> {{reason}}</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>
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
</div>$q$
    ),
    (
      'job_accepted_by_supplier',
      '{{supplier_name}} accepted the job for {{quote_number}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has accepted the job for quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>
</div>$q$
    ),
    (
      'job_rejected_by_supplier',
      '{{supplier_name}} declined the job for {{quote_number}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has declined the job for quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>
</div>$q$
    ),
    (
      'supplier_invoice_submitted',
      'Invoice submitted by {{supplier_name}} for {{quote_number}}',
      $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has submitted an invoice for quote <b>{{quote_number}}</b>: <b>{{currency}} {{amount}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review Job</a></p>
</div>$q$
    )
$$;

insert into email_templates (tenant_id, key, subject, body_html)
select t.id, d.key, d.subject, d.body_html
from tenants t
cross join default_email_templates() d
on conflict (tenant_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Every tenant created from now on gets the same 7 templates too.
-- ---------------------------------------------------------------------------

create or replace function seed_tenant_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_role_id uuid;
  role_def record;
begin
  for role_def in
    select * from (values
      ('Master Admin', true, (select array_agg(key) from permissions)),
      ('Sales User', true, array[
        'enquiries.view_own', 'enquiries.add', 'enquiries.claim_open_leads', 'enquiries.return_to_pool',
        'quotes.create', 'quotes.send', 'quotes.view_selling_price',
        'bookings.view', 'dispatch.send_manual', 'dispatch.transfer_supplier_invoice',
        'suppliers.add', 'suppliers.send_jobs',
        'general.workspace_access'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices', 'finance.record_payments', 'finance.pay_suppliers'
      ]),
      ('Read-Only User', true, array[
        'enquiries.view_all', 'quotes.view_selling_price', 'bookings.view', 'general.workspace_access'
      ])
    ) as t(role_name, is_system, perm_keys)
  loop
    insert into roles (tenant_id, name, is_system)
    values (new.id, role_def.role_name, role_def.is_system)
    returning id into new_role_id;

    insert into role_permissions (role_id, permission_id)
    select new_role_id, p.id from permissions p where p.key = any(role_def.perm_keys);
  end loop;

  insert into email_templates (tenant_id, key, subject, body_html)
  select new.id, key, subject, body_html from default_email_templates();

  return new;
end;
$$;
