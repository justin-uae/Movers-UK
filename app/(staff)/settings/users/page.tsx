import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { UsersDiagram } from "@/components/ui/guide-diagrams/UsersDiagram";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { InviteUserForm } from "./InviteUserForm";
import { UserRow, UserCard, type UserListRow } from "./UserRow";
import type { AllocatedRegion } from "./RegionMapModal";
import type { EmailAccountStatus } from "./EmailAccountForm";

const PAGE_SIZE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const canManage = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_USERS);
  const isMasterAdmin = profile.is_master_admin;

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let usersQuery = supabase
    .from("profiles")
    .select(
      "id, full_name, email, job_title, status, role_id, is_master_admin, phone, whatsapp_number, signature_switchboard, signature_emergency_email, signature_website, signature_logo_url, user_regions(id, region, lat, lng)",
      { count: "exact" },
    );
  if (q) {
    usersQuery = usersQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const [{ data, count, error: usersError }, { data: roles }, { data: brands }, { data: mailboxes }, { data: regionsRaw, error: regionsError }] =
    await Promise.all([
      usersQuery.order("full_name").range(from, to),
      supabase.from("roles").select("id, name").order("name"),
      supabase.from("brands").select("id, name").order("name"),
      supabase
        .from("email_accounts")
        .select(
          "id, user_id, display_name, email_address, imap_host, imap_port, imap_security, imap_username, smtp_host, smtp_port, smtp_security, smtp_username, is_active, last_synced_at, last_sync_error",
        ),
      // Unpaginated, tenant-wide (RLS-scoped) — the region map needs every
      // colleague's coverage, not just whichever page of users is showing.
      supabase.from("user_regions").select("id, region, lat, lng, user_id, profiles(full_name)").order("region"),
    ]);
  // Both queries reach columns added by migration 0069 — if that hasn't been
  // applied yet, Postgres rejects them outright rather than returning
  // partial rows, so `data` comes back null and the page would otherwise
  // render a silent, misleading "No users yet." Surface it instead.
  if (usersError) console.error("settings/users: users query failed:", usersError.message);
  if (regionsError) console.error("settings/users: user_regions query failed:", regionsError.message);
  const users = (data ?? []) as unknown as UserListRow[];
  const mailboxByUserId = new Map(
    ((mailboxes ?? []) as unknown as (EmailAccountStatus & { user_id: string })[]).map((m) => [m.user_id, m]),
  );
  const allRegions: AllocatedRegion[] = (
    (regionsRaw ?? []) as unknown as {
      id: string;
      region: string;
      lat: number | null;
      lng: number | null;
      user_id: string;
      profiles: { full_name: string } | null;
    }[]
  ).map((r) => ({ id: r.id, region: r.region, lat: r.lat, lng: r.lng, userId: r.user_id, userName: r.profiles?.full_name ?? "Unknown" }));

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Users"
        text="Invite, assign roles and manage account status for everyone in your organisation."
        action={
          <div className="flex flex-wrap items-start gap-2">
            <PageGuide
              title="Users"
              subtitle="Everyone with sign-in access to this CRM, and what controls their access."
              screenshot={<UsersDiagram />}
              sections={[
                {
                  heading: "Inviting someone",
                  body: [
                    "Invite user sends an email invite — the person sets their own password on first login, nothing plaintext is generated or shown here.",
                  ],
                },
                {
                  heading: "What each column controls",
                  bullets: true,
                  body: [
                    "Brand / Region — scopes what a user sees and can be assigned on enquiries/jobs, for roles that are brand- or region-limited.",
                    "Role — which permission set this person has; change it here or build a new role under Roles & Permissions.",
                    "Status — Suspended blocks sign-in immediately without deleting the account or its history.",
                    "Mailbox — whether this person has connected a personal SMTP/IMAP mailbox (Email Centre → My Signature); customer-facing emails they send go out from it when connected.",
                  ],
                },
                {
                  heading: "Assigning a region",
                  body: [
                    "The + next to a user's regions opens a map — search a place or click anywhere on it, and see every colleague's coverage as coloured pins before adding a new one. Regions are matched against a lead's pickup/destination text to help route it, so keep them as real place names (a city or neighbourhood, not a vague area).",
                  ],
                },
              ]}
            />
            {canManage && <InviteUserForm roles={roles ?? []} brands={brands ?? []} />}
          </div>
        }
      />
      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder="Search users by name or email…" />
        </div>
        <div className="space-y-3 lg:hidden">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              roles={roles ?? []}
              canManage={canManage}
              isMasterAdmin={isMasterAdmin}
              currentUserId={profile.id}
              mailbox={mailboxByUserId.get(user.id) ?? null}
              allRegions={allRegions}
            />
          ))}
          {users.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No users yet.</p>}
        </div>
        {/* Table only kicks in at `lg:` — below that, a wide `<table>` either
            has to shrink columns to the point of being unreadable or force a
            horizontal scrollbar, so the card list above is used instead of
            trying to cram 8 columns into a narrow viewport. Column widths
            are percentages (not px) so the table always fills its container
            and never overflows it, at any width `lg:` and up. */}
        <div className="hidden lg:block">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[23%]" />
              <col className="hidden w-[12%] xl:table-column" />
              <col className="w-[26%]" />
              <col className="w-[9%]" />
              <col className="hidden w-[13%] xl:table-column" />
              <col className="w-[17%]" />
            </colgroup>
            <thead className="border-b text-xs font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="whitespace-nowrap px-3 pb-3">User</th>
                <th className="hidden whitespace-nowrap px-3 pb-3 xl:table-cell">Job title</th>
                <th className="whitespace-nowrap px-3 pb-3">Region</th>
                <th className="whitespace-nowrap px-3 pb-3">Status</th>
                <th className="hidden whitespace-nowrap px-3 pb-3 xl:table-cell">Mailbox</th>
                <th className="whitespace-nowrap px-3 pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  roles={roles ?? []}
                  canManage={canManage}
                  isMasterAdmin={isMasterAdmin}
                  currentUserId={profile.id}
                  mailbox={mailboxByUserId.get(user.id) ?? null}
                  allRegions={allRegions}
                />
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No users yet.</p>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Panel>
    </div>
  );
}
