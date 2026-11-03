import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { PageGuide } from "@/components/ui/PageGuide";
import { CustomersDiagram } from "@/components/ui/guide-diagrams/CustomersDiagram";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewCustomerForm } from "./NewCustomerForm";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireProfile();
  const supabase = await createClient();
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("customers")
    .select("id, company_name, contact_name, email, phone, whatsapp, country, created_at, profiles(full_name)", {
      count: "exact",
    });
  if (q) {
    query = query.or(
      `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }

  const { data: customers, count } = await query.order("created_at", { ascending: false }).range(from, to);

  return (
    <div>
      <PageHead
        eyebrow="Sales Workspace"
        title="Customers"
        text="Every company and contact your team has quoted or booked for."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Customers"
              subtitle="The company and contact record behind every lead, quote and booking."
              screenshot={<CustomersDiagram />}
              sections={[
                {
                  heading: "What this page is",
                  body: [
                    "Every company or individual your team has quoted or booked for gets a customer record here — name, contact details, country and which account manager owns the relationship.",
                    "Customer records are usually created automatically the first time someone submits a lead, but you can also add one manually with New Customer (e.g. for a client you're onboarding before their first enquiry).",
                  ],
                },
                {
                  heading: "Using the list",
                  bullets: true,
                  body: [
                    "Search by name, company, email or phone to find an existing customer before creating a duplicate.",
                    "Click a row (or View) to open the customer's full history — past leads, quotes, bookings and payments.",
                    "Account manager shows who owns that customer relationship on your team.",
                  ],
                },
              ]}
            />
            <NewCustomerForm />
          </div>
        }
      />
      <div className="mb-4 flex gap-2">
        <SearchInput placeholder="Search by name, company, email or phone…" />
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Country</th>
                <th>Account manager</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).map((c) => (
                <tr key={c.id} className="cursor-pointer border-t hover:bg-orange-50/30">
                  <td className="max-w-[220px] py-4">
                    <Link href={`/customers/${c.id}`} className="block" title={c.company_name || c.contact_name || undefined}>
                      <div className="truncate font-bold">{c.company_name || c.contact_name}</div>
                      {c.company_name && <div className="truncate text-xs text-slate-500">{c.contact_name}</div>}
                    </Link>
                  </td>
                  <td className="max-w-[200px]">
                    <Link href={`/customers/${c.id}`} className="block truncate" title={c.email ?? undefined}>
                      {c.email ?? "—"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link href={`/customers/${c.id}`} className="block">{c.phone ?? "—"}</Link>
                      <WhatsAppLink number={c.whatsapp || c.phone} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/customers/${c.id}`} className="block">{c.country ?? "—"}</Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/customers/${c.id}`} className="block">
                      {(c.profiles as unknown as { full_name: string } | null)?.full_name ?? "—"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/customers/${c.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold text-slate-500">
                      View
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(customers ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              {q ? "No customers match your search." : "No customers yet — add one to get started."}
            </p>
          )}
        </div>
      </Panel>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
