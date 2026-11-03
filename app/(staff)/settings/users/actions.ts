"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, permissionsUserTag, PERMISSIONS } from "@/lib/permissions";
import { brandsUserTag } from "@/lib/brand";
import { recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { renderAndSendTemplate } from "@/lib/emailTemplates";
import type { ProfileStatus, EmailSecurity } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Builds the /auth/confirm link from a freshly generated invite token — same construction wherever a staff invite is (re)sent. */
function buildInviteLink(hashedToken: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?token_hash=${hashedToken}&type=invite&next=/accept-invite`;
}

/** Sends (or resends) the branded staff-invite email — errors are returned, not swallowed, since both call sites need to tell the admin whether it actually went out (the invite link itself still works either way, as a copy/paste fallback). */
async function sendStaffInviteEmail(
  admin: AdminClient,
  input: { tenantId: string; userName: string; email: string; brandId: string; link: string },
) {
  const { data: brand } = await admin.from("brands").select("name").eq("id", input.brandId).maybeSingle();
  return renderAndSendTemplate(admin, {
    tenantId: input.tenantId,
    key: "staff_invited",
    to: input.email,
    variables: { user_name: input.userName, brand_name: brand?.name ?? "", link: input.link },
  });
}

async function requireUserManager() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_USERS);
  if (!allowed) throw new Error("You do not have permission to manage users.");
  return profile;
}

/**
 * Editing another user's name/email/job title/signature is Master Admin
 * only — unlike role/status/region, which any admin.manage_users holder can
 * touch, this covers the account's login email, so it's gated tighter.
 */
async function requireMasterAdmin() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) throw new Error("Only a Master Admin can edit another user's account details.");
  return profile;
}

export async function inviteUserAction(
  _prevState: { error: string | null; link: string | null; emailError: string | null },
  formData: FormData,
) {
  const actor = await requireUserManager();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "");
  const jobTitle = String(formData.get("jobTitle") ?? "").trim() || null;
  const brandId = String(formData.get("brandId") ?? "").trim() || null;
  const regions = formData
    .getAll("regions")
    .map((r) => String(r).trim())
    .filter(Boolean);

  if (!fullName || !email || !roleId) {
    return { error: "Full name, email and role are required.", link: null, emailError: null };
  }
  if (!brandId) {
    return { error: "Every user belongs to a brand/branch — select one.", link: null, emailError: null };
  }

  const admin = createAdminClient();

  const { data: brand } = await admin.from("brands").select("company_id").eq("id", brandId).single();
  if (!brand) {
    return { error: "Selected brand not found.", link: null, emailError: null };
  }
  const companyId = brand.company_id;

  // generateLink (rather than inviteUserByEmail) creates the auth user
  // without sending Supabase's own hosted invite email — Supabase only lets
  // you customise that email's template with custom SMTP configured on
  // their side. We build the same /auth/confirm link ourselves from the raw
  // token instead, and send it through this app's own branded template via
  // sendStaffInviteEmail below (still handed back as `link` too, so the
  // admin can copy/share it directly if the email fails to send).
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Could not create the invite.", link: null, emailError: null };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    tenant_id: actor.tenant_id,
    full_name: fullName,
    email,
    job_title: jobTitle,
    role_id: roleId,
    default_company_id: companyId,
    default_brand_id: brandId,
    status: "invited",
    requires_password_reset: true,
  });

  if (profileError) {
    return { error: profileError.message, link: null, emailError: null };
  }

  await admin.from("user_brands").insert({ user_id: invited.user.id, brand_id: brandId });
  revalidateTag(brandsUserTag(invited.user.id), { expire: 0 });

  if (regions.length > 0) {
    await admin.from("user_regions").insert(regions.map((region) => ({ user_id: invited.user.id, region })));
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_invited",
    entityType: "profile",
    entityId: invited.user.id,
    newValue: { email, fullName, roleId, brandId, regions },
  });

  revalidatePath("/settings/users");

  const inviteLink = buildInviteLink(invited.properties.hashed_token);
  const { error: emailError } = await sendStaffInviteEmail(admin, {
    tenantId: actor.tenant_id,
    userName: fullName,
    email,
    brandId,
    link: inviteLink,
  });

  return { error: null, link: inviteLink, emailError };
}

/** Re-sends the branded invite email to a user who hasn't accepted yet, with a fresh link (the original token may have expired). */
export async function resendUserInviteAction(userId: string) {
  const actor = await requireUserManager();
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("tenant_id, full_name, email, default_brand_id, status")
    .eq("id", userId)
    .single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found.", link: null };
  }
  if (target.status !== "invited") {
    return { error: "This user has already accepted their invite.", link: null };
  }
  if (!target.default_brand_id) {
    return { error: "This user has no brand assigned — cannot resend the invite.", link: null };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: target.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.properties) {
    return { error: inviteError?.message ?? "Could not generate a new invite link.", link: null };
  }

  const inviteLink = buildInviteLink(invited.properties.hashed_token);
  const { error: emailError } = await sendStaffInviteEmail(admin, {
    tenantId: actor.tenant_id,
    userName: target.full_name,
    email: target.email,
    brandId: target.default_brand_id,
    link: inviteLink,
  });

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_invite_resent",
    entityType: "profile",
    entityId: userId,
    newValue: { email: target.email },
  });

  return { error: emailError, link: inviteLink };
}

export async function updateUserStatusAction(userId: string, status: ProfileStatus) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("status, tenant_id, is_master_admin")
    .eq("id", userId)
    .single();

  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }
  if (target.is_master_admin && !actor.is_master_admin) {
    throw new Error("Only a Master Admin can change another Master Admin's status.");
  }

  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_status_changed",
    entityType: "profile",
    entityId: userId,
    previousValue: { status: target.status },
    newValue: { status },
  });

  revalidatePath("/settings/users");
}

export async function addUserRegionAction(
  userId: string,
  region: string,
  coords?: { lat: number; lng: number } | null,
) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const trimmed = region.trim();
  if (!trimmed) return { error: "Enter a region name." };

  const { data: target } = await supabase.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found." };
  }

  const { error } = await supabase
    .from("user_regions")
    .insert({ user_id: userId, region: trimmed, lat: coords?.lat ?? null, lng: coords?.lng ?? null });
  if (error) {
    return { error: error.message.includes("duplicate") ? "That region is already assigned." : error.message };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_region_added",
    entityType: "profile",
    entityId: userId,
    newValue: { region: trimmed, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
  });

  revalidatePath("/settings/users");
  return { error: null };
}

export async function removeUserRegionAction(userId: string, regionId: string) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }

  const { error } = await supabase.from("user_regions").delete().eq("id", regionId).eq("user_id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_region_removed",
    entityType: "profile",
    entityId: userId,
    previousValue: { regionId },
  });

  revalidatePath("/settings/users");
}

export async function updateUserRoleAction(userId: string, roleId: string) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("role_id, tenant_id")
    .eq("id", userId)
    .single();

  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }

  const { error } = await supabase.from("profiles").update({ role_id: roleId }).eq("id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_role_changed",
    entityType: "profile",
    entityId: userId,
    previousValue: { role_id: target.role_id },
    newValue: { role_id: roleId },
  });

  revalidateTag(permissionsUserTag(userId), { expire: 0 });
  revalidatePath("/settings/users");
}

interface EmailAccountInput {
  displayName: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: EmailSecurity;
  imapUsername: string;
  imapPassword: string; // empty string = keep the existing stored password
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: EmailSecurity;
  smtpUsername: string;
  smtpPassword: string; // empty string = keep the existing stored password
  isActive: boolean;
}

/**
 * Master Admin sets up (or edits) a staff member's mailbox connection on
 * their behalf (requirement: Settings -> Users -> IMAP/SMTP). Password
 * fields are write-only from the client — an empty string here means "keep
 * whatever is already stored", never "clear it", so the form never needs to
 * round-trip a decrypted secret back to the browser.
 */
export async function upsertEmailAccountAction(userId: string, data: EmailAccountInput) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found." };
  }

  const { data: existing } = await supabase
    .from("email_accounts")
    .select("id, imap_password_enc, smtp_password_enc")
    .eq("user_id", userId)
    .maybeSingle();

  const imapPasswordEnc = data.imapPassword ? encryptSecret(data.imapPassword) : existing?.imap_password_enc;
  const smtpPasswordEnc = data.smtpPassword ? encryptSecret(data.smtpPassword) : existing?.smtp_password_enc;
  if (!imapPasswordEnc || !smtpPasswordEnc) {
    return { error: "IMAP and SMTP passwords are required." };
  }

  const { error } = await supabase.from("email_accounts").upsert(
    {
      tenant_id: actor.tenant_id,
      user_id: userId,
      display_name: data.displayName,
      email_address: data.emailAddress,
      imap_host: data.imapHost,
      imap_port: data.imapPort,
      imap_security: data.imapSecurity,
      imap_username: data.imapUsername,
      imap_password_enc: imapPasswordEnc,
      smtp_host: data.smtpHost,
      smtp_port: data.smtpPort,
      smtp_security: data.smtpSecurity,
      smtp_username: data.smtpUsername,
      smtp_password_enc: smtpPasswordEnc,
      is_active: data.isActive,
      created_by: actor.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: existing ? "email_account_updated" : "email_account_created",
    entityType: "email_account",
    entityId: existing?.id ?? userId,
    newValue: { emailAddress: data.emailAddress, imapHost: data.imapHost, smtpHost: data.smtpHost },
  });

  revalidatePath("/settings/users");
  return { error: null };
}

/**
 * Removes a staff member's mailbox connection entirely — e.g. it was set up
 * for the wrong person, or they're leaving. Deletes the stored (encrypted)
 * credentials and, via email_messages' own FK (on delete cascade), every
 * message that had been synced for it; the person's Email Centre just goes
 * back to showing "No mailbox connected yet" afterwards. Doesn't touch the
 * profile itself.
 */
export async function disconnectEmailAccountAction(userId: string) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found." };
  }

  const { data: existing } = await supabase.from("email_accounts").select("id, email_address").eq("user_id", userId).maybeSingle();
  if (!existing) return { error: "This user has no mailbox connected." };

  const { error } = await supabase.from("email_accounts").delete().eq("id", existing.id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "email_account_disconnected",
    entityType: "email_account",
    entityId: existing.id,
    previousValue: { emailAddress: existing.email_address },
  });

  revalidatePath("/settings/users");
  return { error: null };
}

/**
 * Tries connecting with the values currently in the form, before they're
 * saved — surfaces a typo'd host/port/password immediately instead of at
 * the next cron sync. Never persists anything.
 */
export async function testEmailConnectionAction(data: EmailAccountInput) {
  await requireUserManager();

  const result: { imapError: string | null; smtpError: string | null } = { imapError: null, smtpError: null };

  try {
    const client = new ImapFlow({
      host: data.imapHost,
      port: data.imapPort,
      secure: data.imapSecurity === "ssl",
      auth: { user: data.imapUsername, pass: data.imapPassword },
      logger: false,
    });
    await client.connect();
    await client.logout();
  } catch (err) {
    result.imapError = err instanceof Error ? err.message : "Could not connect to the IMAP server.";
  }

  try {
    const transporter = nodemailer.createTransport({
      host: data.smtpHost,
      port: data.smtpPort,
      secure: data.smtpSecurity === "ssl",
      auth: { user: data.smtpUsername, pass: data.smtpPassword },
    });
    await transporter.verify();
  } catch (err) {
    result.smtpError = err instanceof Error ? err.message : "Could not connect to the SMTP server.";
  }

  return result;
}

interface UserProfileInput {
  fullName: string;
  email: string;
  jobTitle: string;
  directDial: string;
  whatsapp: string;
  switchboard: string;
  emergencyEmail: string;
  website: string;
  logoUrl: string | null;
}

/**
 * Master Admin edits another user's name, login email and email-signature
 * fields (Settings -> Users -> Edit). Everything except the email itself is
 * a plain `profiles` update via the normal RLS-scoped client — a Master
 * Admin already satisfies `profiles_update_admin`'s `has_permission` check
 * at the DB level (is_master_admin short-circuits has_permission(), see
 * 0001_foundation.sql), so no service-role client is needed for that part.
 * The email is different: it's also the Supabase Auth sign-in identifier,
 * which only the admin API can change for someone other than yourself, so
 * that one call goes through the service-role client.
 */
export async function updateUserProfileAction(userId: string, data: UserProfileInput) {
  const actor = await requireMasterAdmin();
  const supabase = await createClient();

  const fullName = data.fullName.trim();
  const email = data.email.trim().toLowerCase();
  const jobTitle = data.jobTitle.trim() || null;
  if (!fullName || !email) return { error: "Name and email are required." };
  if (!email.includes("@")) return { error: "Enter a valid email address." };

  const { data: target } = await supabase
    .from("profiles")
    .select("tenant_id, full_name, email, job_title")
    .eq("id", userId)
    .single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found." };
  }

  if (email !== target.email) {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (authError) return { error: authError.message };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      job_title: jobTitle,
      phone: data.directDial.trim() || null,
      whatsapp_number: data.whatsapp.trim() || null,
      signature_switchboard: data.switchboard.trim() || null,
      signature_emergency_email: data.emergencyEmail.trim() || null,
      signature_website: data.website.trim() || null,
      signature_logo_url: data.logoUrl,
    })
    .eq("id", userId);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_profile_updated",
    entityType: "profile",
    entityId: userId,
    previousValue: { fullName: target.full_name, email: target.email, jobTitle: target.job_title },
    newValue: { fullName, email, jobTitle },
  });

  revalidatePath("/settings/users");
  return { error: null };
}

/**
 * Uploads a signature logo on another user's behalf. The self-service path
 * (components/pages/EmailSignatureSettings.tsx) uploads straight from the
 * browser into the caller's own folder, which the signature-assets storage
 * policies allow because they check the uploader's own auth.uid() against
 * the folder. An admin acting for someone else never satisfies that check,
 * so this goes through the service-role client instead, which bypasses
 * storage RLS entirely (already gated by requireMasterAdmin() above it).
 */
export async function uploadUserSignatureLogoAction(userId: string, formData: FormData) {
  const actor = await requireMasterAdmin();
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found.", url: null };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided.", url: null };

  const path = `${target.tenant_id}/${userId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await admin.storage.from("signature-assets").upload(path, file, {
    contentType: file.type || undefined,
  });
  if (error) return { error: error.message, url: null };

  const { data: publicUrl } = admin.storage.from("signature-assets").getPublicUrl(path);
  return { error: null, url: publicUrl.publicUrl };
}

const IMPERSONATION_COOKIE = "impersonation";

interface ImpersonationStash {
  /** A one-time magiclink token for the ADMIN's own account, minted before their session gets overwritten — redeeming it later is how "Exit impersonation" gets them back without a real logout/login. */
  returnTokenHash: string;
  adminId: string;
  adminName: string;
  targetId: string;
  targetName: string;
}

function impersonationCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Matches Supabase's default access-token lifetime — no point outliving
    // the very session it's meant to let someone return from.
    maxAge: 3600,
  };
}

