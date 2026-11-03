-- =============================================================================
-- Global Transport CRM — Lead-assignment notification email + brand
-- association footer on every transactional email.
--
-- 1. Adds an 8th fixed template, "lead_assigned", sent to the staff member a
--    lead auto-routes to (route_lead()) so they know a new order landed
--    without having to notice it in the Leads list themselves.
-- 2. Appends a "{{brand_name}} in Association with Global Bus Rental
--    Worldwide Group Transport" footer line to all 8 template bodies.
--    default_email_templates() is redefined with the new bodies (so every
--    tenant created from now on gets them); existing tenants' rows are
--    updated in place, but only where body_html still exactly matches the
--    prior default — a tenant that already customised a template keeps its
--    own wording untouched.
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
    )
$$;

-- ---------------------------------------------------------------------------
-- Retrofit existing tenants: add the footer to any of the original 7
-- templates that are still exactly the old default (customised ones are left
-- alone), then seed the new "lead_assigned" row for every existing tenant.
-- ---------------------------------------------------------------------------

update email_templates
set body_html = d.body_html, updated_at = now()
from default_email_templates() d
where email_templates.key = d.key
  and email_templates.key <> 'lead_assigned'
  and email_templates.body_html = (
    case email_templates.key
      when 'quote_sent' then $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Hi {{customer_name}},</p>
  <p>Please find your quote <b>{{quote_number}}</b> from {{brand_name}} below.</p>
  <p><b>Total: {{currency}} {{selling_price}}</b></p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View &amp; Respond to Quote</a></p>
  <p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link: {{link}}</p>
  <p>Thanks,<br />{{brand_name}}</p>
</div>$q$
      when 'quote_accepted' then $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Good news — <b>{{customer_name}}</b> has accepted quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>
</div>$q$
      when 'quote_rejected' then $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{customer_name}}</b> has rejected quote <b>{{quote_number}}</b>.</p>
  <p><b>Reason:</b> {{reason}}</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Quote</a></p>
</div>$q$
      when 'job_offered' then $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p>Hi {{supplier_name}},</p>
  <p>You have a new job offer:</p>
  <p><b>Region:</b> {{region}}<br />
     <b>Date:</b> {{pickup_date}} {{pickup_time}}<br />
     <b>Passengers:</b> {{passenger_count}}</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View &amp; Respond</a></p>
</div>$q$
      when 'job_accepted_by_supplier' then $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has accepted the job for quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>
</div>$q$
      when 'job_rejected_by_supplier' then $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has declined the job for quote <b>{{quote_number}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Job</a></p>
</div>$q$
      when 'supplier_invoice_submitted' then $q$<div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
  <p><b>{{supplier_name}}</b> has submitted an invoice for quote <b>{{quote_number}}</b>: <b>{{currency}} {{amount}}</b>.</p>
  <p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review Job</a></p>
</div>$q$
      else null
    end
  );

insert into email_templates (tenant_id, key, subject, body_html)
select t.id, d.key, d.subject, d.body_html
from tenants t
cross join default_email_templates() d
where d.key = 'lead_assigned'
on conflict (tenant_id, key) do nothing;
