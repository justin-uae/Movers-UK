"use client";

import { useState, useTransition } from "react";
import { X, Plus, LogIn } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { removeUserRegionAction, resendUserInviteAction, loginAsUserAction } from "./actions";
import { RegionMapModal, type AllocatedRegion } from "./RegionMapModal";
import { MailboxBadge, type EmailAccountStatus } from "./EmailAccountForm";
import { EditUserButton } from "./EditUserModal";
import type { ProfileStatus } from "@/lib/supabase/database.types";

const STATUS_STYLES: Record<ProfileStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  invited: "bg-blue-50 text-blue-700",
  suspended: "bg-amber-50 text-amber-700",
  disabled: "bg-red-50 text-red-700",
  archived: "bg-slate-100 text-slate-600",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
      {initials(name)}
    </div>
  );
}

export interface UserListRow {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  status: ProfileStatus;
  role_id: string | null;
  is_master_admin: boolean;
  phone: string | null;
  whatsapp_number: string | null;
  signature_switchboard: string | null;
  signature_emergency_email: string | null;
  signature_website: string | null;
  signature_logo_url: string | null;
  user_regions: { id: string; region: string; lat: number | null; lng: number | null }[];
}

/**
 * All the state + server-action calls a user row needs, shared between the
 * desktop `<tr>` (UserRow) and the mobile card (UserCard) — each renders its
 * own markup, but neither duplicates the mutation logic.
 */
function useUserRowActions(user: UserListRow) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [loginAsModalOpen, setLoginAsModalOpen] = useState(false);
  const [loginAsError, setLoginAsError] = useState<string | null>(null);

  function removeRegion(regionId: string) {
    startTransition(async () => {
      try {
        await removeUserRegionAction(user.id, regionId);
        notify(`Region removed for ${user.full_name}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not remove region");
      }
    });
  }

  function resendInvite() {
    startTransition(async () => {
      const result = await resendUserInviteAction(user.id);
      if (result.error) {
        notify(`Could not send the invite email (${result.error}) — link: ${result.link ?? "none"}`);
        return;
      }
      notify(`Invite email resent to ${user.email}`);
    });
  }

  function openLoginAs() {
    setLoginAsError(null);
    setLoginAsModalOpen(true);
  }

  function confirmLoginAs() {
    startTransition(async () => {
      const result = await loginAsUserAction(user.id);
      // A successful call never returns — it redirects — so reaching here
      // means it failed.
      if (result?.error) {
        setLoginAsError(result.error);
        notify(result.error);
      }
    });
  }

  return {
    pending,
    regionModalOpen,
    setRegionModalOpen,
    removeRegion,
    resendInvite,
    loginAsModalOpen,
    setLoginAsModalOpen,
    loginAsError,
    openLoginAs,
    confirmLoginAs,
  };
}

/** Shared confirm-before-impersonating dialog, rendered by both UserRow and UserCard. */
function LoginAsModal({ user, a }: { user: UserListRow; a: ReturnType<typeof useUserRowActions> }) {
  if (!a.loginAsModalOpen) return null;
  return (
    <ConfirmDetailModal
      open
      onClose={() => !a.pending && a.setLoginAsModalOpen(false)}
      title={`Log in as ${user.full_name}?`}
      description="You'll see and use the CRM exactly as they do — their nav, their permissions, their dashboard — until you exit. This is logged."
      details={[
        { label: "Email", value: user.email },
        { label: "Job title", value: user.job_title ?? "—" },
      ]}
      pending={a.pending}
      error={a.loginAsError}
      confirmLabel="Log in as this user"
      onConfirm={a.confirmLoginAs}
    />
  );
}

/**
 * One region per line (name + remove, own row) rather than pills wrapping
 * inline — with several regions, wrapped pills broke onto an unpredictable
 * number of lines and made rows of the table look ragged against each
 * other; a fixed vertical list reads as one clean column no matter how many
 * regions a person has. Pulled out so the desktop table cell and the mobile
 * card render the exact same markup instead of two copies that could drift
 * out of sync.
 */
function RegionEditor({
  user,
  canManage,
  pending,
  regionModalOpen,
  setRegionModalOpen,
  removeRegion,
  allRegions,
}: {
  user: UserListRow;
  canManage: boolean;
  pending: boolean;
  regionModalOpen: boolean;
  setRegionModalOpen: (v: boolean) => void;
  removeRegion: (regionId: string) => void;
  allRegions: AllocatedRegion[];
}) {
  return (
    <div className="min-w-0">
      {user.user_regions.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {user.user_regions.map((r) => (
            <li key={r.id} className="flex min-w-0 items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-600" title={r.region}>
                {r.region}
              </span>
              {canManage && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Remove "${r.region}" from ${user.full_name}'s regions?`)) removeRegion(r.id);
                  }}
                  className="shrink-0 rounded-full p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500 disabled:opacity-60"
                  aria-label={`Remove ${r.region}`}
                >
                  <X size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !canManage && <span className="text-slate-300">—</span>
      )}
      {canManage && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setRegionModalOpen(true)}
          className={`flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 hover:border-slate-400 hover:text-slate-600 disabled:opacity-60 ${user.user_regions.length > 0 ? "mt-1.5" : ""}`}
          aria-label="Add region"
        >
          <Plus size={10} />
          Add region
        </button>
      )}
      <RegionMapModal
        open={regionModalOpen}
        onClose={() => setRegionModalOpen(false)}
        targetUserId={user.id}
        targetUserName={user.full_name}
        allRegions={allRegions}
        canManage={canManage}
      />
    </div>
  );
}

