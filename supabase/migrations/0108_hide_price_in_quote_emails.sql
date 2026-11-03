-- Customer-facing sales emails no longer show the price.
--
-- A customer who sees the price in their inbox has no reason to open the
-- quote page — and the quote page is where they accept and pay. So the
-- quote email ("quote_sent") and follow-up reminders 1-3 (the ones that
-- showed an amount) now point them to the quote page instead; the PDF,
-- which also shows the price, is no longer attached either (see
-- createQuoteAction, resendQuoteEmailAction, lib/aiAutoQuote.ts). Payment
-- emails — the payment reminder, receipts — keep their amounts: by then
-- the customer has already seen and accepted the price.
--
-- Existing tenants: a template is only updated while it's still exactly
-- the original default wording (ignoring Windows vs Unix line endings); one a Master Admin has edited in Email
-- Centre -> Templates is left alone (edit those by hand). New tenants get
-- the new wording via default_email_templates(), redefined below with every
-- other template carried forward verbatim from 0103_quote_reminders.sql.

update email_templates set body_html = $new$<p>Hi {{customer_name}},</p>
<p>Thank you for your enquiry. Your personalised quote <b>{{quote_number}}</b> from {{brand_name}} is ready.</p>
<p>Open it to see your price, check your journey details and confirm your booking in just a couple of clicks.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Your Price &amp; Book</a></p>
<p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link:<br /><a href="{{link}}" style="color:#f97316;">{{link}}</a></p>
<p>Thanks,<br />{{brand_name}}</p>$new$
where key = 'quote_sent' and replace(body_html, E'\r\n', E'\n') = $old$<p>Hi {{customer_name}},</p>
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
<p>Thanks,<br />{{brand_name}}</p>$old$;

update email_templates set body_html = $new$<p>Hi {{customer_name}},</p>
<p>Thank you for considering {{brand_name}} for your upcoming transport requirements.</p>
<p>We recently sent you a quotation for your journey on <b>{{travel_date}}</b>, and wanted to check whether you have had an opportunity to review it.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Vehicle</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{vehicle}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Journey</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{pickup}} to {{destination}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Travel date</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{travel_date}}</td>
  </tr>
</table>
<p>Your price and full journey details are waiting on your quote page.</p>
<p>We would be delighted to arrange your transport and make the booking process as straightforward as possible.</p>
<p><b>Ready to secure your booking?</b> Simply reply <b>BOOK</b> to this email, or use the button below to confirm your reservation.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirm My Booking</a></p>
<p>If you have any questions or would like to make changes to your itinerary, our team will be happy to assist.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$new$
where key = 'quote_reminder_1' and replace(body_html, E'\r\n', E'\n') = $old$<p>Hi {{customer_name}},</p>
<p>Thank you for considering {{brand_name}} for your upcoming transport requirements.</p>
<p>We recently sent you a quotation for your journey on <b>{{travel_date}}</b>, and wanted to check whether you have had an opportunity to review it.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Vehicle</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{vehicle}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Journey</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{pickup}} to {{destination}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Travel date</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{travel_date}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Quoted price</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{currency}} {{selling_price}}</td>
  </tr>
</table>
<p>We would be delighted to arrange your transport and make the booking process as straightforward as possible.</p>
<p><b>Ready to secure your booking?</b> Simply reply <b>BOOK</b> to this email, or use the button below to confirm your reservation.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirm My Booking</a></p>
<p>If you have any questions or would like to make changes to your itinerary, our team will be happy to assist.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$old$;

update email_templates set body_html = $new$<p>Hi {{customer_name}},</p>
<p>We're following up on your transport quotation for <b>{{travel_date}}</b>.</p>
<p>We understand that choosing the right transport provider is an important decision, and we want to make sure you have everything you need to proceed.</p>
<p>When booking with us, you benefit from:</p>
<ul>
  <li>Transport arrangements tailored to your journey</li>
  <li>A dedicated reservations team</li>
  <li>Clear booking details and confirmation</li>
  <li>Assistance with any changes before your journey, subject to booking terms</li>
