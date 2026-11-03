-- 0108_hide_price_in_quote_emails.sql redefined default_email_templates()
-- but its four UPDATEs matched no rows on the live database: they compared
-- the stored template to the original text exactly, and the stored copies
-- differ only in whitespace/line endings (the SQL editor can rewrite those
-- on paste). This re-runs the same four rewrites, comparing with all
-- whitespace stripped from both sides, so it still only touches templates
-- nobody has customised in Email Centre. Safe to run more than once.

update email_templates set body_html = $new$<p>Hi {{customer_name}},</p>
<p>Thank you for your enquiry. Your personalised quote <b>{{quote_number}}</b> from {{brand_name}} is ready.</p>
<p>Open it to see your price, check your journey details and confirm your booking in just a couple of clicks.</p>
<p><a href="{{link}}" style="display:inline-block;background:#f97316;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">View Your Price &amp; Book</a></p>
<p style="color:#64748b;font-size:13px;">If the button does not work, copy and paste this link:<br /><a href="{{link}}" style="color:#f97316;">{{link}}</a></p>
<p>Thanks,<br />{{brand_name}}</p>$new$
where key = 'quote_sent'
  and regexp_replace(body_html, '\s', '', 'g') = regexp_replace($old$<p>Hi {{customer_name}},</p>
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
<p>Thanks,<br />{{brand_name}}</p>$old$, '\s', '', 'g');

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
where key = 'quote_reminder_1'
  and regexp_replace(body_html, '\s', '', 'g') = regexp_replace($old$<p>Hi {{customer_name}},</p>
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
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$old$, '\s', '', 'g');

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
where key = 'quote_reminder_2'
  and regexp_replace(body_html, '\s', '', 'g') = regexp_replace($old$<p>Hi {{customer_name}},</p>
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
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$old$, '\s', '', 'g');

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
where key = 'quote_reminder_3'
  and regexp_replace(body_html, '\s', '', 'g') = regexp_replace($old$<p>Hi {{customer_name}},</p>
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
<p style="color:#94a3b8;font-size:12px;">Don't want any more reminders about this quote? <a href="{{stop_link}}" style="color:#94a3b8;">Stop reminders</a></p>$old$, '\s', '', 'g');

