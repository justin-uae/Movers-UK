-- =============================================================================
-- Post-payment booking amendments.
--
-- Lets a Master Admin or the booking's own owner (Sales User assigned to the
-- enquiry) edit an already-accepted/paid booking — journey details (pickup,
-- destination, date, time, passengers, luggage), an optional price
-- adjustment charged (or credited) to the customer, and an optional
-- adjustment to what's owed to the supplier. Every amendment is logged as
-- its own row (booking_amendments) with a reason and a field-level diff —
-- that row IS the "full version history" for journey/adjustment changes,
-- the same way quote_versions already is for pricing.
--
-- Deliberately reuses existing infrastructure rather than inventing new
-- payment/invoice machinery:
--   - A price increase creates a new quote_versions row (deposit fields
--     cleared, so the new balance is simply "pay the new total in full" —
--     avoids a stale deposit_percentage silently hiding the new balance)
--     and repoints quotes.current_version_id — the existing invoice PDF,
--     the public quote page and CustomerPaymentsPage's balance calc all
--     already read live off current_version_id, so they pick this up with
--     no further change.
--   - A price decrease that leaves the customer overpaid creates a pending
--     `refunds` row — the exact table/flow cancelBookingAction already uses
--     for a cancellation refund, processed via the existing
--     processRefundAction.
--   - A supplier-side adjustment is an append-only ledger
--     (job_allocation_adjustments) rather than mutating job_allocations.
--     agreed_cost (which dispatch deliberately locks once confirmed, to
--     avoid quietly renegotiating an agreed rate) — SupplierPaymentsPage
--     sums these on top of the submitted invoice amount to get the real
--     balance, and a negative running total reads as "refund owed from
--     the supplier" rather than a payment still due.
-- =============================================================================

