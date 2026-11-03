import "server-only";

// The only thing that's still a fixed constant — everything else in the
// signature (Switchboard, Direct Dial, WhatsApp, Emergency Email, Web,
// Logo) is a per-user field on `profiles`, editable in Email Centre's "My
// Signature" tab.
const CONFIDENTIALITY_NOTICE =
  "This email and any attachments are confidential and intended solely for the named recipient. If you received this in error, please delete it immediately and notify the sender.";

export interface SignatureProfile {
  full_name: string;
  email: string;
  job_title: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  signature_switchboard: string | null;
  signature_emergency_email: string | null;
  signature_website: string | null;
  signature_logo_url: string | null;
}

/**
 * Builds the signature block appended to every customer-facing email sent
 * by a logged-in staff member (see lib/emailTemplates.ts's `senderId`
 * param) — inserted into the shared branded envelope by
 * lib/emailBranding.ts's wrapEmailHtml. Any field a user hasn't set is
 * simply omitted from the block rather than showing blank.
 */
export function buildSignatureHtml(profile: SignatureProfile): string {
  const rows = [
    profile.signature_switchboard ? `Office Phone: ${profile.signature_switchboard}` : null,
    profile.phone ? `Direct Dial: ${profile.phone}` : null,
    profile.whatsapp_number ? `WhatsApp: ${profile.whatsapp_number}` : null,
    `Email: ${profile.email}`,
    profile.signature_emergency_email ? `Emergency Email: ${profile.signature_emergency_email}` : null,
    profile.signature_website ? `Web: ${profile.signature_website}` : null,
  ]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        ${
          profile.signature_logo_url
            ? `<td style="vertical-align:top;padding-right:14px;">
                 <img src="${profile.signature_logo_url}" alt="" width="52" style="display:block;border-radius:8px;max-width:52px;" />
               </td>`
            : ""
        }
        <td style="vertical-align:top;font-size:12px;line-height:1.7;color:#1e293b;">
          <div style="font-weight:800;">${profile.full_name}</div>
          ${profile.job_title ? `<div style="color:#64748b;">${profile.job_title}</div>` : ""}
          <div style="margin-top:4px;">${rows}</div>
        </td>
      </tr>
    </table>
    <p style="margin:14px 0 0;font-size:10px;line-height:1.5;color:#94a3b8;">${CONFIDENTIALITY_NOTICE}</p>
  `;
}
