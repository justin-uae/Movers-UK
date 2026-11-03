import Link from "next/link";
import { notFound } from "next/navigation";
import { BellRing, CheckCircle2, MessageSquareReply, Wallet } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Kpi } from "@/components/ui/Kpi";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REMINDER_OFFSETS_HOURS, offsetLabel } from "@/lib/quoteReminderSchedule";
import { CUSTOMER_REPLIED_REASON } from "@/lib/quoteReminders";
import { QuoteRemindersForm } from "./QuoteRemindersForm";

const STATS_DAYS = 30;
const CONVERTED = new Set(["accepted", "partially_paid", "paid"]);
const PAID = new Set(["partially_paid", "paid"]);

interface ReminderStatRow {
  quote_id: string;
  kind: "sales" | "payment";
  step: number;
  sent_at: string;
  quotes: { status: string; decided_at: string | null; currency: string; quote_versions: { selling_price: number } | null } | null;
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export default async function QuoteRemindersSettingsPage() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) notFound();

  const supabase = await createClient();
  const since = new Date(Date.now() - STATS_DAYS * 86400000).toISOString();
  const [{ data: tenant }, { data: remindersRaw }, { data: replyEvents }] = await Promise.all([
    supabase.from("tenants").select("quote_reminders_enabled, quote_reminders_enabled_at").eq("id", profile.tenant_id).single(),
    supabase
      .from("quote_reminders")
      .select("quote_id, kind, step, sent_at, quotes(status, decided_at, currency, quote_versions!quotes_current_version_id_fkey(selling_price))")
      .is("error", null)
      .gte("sent_at", since),
    supabase.from("quote_events").select("quote_id").eq("event", "reminders_paused").like("detail", `${CUSTOMER_REPLIED_REASON}%`).gte("created_at", since),
  ]);
  const reminders = (remindersRaw ?? []) as unknown as ReminderStatRow[];

  // ---- Results over the last 30 days -------------------------------------
  // A quote counts as converted by follow-up when the customer accepted it
  // after its first reminder; the credit goes to the last sales reminder
  // they received before accepting.
  const byQuote = new Map<string, ReminderStatRow[]>();
  for (const r of reminders) byQuote.set(r.quote_id, [...(byQuote.get(r.quote_id) ?? []), r]);

  const salesQuotes = [...byQuote.entries()].filter(([, rows]) => rows.some((r) => r.kind === "sales"));
  const paymentQuotes = [...byQuote.entries()].filter(([, rows]) => rows.some((r) => r.kind === "payment"));
  const repliedIds = new Set((replyEvents ?? []).map((e) => e.quote_id));

  const bookingsByStep = new Map<number, number>();
  const revenueByCurrency = new Map<string, number>();
  let converted = 0;
  for (const [, rows] of salesQuotes) {
    const quote = rows[0]!.quotes;
    if (!quote || !CONVERTED.has(quote.status) || !quote.decided_at) continue;
    const before = rows.filter((r) => r.kind === "sales" && r.sent_at < quote.decided_at!).sort((a, b) => a.step - b.step);
    const last = before[before.length - 1];
    if (!last) continue;
    converted++;
    bookingsByStep.set(last.step, (bookingsByStep.get(last.step) ?? 0) + 1);
    revenueByCurrency.set(quote.currency, (revenueByCurrency.get(quote.currency) ?? 0) + (quote.quote_versions?.selling_price ?? 0));
  }
  const paidAfterReminder = paymentQuotes.filter(([, rows]) => rows[0]!.quotes && PAID.has(rows[0]!.quotes.status)).length;
  const replied = salesQuotes.filter(([id]) => repliedIds.has(id)).length + paymentQuotes.filter(([id]) => repliedIds.has(id)).length;
  const remindedTotal = byQuote.size;
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  const revenue = [...revenueByCurrency.entries()].map(([c, a]) => formatMoney(a, c)).join(" · ") || "—";

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Quote Reminders"
        text="Automatically follow up quotes that haven't been accepted, and accepted quotes that haven't been paid."
        action={
          <PageGuide
            title="Quote Reminders"
            subtitle="Turns more quotes into paid bookings without sales having to chase every customer by hand."
            sections={[
              {
                heading: "Sales reminders (quote sent, not accepted yet)",
                bullets: true,
                body: [
                  "Up to 5 emails: 2 hours, 24 hours, 48 hours, 72 hours and 5 days after the quote was sent — each a little more direct, every one with a button to view and accept the quote.",
                  "None of them offer a discount. Reminder 3 offers to review the price, so a customer who wants a better deal replies and a salesperson decides.",
                ],
              },
              {
                heading: "Payment reminders (accepted, not paid yet)",
                bullets: true,
                body: [
                  "A customer who has accepted but not paid gets payment reminders with their secure payment link instead — 1, 3 and 5 days after accepting — never more sales emails.",
                  "Any payment at all, including a bank transfer still waiting to be verified, stops them.",
                ],
              },
              {
                heading: "When reminders stop or pause",
                bullets: true,
                body: [
                  "Stop for good once the quote is accepted (sales reminders), paid, rejected, cancelled or expired.",
                  "Pause automatically when the customer replies by email — a salesperson should pick that conversation up. Resume it from the quote page once handled.",
                  "Stop for every quote of a customer who clicks \"Stop reminders\" at the bottom of any reminder email.",
                  "Anyone who manages the quote can pause or resume it from the Follow-up reminders panel on the quote page.",
                ],
              },
              {
                heading: "Trips coming up soon",
                body: [
                  "If the trip is too close for the full schedule, every reminder is brought forward proportionally so the sequence still fits before travel. Nothing is sent in the last 12 hours before the trip, or after the quote expires.",
                ],
              },
              {
                heading: "Timeline and wording",
                bullets: true,
                body: [
                  "Every reminder sent, and every pause, resume or opt-out, is recorded on that quote's Timeline.",
                  "The 6 emails are editable in Email Centre -> Templates (Quote reminder 1-5, Payment reminder). Each is sent as the quote's salesperson, from their own mailbox when connected, so replies land in the CRM.",
                ],
              },
            ]}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionTitle title="Switch" sub="Off by default — review the email templates first" />
          <QuoteRemindersForm initialEnabled={tenant?.quote_reminders_enabled ?? false} />
          <Link href="/email" className="mt-4 inline-block text-sm font-bold text-primary-600">
            Review the 6 templates in Email Centre → Templates
          </Link>
        </Panel>

        <Panel>
          <SectionTitle title="Schedule" sub="Hours after the quote was sent (or accepted, for payment reminders)" />
          <ol className="mt-4 space-y-2 text-sm">
            {REMINDER_OFFSETS_HOURS.sales.map((h, i) => (
              <li key={`s${i}`} className="flex justify-between border-b pb-2">
                <span className="font-semibold">Reminder {i + 1}</span>
                <span className="text-slate-500">{offsetLabel(h)}</span>
              </li>
            ))}
            {REMINDER_OFFSETS_HOURS.payment.map((h, i) => (
              <li key={`p${i}`} className="flex justify-between border-b pb-2 last:border-0">
                <span className="font-semibold">Payment reminder {i + 1}</span>
                <span className="text-slate-500">{offsetLabel(h)} after acceptance</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <h2 className="mt-8 text-lg font-black">Results — last {STATS_DAYS} days</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Quotes followed up" value={String(salesQuotes.length)} delta={`${paymentQuotes.length} sent payment reminders`} icon={BellRing} />
        <Kpi title="Quote-to-booking conversion" value={pct(converted, salesQuotes.length)} delta={`${converted} accepted after a reminder`} icon={CheckCircle2} />
        <Kpi title="Customers who replied" value={pct(replied, remindedTotal)} delta={`${replied} of ${remindedTotal} reminded quotes`} icon={MessageSquareReply} />
        <Kpi title="Revenue recovered" value={revenue} delta={`${paidAfterReminder} paid after a payment reminder`} icon={Wallet} />
      </div>

      <Panel className="mt-4">
        <SectionTitle title="Which reminder converts best" sub="Bookings credited to the last reminder the customer got before accepting" />
        <ol className="mt-4 space-y-2 text-sm">
          {REMINDER_OFFSETS_HOURS.sales.map((h, i) => {
            const count = bookingsByStep.get(i + 1) ?? 0;
            const widthPct = converted > 0 ? (count / converted) * 100 : 0;
            return (
              <li key={i} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3">
                <span className="font-semibold">
                  Reminder {i + 1} <span className="font-normal text-slate-400">({offsetLabel(h)})</span>
                </span>
                <span className="h-2.5 rounded-full bg-slate-100">
                  <span className="block h-2.5 rounded-full bg-primary-500" style={{ width: `${widthPct}%` }} />
                </span>
                <span className="text-right font-bold">{count}</span>
              </li>
            );
          })}
        </ol>
        {converted === 0 && <p className="mt-3 text-sm text-slate-500">No bookings from reminders yet in this period.</p>}
      </Panel>
    </div>
  );
}
