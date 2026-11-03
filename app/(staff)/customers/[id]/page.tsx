import { notFound } from "next/navigation";
import Link from "next/link";
import { FileText, MapPin, Banknote, CheckSquare } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BackLink } from "@/components/ui/BackLink";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FormattedText } from "@/components/ui/FormattedText";
import { SendEmailButton } from "@/components/ui/SendEmailButton";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatDate";
import type { EnquiryStatus, QuoteStatus, TaskStatus } from "@/lib/supabase/database.types";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_STYLE } from "@/lib/quoteStatus";

const ENQUIRY_STATUS_STYLE: Record<EnquiryStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-50 text-blue-700",
  quoting: "bg-blue-50 text-blue-700",
  awaiting_customer: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  converted_to_booking: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
};

function money(amount: number | undefined | null, currency: string) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

interface EnquiryRow {
  id: string;
  status: EnquiryStatus;
  created_at: string;
  enquiry_legs: { pickup_address: string; destination_address: string }[];
}

interface QuoteRow {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  created_at: string;
  quote_versions: { selling_price: number } | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  method: string;
  paid_at: string;
  quotes: { id: string; quote_number: string } | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
}

type TimelineEvent = {
  id: string;
  at: string;
  icon: typeof MapPin;
  title: string;
  subtitle: string;
  href?: string;
  badge: { label: string; className: string };
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const [{ data: customer }, { data: enquiries }, { data: quotes }, { data: payments }, { data: tasks }] =
    await Promise.all([
      supabase.from("customers").select("*, profiles:account_manager_id(full_name)").eq("id", id).single(),
      supabase
        .from("enquiries")
        .select("id, status, created_at, enquiry_legs(pickup_address, destination_address)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("quotes")
        .select("id, quote_number, status, currency, created_at, quote_versions!quotes_current_version_id_fkey(selling_price)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_payments")
        .select("id, amount, currency, method, paid_at, quotes!inner(id, quote_number, customer_id)")
        .eq("quotes.customer_id", id)
        .order("paid_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, title, status, created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!customer) notFound();

  const accountManager = (customer.profiles as unknown as { full_name: string } | null)?.full_name ?? null;
  const enquiryRows = (enquiries ?? []) as unknown as EnquiryRow[];
  const quoteRows = (quotes ?? []) as unknown as QuoteRow[];
  const paymentRows = (payments ?? []) as unknown as PaymentRow[];
  const taskRows = (tasks ?? []) as unknown as TaskRow[];

  const timeline: TimelineEvent[] = [
    ...enquiryRows.map((e) => {
      const leg = e.enquiry_legs?.[0];
      return {
        id: `enquiry-${e.id}`,
        at: e.created_at,
        icon: MapPin,
        title: leg ? `${leg.pickup_address} → ${leg.destination_address}` : "Enquiry — no journey recorded",
        subtitle: formatDateTime(e.created_at),
        badge: { label: e.status.replaceAll("_", " "), className: ENQUIRY_STATUS_STYLE[e.status] },
      };
    }),
    ...quoteRows.map((q) => ({
      id: `quote-${q.id}`,
      at: q.created_at,
      icon: FileText,
      title: q.quote_number,
      subtitle: `${money(q.quote_versions?.selling_price, q.currency)} · ${formatDateTime(q.created_at)}`,
      href: `/quotes/${q.id}`,
      badge: { label: QUOTE_STATUS_LABEL[q.status], className: QUOTE_STATUS_STYLE[q.status] },
    })),
    ...paymentRows.map((p) => ({
      id: `payment-${p.id}`,
      at: p.paid_at,
      icon: Banknote,
      title: `${money(p.amount, p.currency)} received`,
      subtitle: `${p.method.replaceAll("_", " ")} · ${p.quotes?.quote_number ?? "—"} · ${formatDateTime(p.paid_at)}`,
      href: p.quotes ? `/quotes/${p.quotes.id}` : undefined,
      badge: { label: "payment", className: "bg-emerald-50 text-emerald-700" },
    })),
    ...taskRows.map((t) => ({
      id: `task-${t.id}`,
      at: t.created_at,
      icon: CheckSquare,
      title: t.title,
      subtitle: formatDateTime(t.created_at),
      badge: { label: t.status.replaceAll("_", " "), className: TASK_STATUS_STYLE[t.status] },
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div>
      <Breadcrumb items={[{ label: "Customers", href: "/customers" }, { label: customer.company_name || customer.contact_name }]} />
      <PageHead
        eyebrow="Sales Workspace"
        title={customer.company_name || customer.contact_name}
        text={customer.company_name ? customer.contact_name : undefined}
        action={<BackLink fallbackHref="/customers" label="Back to Customers" />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionTitle title="Contact details" sub="How this customer was reached and billed" />
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Email" value={customer.email} />
            <Row label="Phone" value={customer.phone} whatsApp />
            <Row label="Mobile" value={customer.mobile} whatsApp />
            <Row label="WhatsApp" value={customer.whatsapp} whatsApp />
            <Row label="Country" value={customer.country} />
            <Row label="Preferred language" value={customer.preferred_language} />
            <Row label="VAT number" value={customer.vat_number} />
            <Row label="Account manager" value={accountManager} />
            {customer.billing_address && (
              <div className="border-t pt-2">
                <div className="text-slate-500">Billing address</div>
                <p className="mt-1">{customer.billing_address}</p>
              </div>
            )}
            {customer.notes && (
              <div className="border-t pt-2">
                <div className="text-slate-500">Internal notes</div>
                <div className="mt-1">
                  <FormattedText text={customer.notes} />
                </div>
              </div>
            )}
          </div>
          {/* Subject uses their most recent quote (quoteRows is newest-first). */}
          <SendEmailButton email={customer.email} quoteNumber={quoteRows[0]?.quote_number} className="mt-4" />
        </Panel>

        <Panel>
          <SectionTitle title="Activity timeline" sub={`${timeline.length} events across enquiries, quotes, payments and tasks`} />
          <div className="mt-4 space-y-2">
            {timeline.map((ev) => {
              const Icon = ev.icon;
              const inner = (
                <>
                  <Icon size={16} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{ev.title}</div>
                    <div className="text-xs text-slate-500">{ev.subtitle}</div>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold capitalize ${ev.badge.className}`}
                  >
                    {ev.badge.label}
                  </span>
                </>
              );
              return ev.href ? (
                <Link key={ev.id} href={ev.href} className="flex items-center gap-3 rounded-xl border p-3 text-sm hover:bg-slate-50">
                  {inner}
                </Link>
              ) : (
                <div key={ev.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  {inner}
                </div>
              );
            })}
            {timeline.length === 0 && <p className="text-sm text-slate-400">No activity recorded yet.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value, whatsApp = false }: { label: string; value: string | null; whatsApp?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate whitespace-nowrap text-right font-semibold">{value ?? "—"}</span>
        {whatsApp && <WhatsAppLink number={value} />}
      </span>
    </div>
  );
}
