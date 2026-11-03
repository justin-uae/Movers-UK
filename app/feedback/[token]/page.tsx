import { notFound } from "next/navigation";
import { Bus, CheckCircle2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { FeedbackForm } from "./FeedbackForm";

export default async function PublicFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: feedback } = await admin
    .from("customer_feedback")
    .select("id, submitted_at, quotes(brands(name, primary_color))")
    .eq("public_token", token)
    .maybeSingle();

  if (!feedback) notFound();

  const brand = (feedback.quotes as unknown as { brands: { name: string; primary_color: string } | null } | null)?.brands;

  return (
    <div className="grid min-h-screen place-items-center bg-appbg px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl text-white"
            style={{ backgroundColor: brand?.primary_color ?? "#f97316" }}
          >
            <Bus size={26} />
          </div>
          <div className="text-lg font-black text-slate-900">{brand?.name ?? "Your feedback"}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {feedback.submitted_at ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
              <h1 className="mt-3 text-xl font-black">Thanks — feedback received</h1>
              <p className="mt-1 text-sm text-slate-500">You&apos;ve already shared your feedback for this trip.</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-black">How likely are you to recommend us?</h1>
              <p className="mt-1 text-sm text-slate-500">0 = not at all likely, 10 = extremely likely.</p>
              <FeedbackForm token={token} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
