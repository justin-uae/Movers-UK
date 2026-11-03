-- =============================================================================
-- Global Transport CRM — Reusable branded header/footer for outbound emails.
--
-- lib/emailBranding.ts now wraps every template's body_html in a shared,
-- styled envelope (thin accent line, brand name, headline, a divider line,
-- then the standard footer) at send time, in renderAndSendTemplate — one
-- place, applied to every template automatically, rather than each
-- template carrying its own copy of the "{{brand_name}} in Association
-- with..." footer line.
--
-- This migration strips that now-redundant outer wrapper/footer out of the
-- default template bodies, and — for the templates that show a handful of
-- key/value facts (quote number & total, job region/date/passengers, lead
-- details, invoice amount) — replaces the old bold-label-then-<br> list
-- with a bordered, lined detail box matching the reference design (thin
-- borders between rows, rounded outer border). Same additive-redefine
-- pattern as every prior email_templates change: 0020, 0021, 0030, 0036.
-- Since this is a content change to templates that already exist for every
-- tenant, not a new key, it's pushed onto existing rows with an UPDATE. If
-- any tenant has hand-edited one of these 10 templates already, this
-- overwrites that edit back to the new default; re-apply any custom
-- wording after running this.
-- =============================================================================

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
    )
$$;

update email_templates et
set subject = d.subject, body_html = d.body_html
from default_email_templates() d
where et.key = d.key;
