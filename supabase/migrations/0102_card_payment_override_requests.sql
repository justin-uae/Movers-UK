-- Card payment is normally never offered on a quote at/above
-- STRIPE_PRICE_THRESHOLD (lib/quoteMoney.ts, currently £1000 GBP-converted)
-- — a real card-processing/fraud-risk limit, not just a default. This adds
-- an explicit, auditable override path instead of just lifting the limit:
-- staff can request Master Admin approval on a specific quote, and only
-- once approved does that one quote's current version get `stripe: true`
-- added to its payment_methods (bank transfer stays available too — this
-- only ever ADDS an option, never removes one).

create table card_payment_override_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  requested_by uuid references profiles(id) on delete set null,
  reason text,
  -- Snapshot of the GBP-converted amount at request time (rates/the quote's
  -- own price can both move later) — what the Master Admin actually judged
  -- the request against stays legible even if either changes afterwards.
  amount_gbp numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index card_payment_override_requests_quote_id_idx on card_payment_override_requests(quote_id, created_at desc);
create index card_payment_override_requests_tenant_status_idx on card_payment_override_requests(tenant_id, status);

alter table card_payment_override_requests enable row level security;

create policy card_payment_override_requests_select on card_payment_override_requests for select
  using (tenant_id = current_tenant_id() and (is_master_admin() or has_permission('quotes.create')));

create policy card_payment_override_requests_insert on card_payment_override_requests for insert
  with check (tenant_id = current_tenant_id() and has_permission('quotes.create'));

-- Only Master Admin decides — an independent sign-off is the entire point,
-- not the requester (or any other staff holding quotes.create) approving
-- their own ask.
create policy card_payment_override_requests_update on card_payment_override_requests for update
  using (tenant_id = current_tenant_id() and is_master_admin());

-- Extends the quote Timeline (quote_events, see its check constraint's
-- history in 0002_sales_crm.sql/0095_quote_reassignment_event.sql) with the
-- three states of this request, so the request/approval/rejection shows up
-- right alongside "Quote sent"/"Customer viewed" etc. — the same place
-- staff already look for a quote's history, not a separate panel.
alter table quote_events drop constraint if exists quote_events_event_check;
alter table quote_events add constraint quote_events_event_check
  check (event in (
    'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled', 'partially_paid', 'paid', 'reassigned',
    'card_payment_requested', 'card_payment_approved', 'card_payment_rejected'
  ));

-- Email templates: the request, to every Master Admin; the decision, back
-- to whoever asked. Same additive-redefine + per-tenant backfill pattern as
-- every prior email_templates change (e.g. 0071_pending_reapproval_flow.sql)
-- — this function also seeds every brand-new tenant's full template set
-- (see the trigger using it, 0020_email_templates.sql), so it has to carry
-- forward every existing tuple (last fully redefined in
-- 0075_payment_received_button_and_rejection_reason_emails.sql) verbatim,
-- not just the 2 new ones, or a new tenant from here on would silently
-- never get the other 15.
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
<p><b>Reason:</b> {{reason}}</p>
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
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Booking Details</a></p>
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
    ),
    (
      'job_reapproval_required',
      'Action needed: job for {{quote_number}} has changed',
      $q$<p>Hi {{supplier_name}},</p>
<p>A job you already accepted — quote <b>{{quote_number}}</b> with {{brand_name}} — has been edited and needs your OK again before it goes ahead.</p>
<p><b>Reason:</b> {{reason}}</p>
<p>{{changes_summary}}</p>
<p>{{payout_note}}</p>
<p>Please review and approve or reject it — if you reject, you'll be asked to give a reason.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review &amp; Respond</a></p>$q$
    ),
    (
      'job_reapproval_rejected',
      '{{supplier_name}} rejected the edited job for {{quote_number}}',
      $q$<p><b>{{supplier_name}}</b> was asked to re-approve an edited job for quote <b>{{quote_number}}</b> and has rejected it.</p>
<p><b>Reason:</b> {{reason}}</p>
<p>The job is back on Dispatch, ready to offer to another supplier.</p>
<p>{{refund_note}}</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Open Dispatch</a></p>$q$
    ),
    (
      'card_payment_override_requested',
      'Approval needed: card payment for {{quote_number}}',
      $q$<p>Hi {{admin_name}},</p>
<p><b>{{requested_by}}</b> is asking to offer card payment on quote <b>{{quote_number}}</b> — normally bank-transfer-only at this amount.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;background-color:#f8fafc;">
  <tr>
    <td width="50%" style="padding:16px 20px;text-align:center;border-right:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Amount (GBP)</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">£{{amount}}</div>
    </td>
    <td width="50%" style="padding:16px 20px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Reason given</div>
      <div style="margin-top:4px;font-size:14px;font-weight:700;color:#1e293b;">{{reason}}</div>
    </td>
  </tr>
</table>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review Request</a></p>$q$
    ),
    (
      'card_payment_override_decided',
      'Your card payment request for {{quote_number}} was {{decision}}',
      $q$<p>Hi {{requested_by}},</p>
<p>Your request to offer card payment on quote <b>{{quote_number}}</b> was <b>{{decision}}</b> by {{decided_by}}.</p>
<p>{{decision_note}}</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>$q$
    )
$$;

insert into email_templates (tenant_id, key, subject, body_html)
select t.id, d.key, d.subject, d.body_html
from tenants t
cross join default_email_templates() d
where d.key in ('card_payment_override_requested', 'card_payment_override_decided')
on conflict (tenant_id, key) do nothing;