</ul>
<p><b>Your quotation is currently awaiting confirmation</b> — your price and full details are on your quote page.</p>
<p>If the price, vehicle or itinerary needs adjusting, please let us know. We would welcome the opportunity to find a suitable solution for you.</p>
<p>You can secure your booking by replying <b>CONFIRM</b>, or by using the button below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Complete My Reservation</a></p>
<p>We look forward to arranging your transport.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$new$
where key = 'quote_reminder_2' and replace(body_html, E'\r\n', E'\n') = $old$<p>Hi {{customer_name}},</p>
<p>We're following up on your transport quotation for <b>{{travel_date}}</b>.</p>
<p>We understand that choosing the right transport provider is an important decision, and we want to make sure you have everything you need to proceed.</p>
<p>When booking with us, you benefit from:</p>
<ul>
  <li>Transport arrangements tailored to your journey</li>
  <li>A dedicated reservations team</li>
  <li>Clear booking details and confirmation</li>
  <li>Assistance with any changes before your journey, subject to booking terms</li>
</ul>
<p><b>Your quotation ({{currency}} {{selling_price}}) is currently awaiting confirmation.</b></p>
<p>If the price, vehicle or itinerary needs adjusting, please let us know. We would welcome the opportunity to find a suitable solution for you.</p>
<p>You can secure your booking by replying <b>CONFIRM</b>, or by using the button below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Complete My Reservation</a></p>
<p>We look forward to arranging your transport.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$old$;

update email_templates set body_html = $new$<p>Hi {{customer_name}},</p>
<p>We noticed that your transport quotation for <b>{{travel_date}}</b> has not yet been confirmed.</p>
<p>We would really like to secure your booking, and we are happy to review our price with you.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Vehicle</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{vehicle}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Journey</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{pickup}} to {{destination}}</td>
  </tr>
</table>
<p>If you are considering other quotations, please let us know. Our team would be happy to discuss how we can make our offer work for you.</p>
<p><b>Reply BOOK NOW to go ahead</b>, or use your booking link below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Secure My Transport</a></p>
<p>We hope to welcome you as a customer.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$new$
where key = 'quote_reminder_3' and replace(body_html, E'\r\n', E'\n') = $old$<p>Hi {{customer_name}},</p>
<p>We noticed that your transport quotation for <b>{{travel_date}}</b> has not yet been confirmed.</p>
<p>We would really like to secure your booking, and we are happy to review our price with you.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Vehicle</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{vehicle}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Journey</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{pickup}} to {{destination}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Quotation</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{currency}} {{selling_price}}</td>
  </tr>
</table>
<p>If you are considering other quotations, please let us know. Our team would be happy to discuss how we can make our offer work for you.</p>
<p><b>Reply BOOK NOW to go ahead</b>, or use your booking link below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Secure My Transport</a></p>
<p>We hope to welcome you as a customer.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$old$;

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
<p>Thank you for your enquiry. Your personalised quote <b>{{quote_number}}</b> from {{brand_name}} is ready.</p>
<p>Open it to see your price, check your journey details and confirm your booking in just a couple of clicks.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Your Price &amp; Book</a></p>
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
    ),
    (
      'quote_reminder_1',
      'Your quote {{quote_number}} for {{travel_date}}',
      $q$<p>Hi {{customer_name}},</p>
<p>Thank you for considering {{brand_name}} for your upcoming transport requirements.</p>
<p>We recently sent you a quotation for your journey on <b>{{travel_date}}</b>, and wanted to check whether you have had an opportunity to review it.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Vehicle</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{vehicle}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Journey</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{pickup}} to {{destination}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Travel date</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{travel_date}}</td>
  </tr>