/** Desktop table row — shown at `lg:` and above (see UsersPage). */
export function UserRow({
  user,
  roles,
  canManage,
  isMasterAdmin,
  currentUserId,
  mailbox,
  allRegions,
}: {
  user: UserListRow;
  roles: { id: string; name: string }[];
  canManage: boolean;
  isMasterAdmin: boolean;
  currentUserId: string;
  mailbox: EmailAccountStatus | null;
  allRegions: AllocatedRegion[];
}) {
  const a = useUserRowActions(user);
  const canLoginAs = isMasterAdmin && !user.is_master_admin && user.status === "active" && user.id !== currentUserId;

  return (
    <tr className="border-t border-slate-100 align-middle hover:bg-slate-50/70">
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name} />
          <div className="min-w-0">
            <div className="truncate font-bold">{user.full_name}</div>
            <div className="truncate text-xs text-slate-400">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="hidden truncate px-3 py-3 align-middle text-sm text-slate-600 xl:table-cell" title={user.job_title ?? undefined}>
        {user.job_title ?? <span className="text-slate-300">—</span>}
      </td>
      <td className="min-w-0 px-3 py-3 align-middle text-sm text-slate-600">
        <RegionEditor user={user} canManage={canManage} allRegions={allRegions} {...a} />
      </td>
      <td className="px-3 py-3 align-middle">
        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[user.status]}`}>
          {user.status}
        </span>
      </td>
      <td className="hidden px-3 py-3 align-middle xl:table-cell">
        <MailboxBadge userId={user.id} userName={user.full_name} account={mailbox} canManage={canManage} />
      </td>
      <td className="px-3 py-3 align-middle text-right">
        <div className="flex flex-col items-end gap-1.5">
          {isMasterAdmin && <EditUserButton user={user} roles={roles} compact />}
          {canManage && user.status === "invited" && (
            <button
              type="button"
              disabled={a.pending}
              onClick={a.resendInvite}
              className="h-9 w-full whitespace-nowrap rounded-lg border border-slate-200 px-2 text-xs font-bold hover:bg-slate-50 disabled:opacity-60"
            >
              Resend invite
            </button>
          )}
          {canLoginAs && (
            <button
              type="button"
              disabled={a.pending}
              onClick={a.openLoginAs}
              className="flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2 text-xs font-bold hover:bg-slate-50 disabled:opacity-60"
            >
              <LogIn size={13} />
              Login as
            </button>
          )}
        </div>
      </td>
      <LoginAsModal user={user} a={a} />
    </tr>
  );
}

/** Mobile card — shown below `lg:` instead of the table (see UsersPage). */
export function UserCard({
  user,
  roles,
  canManage,
  isMasterAdmin,
  currentUserId,
  mailbox,
  allRegions,
}: {
  user: UserListRow;
  roles: { id: string; name: string }[];
  canManage: boolean;
  isMasterAdmin: boolean;
  currentUserId: string;
  mailbox: EmailAccountStatus | null;
  allRegions: AllocatedRegion[];
}) {
  const a = useUserRowActions(user);
  const canLoginAs = isMasterAdmin && !user.is_master_admin && user.status === "active" && user.id !== currentUserId;

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={user.full_name} />
          <div className="min-w-0">
            <div className="truncate font-bold">{user.full_name}</div>
            <div className="truncate text-xs text-slate-400">{user.email}</div>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[user.status]}`}>
          {user.status}
        </span>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        <div className="font-bold uppercase tracking-wide text-slate-400">Job title</div>
        <div className="mt-0.5 text-slate-700">{user.job_title ?? "—"}</div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Region</div>
        <div className="mt-1">
          <RegionEditor user={user} canManage={canManage} allRegions={allRegions} {...a} />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Mailbox</div>
        <div className="mt-1">
          <MailboxBadge userId={user.id} userName={user.full_name} account={mailbox} canManage={canManage} />
        </div>
      </div>

      {(isMasterAdmin || (canManage && user.status === "invited")) && (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3">
          {isMasterAdmin && <EditUserButton user={user} roles={roles} />}
          {canManage && user.status === "invited" && (
            <button
              type="button"
              disabled={a.pending}
              onClick={a.resendInvite}
              className="w-full rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
            >
              Resend invite
            </button>
          )}
          {canLoginAs && (
            <button
              type="button"
              disabled={a.pending}
              onClick={a.openLoginAs}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
            >
              <LogIn size={13} />
              Login as
            </button>
          )}
        </div>
      )}
      <LoginAsModal user={user} a={a} />
    </div>
  );
}
