import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatDate";
import { CardPaymentRequestDecision } from "@/components/pages/CardPaymentRequestDecision";

interface RequestRow {
  id: string;
  quote_id: string;
  reason: string | null;
  amount_gbp: number;
  status: "pending" | "approved" | "rejected";
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  requested_by_profile: { full_name: string } | null;
  decided_by_profile: { full_name: string } | null;
  quotes: { quote_number: string } | null;
}

export default async function CardPaymentRequestsPage() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("card_payment_override_requests")
    .select(
      "id, quote_id, reason, amount_gbp, status, decision_note, decided_at, created_at, requested_by_profile:profiles!card_payment_override_requests_requested_by_fkey(full_name), decided_by_profile:profiles!card_payment_override_requests_decided_by_fkey(full_name), quotes(quote_number)",
    )
    .eq("tenant_id", profile.tenant_id)
    .order("status", { ascending: true }) // "pending" sorts before "approved"/"rejected"
    .order("created_at", { ascending: false });

  const requests = (data ?? []) as unknown as RequestRow[];
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div>
      <PageHead
        eyebrow="Finance"
        title="Card Payment Requests"
        text="Decide whether a specific quote can offer card payment even though its amount is normally bank-transfer-only."
        action={
          <PageGuide
            title="Card Payment Requests"
            subtitle="Card (Stripe) is a real fraud-risk/processing limit above a set amount — not just a default — so lifting it is always a deliberate, one-quote-at-a-time decision, never automatic."
            sections={[
              {
                heading: "How it works",
                bullets: true,
                body: [
                  "Staff request this from a quote's own page when its amount is too high for card payment — you get an email, and it shows up here.",
                  "Approving only ever ADDS card payment as an option — bank transfer stays available too, it's never removed.",
                  "Every request and decision is recorded on that quote's own Timeline, and on the originating lead's Assignment history, with the amount and any note.",
                ],
              },
            ]}
          />
        }
      />

      <Panel>
        <SectionTitle title="Pending" sub={`${pending.length} awaiting a decision`} />
        <div className="mt-4 space-y-3">
          {pending.map((r) => (
            <div key={r.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/quotes/${r.quote_id}`} className="font-bold text-primary-600 hover:underline">
                    {r.quotes?.quote_number ?? "Quote"}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">
                    Requested by <b>{r.requested_by_profile?.full_name ?? "a staff member"}</b> — £{Number(r.amount_gbp).toFixed(2)}
                  </p>
                  {r.reason && <p className="mt-1 text-sm text-slate-500">&ldquo;{r.reason}&rdquo;</p>}
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(r.created_at)}</p>
                </div>
                <CardPaymentRequestDecision requestId={r.id} quoteNumber={r.quotes?.quote_number ?? "this quote"} amountGbp={Number(r.amount_gbp)} />
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="text-sm text-slate-500">Nothing waiting on a decision.</p>}
        </div>
      </Panel>

      {decided.length > 0 && (
        <Panel className="mt-5">
          <SectionTitle title="Decided" sub="Approved or rejected requests" />
          <div className="mt-4 space-y-3">
            {decided.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 text-sm last:border-0">
                <div>
                  <Link href={`/quotes/${r.quote_id}`} className="font-bold text-primary-600 hover:underline">
                    {r.quotes?.quote_number ?? "Quote"}
                  </Link>
                  <p className="mt-1 text-slate-600">
                    £{Number(r.amount_gbp).toFixed(2)} — requested by {r.requested_by_profile?.full_name ?? "a staff member"}
                  </p>
                  {r.decision_note && <p className="mt-1 text-slate-500">Note: {r.decision_note}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    {r.status === "approved" ? "Approved" : "Rejected"} by {r.decided_by_profile?.full_name ?? "Master Admin"}
                    {r.decided_at ? ` · ${formatDateTime(r.decided_at)}` : ""}
                  </p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold " +
                    (r.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
                  }
                >
                  {r.status === "approved" ? "Approved" : "Rejected"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
