"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { AuditLogDiagram } from "@/components/ui/guide-diagrams/AuditLogDiagram";
import { formatDateTime } from "@/lib/formatDate";

export interface AuditEntryRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorName: string;
}

export interface LoginHistoryRow {
  id: string;
  event: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  userName: string;
}

export interface PickerOption {
  id: string;
  label: string;
}

const LOGIN_EVENT_BADGE: Record<string, string> = {
  login_success: "bg-emerald-50 text-emerald-700",
  login_failed: "bg-red-50 text-red-700",
  logout: "bg-slate-100 text-slate-500",
  forced_logout: "bg-amber-50 text-amber-700",
  session_expired: "bg-slate-100 text-slate-500",
};

const LOGIN_EVENTS = ["login_success", "login_failed", "logout", "forced_logout", "session_expired"];

export function AuditLogPage({
  tab,
  auditEntries,
  auditTotal,
  loginRows,
  loginTotal,
  pageSize,
  page,
  actorOptions,
}: {
  tab: "changes" | "logins";
  auditEntries: AuditEntryRow[];
  auditTotal: number;
  loginRows: LoginHistoryRow[];
  loginTotal: number;
  pageSize: number;
  page: number;
  actorOptions: PickerOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const actor = searchParams.get("actor") ?? "";
  const event = searchParams.get("event") ?? "";

  function tabHref(next: "changes" | "logins") {
    const params = new URLSearchParams();
    params.set("tab", next);
    return `${pathname}?${params.toString()}`;
  }

  function updateParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Audit Log"
        text="Every financial, pricing, allocation and user change, plus login activity — append-only, most recent first."
        action={
          <PageGuide
            title="Audit Log"
            subtitle="A permanent, append-only record — who changed what, when, and why."
            screenshot={<AuditLogDiagram />}
            sections={[
              {
                heading: "Changes vs Logins",
                body: [
                  "Changes covers every recorded write — pricing edits, cancellations, booking amendments, payment/refund actions, permission changes and more. Logins is purely sign-in activity: successes, failures, logouts and forced logouts.",
                ],
              },
              {
                heading: "Reading a row",
                body: [
                  "Click a row with a ▸ to expand it — shows the before/after values as raw data, plus the reason given (for actions that require one, like a cancellation or a booking edit) and the actor's IP/device.",
                ],
              },
              {
                heading: "Why it exists",
                body: [
                  "This is the one place nothing can be edited or deleted — every sensitive action writes here through a single shared code path, specifically so it can be trusted as a genuine record if a change is ever questioned.",
                ],
              },
            ]}
          />
        }
      />

      <div className="mb-4 flex gap-2">
        {(["changes", "logins"] as const).map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={clsx(
              "rounded-xl px-3 py-2 text-sm font-bold capitalize",
              tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
            )}
          >
            {t === "changes" ? "Changes" : "Logins"}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab === "changes" && <SearchInput placeholder="Search action, entity or reason…" />}
        <select
          value={actor}
          onChange={(e) => updateParam("actor", e.target.value)}
          className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm"
        >
          <option value="">All users</option>
          {actorOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        {tab === "logins" && (
          <select
            value={event}
            onChange={(e) => updateParam("event", e.target.value)}
            className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm capitalize"
          >
            <option value="">All events</option>
            {LOGIN_EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {ev.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        )}
      </div>

      <Panel>
        {tab === "changes" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="w-6 pb-3"></th>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => {
                  const expanded = expandedId === entry.id;
                  const hasDetail = entry.previousValue || entry.newValue || entry.reason || entry.ipAddress;
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        className={clsx("border-t", hasDetail && "cursor-pointer hover:bg-orange-50/30")}
                        onClick={() => hasDetail && setExpandedId(expanded ? null : entry.id)}
                      >
                        <td className="py-3 text-slate-400">
                          {hasDetail && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                        </td>
                        <td className="min-w-[11rem] py-3 text-slate-500">{formatDateTime(entry.createdAt)}</td>
                        <td className="whitespace-nowrap font-semibold">{entry.actorName}</td>
                        <td className="whitespace-nowrap">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{entry.action}</span>
                        </td>
                        <td className="whitespace-nowrap text-slate-500">
                          {entry.entityType}
                          {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t bg-slate-50/60">
                          <td colSpan={5} className="p-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              {entry.previousValue && (
                                <div>
                                  <div className="text-xs font-bold uppercase text-slate-400">Before</div>
                                  <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-2 text-xs">
                                    {JSON.stringify(entry.previousValue, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {entry.newValue && (
                                <div>
                                  <div className="text-xs font-bold uppercase text-slate-400">After</div>
                                  <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-2 text-xs">
                                    {JSON.stringify(entry.newValue, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                            {entry.reason && (
                              <p className="mt-2 text-sm text-slate-600">
                                <span className="font-bold">Reason: </span>
                                {entry.reason}
                              </p>
                            )}
                            {(entry.ipAddress || entry.userAgent) && (
                              <p className="mt-2 text-xs text-slate-400">
                                {entry.ipAddress}
                                {entry.ipAddress && entry.userAgent && " · "}
                                {entry.userAgent}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {auditEntries.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No audit entries yet.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-3">When</th>
                  <th>User</th>
                  <th>Event</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {loginRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="min-w-[11rem] py-3 text-slate-500">{formatDateTime(r.createdAt)}</td>
                    <td className="whitespace-nowrap font-semibold">{r.userName}</td>
                    <td className="whitespace-nowrap">
                      <span
                        className={clsx(
                          "rounded-full px-2.5 py-1 text-xs font-bold capitalize",
                          LOGIN_EVENT_BADGE[r.event] ?? "bg-slate-100 text-slate-600",
                        )}
                      >
                        {r.event.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{r.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loginRows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No login activity yet.</p>}
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={tab === "changes" ? auditTotal : loginTotal} />
      </Panel>
    </div>
  );
}
