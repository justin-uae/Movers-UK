-- =============================================================================
-- Global Transport CRM — Revert 0031_supplier_public_applications.sql.
--
-- The "Join as a Supplier" self-service application feature (public landing
-- page, application form, applied_publicly tracking, and the separate
-- supplier-portal domain) has been removed from the app. This undoes the one
-- schema change and the two email templates 0031 added, so the live database
-- matches the reverted code. Run this once in the Supabase SQL editor.
-- =============================================================================

alter table suppliers drop column if exists applied_publicly;

delete from email_templates
where key in ('supplier_application_approved', 'supplier_application_rejected');

-- Restore default_email_templates() to the 9-tuple version from
-- 0030_customer_feedback.sql (drops the 2 tuples 0031 added), so any tenant
-- created from now on doesn't get seeded with templates for a feature that
-- no longer exists.
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
