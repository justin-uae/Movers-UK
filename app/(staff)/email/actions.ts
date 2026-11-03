"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export async function updateEmailTemplateAction(
  id: string,
  data: { subject: string; bodyHtml: string },
) {
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.ADMIN_MANAGE_TEMPLATES);
  if (!allowed) return { error: "You do not have permission to edit email templates." };

  const subject = data.subject.trim();
  const bodyHtml = data.bodyHtml.trim();
  if (!subject || !bodyHtml) return { error: "Subject and body are both required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({ subject, body_html: bodyHtml, updated_by: actor.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "email_template_updated",
    entityType: "email_template",
    entityId: id,
  });

  revalidatePath("/email");
  return { error: null };
}

/**
 * Self-service — every field in a staff member's own email signature
 * (lib/emailSignature.ts) lives on their own profile row and is editable
 * here, including the logo (uploaded client-side to the public
 * signature-assets bucket first — see EmailSignatureSettings.tsx — this
 * action just saves the resulting URL alongside everything else). No
 * special permission required: these are personal contact details on the
 * caller's own row, same as any other self-editable field.
 */
export async function updateSignatureDetailsAction(data: {
  directDial: string;
  whatsapp: string;
  switchboard: string;
  emergencyEmail: string;
  website: string;
  logoUrl: string | null;
}) {
  const actor = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      phone: data.directDial.trim() || null,
      whatsapp_number: data.whatsapp.trim() || null,
      signature_switchboard: data.switchboard.trim() || null,
      signature_emergency_email: data.emergencyEmail.trim() || null,
      signature_website: data.website.trim() || null,
      signature_logo_url: data.logoUrl,
    })
    .eq("id", actor.id);
  if (error) return { error: error.message };

  revalidatePath("/email");
  return { error: null };
}
