import Link from "next/link";
import { notFound } from "next/navigation";
import { Bus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { stopRemindersAction } from "./actions";

export default async function StopRemindersPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("quote_number, customers(reminders_opted_out_at), quote_versions!quotes_current_version_id_fkey(brand_snapshot)")
    .eq("public_token", token)
    .single();
  if (!quote) notFound();

  const customer = quote.customers as unknown as { reminders_opted_out_at: string | null } | null;
  const brand = (quote.quote_versions as unknown as { brand_snapshot: { name: string; primary_color: string } | null } | null)?.brand_snapshot;
  const stopped = !!customer?.reminders_opted_out_at;

  return (
    <div className="grid min-h-screen place-items-center bg-appbg px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ backgroundColor: brand?.primary_color ?? "#f97316" }}>
            <Bus size={26} />
          </div>
          <div className="text-lg font-black text-slate-900">{brand?.name ?? "Your quote"}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {stopped ? (
            <>
              <h1 className="text-xl font-black">Reminders stopped</h1>
              <p className="mt-2 text-sm text-slate-600">
                You won&rsquo;t receive any more automatic reminder emails from us. If you&rsquo;d like to book later, your quote is still available.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-black">Stop reminder emails?</h1>
              <p className="mt-2 text-sm text-slate-600">
                We&rsquo;ll stop sending automatic reminders about quote {quote.quote_number} and any other quotes you have with us.
              </p>
              <form action={stopRemindersAction.bind(null, token)} className="mt-5">
                <button type="submit" className="w-full rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white">
                  Stop reminders
                </button>
              </form>
            </>
          )}
          <Link href={`/q/${token}`} className="mt-4 inline-block text-sm font-bold text-primary-600">
            View my quote
          </Link>
        </div>
      </div>
    </div>
  );
}
