"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Upload, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BRAND } from "@/lib/brandConfig";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { updateUserProfileAction, updateUserRoleAction, updateUserStatusAction, uploadUserSignatureLogoAction } from "./actions";
import type { UserListRow } from "./UserRow";
import type { ProfileStatus } from "@/lib/supabase/database.types";

const STATUS_OPTIONS: { value: ProfileStatus; label: string }[] = [
  { value: "invited", label: "Invited" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "disabled", label: "Disabled" },
  { value: "archived", label: "Archived" },
];

/**
 * Master-Admin-only "Edit" trigger + modal for a user's name/email/job
 * title/role and email signature. `compact` sizes the trigger to its own
 * content instead of stretching to fill its container — used in the desktop
 * table's Actions column so it doesn't claim more width than a 4-letter
 * label needs, leaving that space for the Region column instead. The
 * mobile card keeps the default full-width button, a better touch target
 * when it isn't competing with anything else for room.
 */
export function EditUserButton({
  user,
  roles,
  compact = false,
}: {
  user: UserListRow;
  roles: { id: string; name: string }[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50 ${compact ? "px-3" : "w-full px-2"}`}
      >
        <Pencil size={12} />
        Edit
      </button>
      {open && <EditUserModal user={user} roles={roles} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditUserModal({
  user,
  roles,
  onClose,
}: {
  user: UserListRow;
  roles: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [jobTitle, setJobTitle] = useState(user.job_title ?? "");
  const [roleId, setRoleId] = useState(user.role_id ?? "");
  const [status, setStatus] = useState<ProfileStatus>(user.status);
  const [directDial, setDirectDial] = useState(user.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(user.whatsapp_number ?? "");
  const [switchboard, setSwitchboard] = useState(user.signature_switchboard ?? "");
  const [emergencyEmail, setEmergencyEmail] = useState(user.signature_emergency_email ?? "");
  const [website, setWebsite] = useState(user.signature_website ?? "");
  const [logoUrl, setLogoUrl] = useState(user.signature_logo_url);

  async function onLogoSelected(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadUserSignatureLogoAction(user.id, formData);
      if (result.error || !result.url) {
        notify(`Could not upload logo: ${result.error ?? "unknown error"}`);
        return;
      }
      setLogoUrl(result.url);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError(null);
    if (!fullName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    startTransition(async () => {
      const result = await updateUserProfileAction(user.id, {
        fullName,
        email,
        jobTitle,
        directDial,
        whatsapp,
        switchboard,
        emergencyEmail,
        website,
        logoUrl,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      // Role isn't part of updateUserProfileAction — it has its own action
      // (with its own audit entry + permissions-cache invalidation), same as
      // before this moved into the modal, just no longer applied instantly.
      if (!user.is_master_admin && roleId && roleId !== (user.role_id ?? "")) {
        try {
          await updateUserRoleAction(user.id, roleId);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not update role.");
          return;
        }
      }

      // Same pattern as role: its own action/audit entry, applied on Save
      // rather than instantly, now that it lives in this modal instead of a
      // standalone "Change status…" command menu in the table.
      if (!user.is_master_admin && status !== user.status) {
        try {
          await updateUserStatusAction(user.id, status);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not update status.");
          return;
        }
      }

      notify(`${fullName}'s details were updated`);
      router.refresh();
      onClose();
    });
  }

  return (
    <ConfirmDetailModal
      open
      onClose={() => !pending && onClose()}
      title={`Edit ${user.full_name}`}
      description="Name, login email, job title, role, status and email signature — changing the email also changes what this person signs in with."
      pending={pending}
      error={error}
      confirmLabel="Save changes"
      onConfirm={save}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Email (login)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Job title
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Role
          {user.is_master_admin ? (
            <div className="mt-1 flex h-[42px] items-center text-sm font-normal text-slate-500">Master Admin</div>
          ) : (
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Status
          {user.is_master_admin ? (
            <div className="mt-1 flex h-[42px] items-center text-sm font-normal text-slate-500">Active</div>
          ) : (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProfileStatus)}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      <div className="mt-5 border-t pt-4">
        <div className="text-xs font-black uppercase tracking-wide text-slate-400">Email signature</div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {logoUrl ? (
            <div className="relative shrink-0">
              <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl border object-contain" />
              <button
                type="button"
                onClick={() => setLogoUrl(null)}
                aria-label="Remove logo"
                className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-slate-700 text-white"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-dashed text-slate-300">
              <Upload size={20} />
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            onChange={(e) => {
              onLogoSelected(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {logoUrl ? "Replace logo" : "Upload logo"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">
            Office phone
            <input
              value={switchboard}
              onChange={(e) => setSwitchboard(e.target.value)}
              placeholder={`e.g. ${BRAND.phoneInternational}`}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            Direct dial
            <input
              value={directDial}
              onChange={(e) => setDirectDial(e.target.value)}
              placeholder="e.g. +44 20 7946 0123"
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            WhatsApp
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="e.g. +44 7700 900123"
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-bold">
            Emergency email
            <input
              value={emergencyEmail}
              onChange={(e) => setEmergencyEmail(e.target.value)}
              placeholder={`e.g. ${BRAND.contactEmail}`}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            Website
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder={`e.g. ${BRAND.websiteDisplay}`}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            />
          </label>
        </div>
      </div>
    </ConfirmDetailModal>
  );
}