/**
 * Master Admin "Login as" — swaps the current session for a real session
 * belonging to the target user, entirely server-side in this one action (no
 * email, no intermediate link/page to click — unlike password reset/invite,
 * this token is minted and redeemed in the same request, so there's no
 * window for anything to pre-consume it). Every page the admin visits next
 * is then genuinely rendered as that person, correct by construction since
 * it's real RLS/has_permission() evaluation, not a simulated view.
 */
export async function loginAsUserAction(targetUserId: string) {
  const actor = await requireProfile();
  if (!actor.is_master_admin) {
    return { error: "Only a Master Admin can log in as another user." };
  }
  if (targetUserId === actor.id) {
    return { error: "You're already signed in as yourself." };
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, email, is_master_admin, status")
    .eq("id", targetUserId)
    .eq("tenant_id", actor.tenant_id)
    .maybeSingle();
  if (!target) return { error: "That user could not be found." };
  if (target.is_master_admin) return { error: "Cannot log in as another Master Admin." };

  // Mint the way back BEFORE touching the session — if this fails, abort
  // rather than strand the admin in someone else's account with no return
  // ticket.
  const { data: returnLink, error: returnError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: actor.email,
  });
  if (returnError || !returnLink.properties?.hashed_token) {
    return { error: returnError?.message ?? "Could not prepare a way back — nothing was changed." };
  }

  const { data: targetLink, error: targetError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });
  if (targetError || !targetLink.properties?.hashed_token) {
    return { error: targetError?.message ?? "Could not generate a session for that user." };
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: targetLink.properties.hashed_token,
  });
  if (verifyError) {
    return { error: verifyError.message };
  }

  const stash: ImpersonationStash = {
    returnTokenHash: returnLink.properties.hashed_token,
    adminId: actor.id,
    adminName: actor.full_name,
    targetId: target.id,
    targetName: target.full_name,
  };
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, JSON.stringify(stash), impersonationCookieOptions());

  await recordAudit({
    client: admin,
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "admin_impersonation_started",
    entityType: "profile",
    entityId: target.id,
    newValue: { targetName: target.full_name },
  });

  redirect("/dashboard");
}

/** Redeems the stashed return ticket to restore the Master Admin's own session — same one-click, no-email mechanism as loginAsUserAction, in reverse. Falls back to a clean sign-out (rather than leaving them stuck as the impersonated user) if the return ticket is somehow already gone or expired. */
export async function exitImpersonationAction() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  cookieStore.delete(IMPERSONATION_COOKIE);

  if (!raw) redirect("/dashboard");

  let stash: ImpersonationStash;
  try {
    stash = JSON.parse(raw);
  } catch {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: stash.returnTokenHash,
  });

  if (verifyError) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  const restoredAdmin = await requireProfile();
  const admin = createAdminClient();
  await recordAudit({
    client: admin,
    tenantId: restoredAdmin.tenant_id,
    actorId: stash.adminId,
    action: "admin_impersonation_ended",
    entityType: "profile",
    entityId: stash.targetId,
    newValue: { targetName: stash.targetName },
  });

  redirect("/dashboard");
}
