import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { RolesDiagram } from "@/components/ui/guide-diagrams/RolesDiagram";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewRoleForm } from "./NewRoleForm";

export default async function RolesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, description, is_system, role_permissions(count)")
    .order("is_system", { ascending: false })
    .order("name");

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Roles & Permissions"
        text="Predefined system roles plus any custom roles for your organisation."
        action={
          <div className="flex flex-wrap items-start gap-2">
            <PageGuide
              title="Roles & Permissions"
              subtitle="The permission catalogue — grouped into roles, one checkbox grid per role."
              screenshot={<RolesDiagram />}
              sections={[
                {
                  heading: "System vs custom roles",
                  body: [
                    "System roles (Master Admin, Sales User, Ops User, Finance Manager, etc.) ship with the CRM and cover most day-to-day needs — their permissions can still be adjusted for your tenant. New role builds a custom role from scratch when a system role doesn't fit.",
                  ],
                },
                {
                  heading: "The permission grid",
                  body: [
                    "Open a role to see every permission, grouped by category (Bookings & Dispatch, Finance, Administration, etc.), with a checkbox for each. Master Admin bypasses every check regardless of what's ticked here — it's the one role that can't be locked out of anything.",
                  ],
                },
                {
                  heading: "Where else permissions show up",
                  body: [
                    "A permission key here is the same key referenced everywhere else in the CRM — e.g. bookings.amend is what gates the Edit Booking button on a quote/job. Granting or revoking it here takes effect immediately for anyone with that role.",
                  ],
                },
              ]}
            />
            <NewRoleForm />
          </div>
        }
      />
      <div className="grid gap-3">
        {(roles ?? []).map((role) => (
          <Link key={role.id} href={`/settings/roles/${role.id}`}>
            <Panel className="flex items-center justify-between gap-3 transition hover:border-primary-300">
              <div className="flex items-center gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <b>{role.name}</b>
                    {role.is_system && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                        System
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{role.description ?? "No description"}</p>
                </div>
              </div>
              <ChevronRight className="text-slate-300" size={18} />
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