</table>
<p>Your price and full journey details are waiting on your quote page.</p>
<p>We would be delighted to arrange your transport and make the booking process as straightforward as possible.</p>
<p><b>Ready to secure your booking?</b> Simply reply <b>BOOK</b> to this email, or use the button below to confirm your reservation.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirm My Booking</a></p>
<p>If you have any questions or would like to make changes to your itinerary, our team will be happy to assist.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$q$
    ),
    (
      'quote_reminder_2',
      'Following up on your quote {{quote_number}}',
      $q$<p>Hi {{customer_name}},</p>
<p>We're following up on your transport quotation for <b>{{travel_date}}</b>.</p>
<p>We understand that choosing the right transport provider is an important decision, and we want to make sure you have everything you need to proceed.</p>
<p>When booking with us, you benefit from:</p>
<ul>
  <li>Transport arrangements tailored to your journey</li>
  <li>A dedicated reservations team</li>
  <li>Clear booking details and confirmation</li>
  <li>Assistance with any changes before your journey, subject to booking terms</li>
</ul>
<p><b>Your quotation is currently awaiting confirmation</b> — your price and full details are on your quote page.</p>
<p>If the price, vehicle or itinerary needs adjusting, please let us know. We would welcome the opportunity to find a suitable solution for you.</p>
<p>You can secure your booking by replying <b>CONFIRM</b>, or by using the button below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Complete My Reservation</a></p>
<p>We look forward to arranging your transport.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$q$
    ),
    (
      'quote_reminder_3',
      'Can we help with your quote {{quote_number}}?',
      $q$<p>Hi {{customer_name}},</p>
<p>We noticed that your transport quotation for <b>{{travel_date}}</b> has not yet been confirmed.</p>
<p>We would really like to secure your booking, and we are happy to review our price with you.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#f8fafc;">
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Vehicle</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">{{vehicle}}</td>
  </tr>
  <tr>
    <td style="padding:12px 20px;color:#64748b;font-size:13px;">Journey</td>
    <td style="padding:12px 20px;color:#1e293b;font-size:13px;font-weight:700;text-align:right;">{{pickup}} to {{destination}}</td>
  </tr>
</table>
<p>If you are considering other quotations, please let us know. Our team would be happy to discuss how we can make our offer work for you.</p>
<p><b>Reply BOOK NOW to go ahead</b>, or use your booking link below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Secure My Transport</a></p>
<p>We hope to welcome you as a customer.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$q$
    ),
    (
      'quote_reminder_4',
      'Would you like us to proceed with {{quote_number}}?',
      $q$<p>Hi {{customer_name}},</p>
<p>We are contacting you again regarding your transport booking request for <b>{{travel_date}}</b>.</p>
<p>Your quotation remains unconfirmed, and we would appreciate an update on whether you wish to proceed. Please be aware that vehicle availability and pricing may change until a booking has been confirmed.</p>
<p><b>Would you like us to proceed with your reservation?</b> Simply reply with one of the following:</p>
<p><b>1</b> — Yes, I would like to book.<br />
<b>2</b> — I am interested, but need a better price.<br />
<b>3</b> — I need to make changes to my booking.<br />
<b>4</b> — I no longer require transport.</p>
<p>Our team can assist you as soon as we receive your reply. Alternatively, you can use the booking link below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirm My Booking</a></p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$q$
    ),
    (
      'quote_reminder_5',
      'Final follow-up on your quote {{quote_number}}',
      $q$<p>Hi {{customer_name}},</p>
<p>We have contacted you a few times regarding your quotation for <b>{{travel_date}}</b>, but have not yet received confirmation.</p>
<p>Before we close our follow-up on your enquiry, we wanted to give you one final opportunity to proceed.</p>
<p>If you would still like to book, simply reply <b>YES</b> and our reservations team will assist you with the next steps, or use the button below.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirm My Booking</a></p>
<p>If you need a revised quotation or a different vehicle, we would also be pleased to help.</p>
<p>If your plans have changed, no problem at all. Just let us know and we will update your enquiry accordingly.</p>
<p>Thank you for considering {{brand_name}}.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$q$
    ),
    (
      'quote_payment_reminder',
      'Payment needed to secure your booking {{quote_number}}',
      $q$<p>Hi {{customer_name}},</p>
<p>Thank you for accepting your quotation for <b>{{travel_date}}</b>. Your booking is not secured until we receive your payment.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:12px;background-color:#f8fafc;">
  <tr>
    <td width="50%" style="padding:16px 20px;text-align:center;border-right:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Quote Number</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{quote_number}}</div>
    </td>
    <td width="50%" style="padding:16px 20px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Amount Due Now</div>
      <div style="margin-top:4px;font-size:18px;font-weight:800;color:#1e293b;">{{currency}} {{amount_due}}</div>
    </td>
  </tr>
</table>
<p>You can pay securely using the button below. Vehicle availability can only be guaranteed once payment has been received.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Pay Securely Now</a></p>
<p>If you have already paid, thank you, and please disregard this email. If you have any questions, just reply and our team will help.</p>
<p>Kind regards,<br />The {{brand_name}} Reservations Team</p>
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$q$
    )
$$;