create table booking_amendments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  job_allocation_id uuid references job_allocations(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  reason text not null,
  -- { field_name: { from: ..., to: ... } } — only the fields that actually changed.
  changes jsonb not null default '{}'::jsonb,
  previous_quote_version_id uuid references quote_versions(id) on delete set null,
  new_quote_version_id uuid references quote_versions(id) on delete set null,
  customer_charge_amount numeric(12, 2),
  customer_charge_currency text,
  refund_id uuid references refunds(id) on delete set null,
  supplier_adjustment_amount numeric(12, 2),
  supplier_adjustment_note text,
  customer_notified_at timestamptz,
  supplier_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index booking_amendments_quote_id_idx on booking_amendments(quote_id, created_at desc);
create index booking_amendments_tenant_id_idx on booking_amendments(tenant_id);

alter table booking_amendments enable row level security;

create policy booking_amendments_select on booking_amendments for select
  using (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.view')));

create policy booking_amendments_insert on booking_amendments for insert
  with check (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.amend')));

-- ---------------------------------------------------------------------------
-- Supplier-payout adjustments — append-only, can be negative. A supplier
-- sees their own (same visibility rule as job_supplier_invoices); staff see
-- any they can already view bookings/invoices for.
-- ---------------------------------------------------------------------------

create table job_allocation_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_allocation_id uuid not null references job_allocations(id) on delete cascade,
  amendment_id uuid references booking_amendments(id) on delete set null,
  amount numeric(12, 2) not null,
  reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index job_allocation_adjustments_allocation_idx on job_allocation_adjustments(job_allocation_id);

alter table job_allocation_adjustments enable row level security;

create policy job_allocation_adjustments_select on job_allocation_adjustments for select
  using (
    tenant_id = current_tenant_id()
    and (
      is_master_admin()
      or has_permission('bookings.view')
      or has_permission('finance.view_invoices')
      or exists (
        select 1 from job_allocations ja
        where ja.id = job_allocation_adjustments.job_allocation_id and ja.assigned_supplier_id = auth.uid()
      )
    )
  );

create policy job_allocation_adjustments_insert on job_allocation_adjustments for insert
  with check (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('bookings.amend')));

-- ---------------------------------------------------------------------------
-- Permission catalog entry + backfill onto the current tenant's Sales User
-- role (Master Admin already holds every key). Same pattern as 0050.
-- ---------------------------------------------------------------------------

insert into permissions (key, category, description) values
  ('bookings.amend', 'Bookings & Dispatch', 'Edit an already-accepted/paid booking''s journey details, customer charge or supplier payout')
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'bookings.amend'
where r.name = 'Sales User'
on conflict (role_id, permission_id) do nothing;

-- quotes_update (0002, extended by 0013) allows the quote's own
-- created_by or one of a fixed set of permissions — none of which
-- reliably covers "the enquiry's current owner", since a lead/enquiry can
-- be reassigned after the quote was first created. Add bookings.amend as
-- one more way in, scoped to exactly the amendment action (it still can't
-- touch a quote it has no other reason to see, since quotes_select is
-- unchanged) — same condition list as 0013_finance_can_mark_quotes_paid.sql
-- plus this one addition.
drop policy if exists quotes_update on quotes;
create policy quotes_update on quotes for update
  using (
    tenant_id = current_tenant_id()
    and (
      created_by = auth.uid()
      or has_permission('quotes.edit')
      or has_permission('quotes.send')
      or has_permission('quotes.cancel')
      or has_permission('finance.record_payments')
      or has_permission('bookings.amend')
    )
  );

-- ---------------------------------------------------------------------------
-- Email templates — booking_amended (customer) and job_amended (supplier).
-- Same additive-redefine pattern as every prior email_templates change
-- (0020, 0021, 0030, 0036, 0038, 0046): redefine the full function with the
-- two new keys appended, then insert only those two new rows for tenants
-- that already exist (seed_tenant_defaults() covers future tenants).
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
      $q$<p>Hi {{customer_name}},</p>
<p>Please find your quote from {{brand_name}} below.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;background-color:#f8fafc;">
  <tr>
    <td width="50%" style="padding:16px 20px;text-align:center;border-right:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Quote Number</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{quote_number}}</div>
    </td>
    <td width="50%" style="padding:16px 20px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Total</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{currency}} {{selling_price}}</div>
    </td>
  </tr>
</table>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View &amp; Respond to Quote</a></p>
<p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link:<br /><a href="{{link}}" style="color:#f97316;">{{link}}</a></p>
<p>Thanks,<br />{{brand_name}}</p>$q$
    ),
    (
      'quote_accepted',
      'Quote {{quote_number}} accepted by {{customer_name}}',
      $q$<p>Good news — <b>{{customer_name}}</b> has accepted quote <b>{{quote_number}}</b>.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>$q$
    ),
    (
      'quote_rejected',
      'Quote {{quote_number}} rejected by {{customer_name}}',
      $q$<p><b>{{customer_name}}</b> has rejected quote <b>{{quote_number}}</b>.</p>
<p><b>Reason:</b> {{reason}}</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>$q$
    ),
    (
      'job_offered',
      'New job offer — {{pickup_date}} · {{region}}',
      $q$<p>Hi {{supplier_name}},</p>
<p>You have a new job offer:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Region</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{region}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Date</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{pickup_date}} {{pickup_time}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Passengers</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{passenger_count}}</td>
  </tr>
</table>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View &amp; Respond</a></p>$q$
    ),
    (
      'job_accepted_by_supplier',
      '{{supplier_name}} accepted the job for {{quote_number}}',
      $q$<p><b>{{supplier_name}}</b> has accepted the job for quote <b>{{quote_number}}</b>.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>$q$
    ),
    (
      'job_rejected_by_supplier',
      '{{supplier_name}} declined the job for {{quote_number}}',
      $q$<p><b>{{supplier_name}}</b> has declined the job for quote <b>{{quote_number}}</b>.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>$q$
    ),
    (
      'supplier_invoice_submitted',
      'Invoice submitted by {{supplier_name}} for {{quote_number}}',
      $q$<p><b>{{supplier_name}}</b> has submitted an invoice for quote <b>{{quote_number}}</b>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;background-color:#f8fafc;">
  <tr>
    <td width="50%" style="padding:16px 20px;text-align:center;border-right:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Quote Number</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{quote_number}}</div>
    </td>
    <td width="50%" style="padding:16px 20px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Amount</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{currency}} {{amount}}</div>
    </td>
  </tr>
</table>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review Job</a></p>$q$
    ),
    (
      'lead_assigned',
      'New lead assigned to you — {{pickup}} to {{destination}}',
      $q$<p>Hi {{staff_name}},</p>
<p>A new order has just been assigned to you via {{brand_name}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Source</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{source}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Pickup</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{pickup}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Destination</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{destination}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Travel date</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{travel_date}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Passengers</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{passenger_count}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Vehicle requested</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{vehicle_requested}}</td>
  </tr>
</table>
<p>{{notes}}</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View My Leads</a></p>$q$
    ),
    (
      'feedback_request',
      'How did we do, {{customer_name}}?',
      $q$<p>Hi {{customer_name}},</p>
<p>Thank you for travelling with {{brand_name}}. We'd love to know how it went — it only takes a moment.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Share Your Feedback</a></p>
<p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link: {{link}}</p>
<p>Thanks,<br />{{brand_name}}</p>$q$
    ),
    (
      'staff_invited',
      'You''re invited to join {{brand_name}}',
      $q$<p>Hi {{user_name}},</p>
<p>You've been invited to join the {{brand_name}} team on Global Transport CRM.</p>
<p>Set your password to finish setting up your account and sign in:</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Set Password &amp; Log In</a></p>
<p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link: {{link}}</p>
<p>Thanks,<br />{{brand_name}}</p>$q$
    ),
    (
      'supplier_invited',
      'You''re invited to join {{brand_name}}''s supplier network',
      $q$<p>Hi {{supplier_name}},</p>
<p>You've been invited to join the {{brand_name}} supplier network on Global Transport CRM.</p>
<p>Set your password to finish setting up your account and start receiving job offers:</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Set Password &amp; Log In</a></p>
<p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link: {{link}}</p>
<p>Thanks,<br />{{brand_name}}</p>$q$
    ),
    (
      'payment_received',
      'Payment received — {{quote_number}}',
      $q$<p>Hi {{customer_name}},</p>
<p>Thank you — we've received your payment for quote <b>{{quote_number}}</b> from {{brand_name}}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;background-color:#f8fafc;">
  <tr>
    <td width="50%" style="padding:16px 20px;text-align:center;border-right:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Amount Received</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{currency}} {{amount}}</div>
    </td>
    <td width="50%" style="padding:16px 20px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Balance Remaining</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{currency}} {{balance}}</div>
    </td>
  </tr>
</table>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>
<p>Thanks,<br />{{brand_name}}</p>$q$
    ),
    (
      'booking_amended',
      'Your booking {{quote_number}} has been updated',
      $q$<p>Hi {{customer_name}},</p>
<p>Your booking <b>{{quote_number}}</b> with {{brand_name}} has been updated.</p>
<p><b>Reason:</b> {{reason}}</p>
<p>{{changes_summary}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;background-color:#f8fafc;">
  <tr>
    <td width="50%" style="padding:16px 20px;text-align:center;border-right:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Price Adjustment</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{currency}} {{adjustment_amount}}</div>
    </td>
    <td width="50%" style="padding:16px 20px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Balance Due</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{currency}} {{new_balance}}</div>
    </td>
  </tr>
</table>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Updated Booking</a></p>
<p>Thanks,<br />{{brand_name}}</p>$q$
    ),
    (
      'job_amended',
      'Job update for {{quote_number}}',
      $q$<p>Hi {{supplier_name}},</p>
<p>The job for quote <b>{{quote_number}}</b> with {{brand_name}} has been updated.</p>
<p><b>Reason:</b> {{reason}}</p>
<p>{{changes_summary}}</p>
<p>{{payout_note}}</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>$q$
    )
$$;

insert into email_templates (tenant_id, key, subject, body_html)
select t.id, d.key, d.subject, d.body_html
from tenants t
cross join default_email_templates() d
where d.key in ('booking_amended', 'job_amended')
on conflict (tenant_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Future tenants get bookings.amend on Sales User and both new templates.
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
        'quotes.create', 'quotes.send', 'quotes.view_selling_price', 'quotes.cancel',
        'bookings.view', 'bookings.cancel', 'bookings.amend', 'dispatch.send_manual', 'dispatch.transfer_supplier_invoice',
        'finance.view_commissions', 'complaints.manage', 'incidents.manage', 'general.workspace_access'
      ]),
      ('Finance Manager', true, array[
        'finance.view_invoices', 'finance.record_payments', 'finance.pay_suppliers',
        'finance.view_commissions', 'finance.approve_commissions', 'finance.view_profit', 'finance.process_refunds'
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
