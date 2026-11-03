import { getProfile } from "@/lib/auth";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  // The reset flow is code-only (ResetPasswordForm) — verifying the emailed
  // code establishes the session client-side on this same page, so this
  // server-side check only matters for the rare case of someone with an
  // already-active session landing here directly.
  const profile = await getProfile();

  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900">Reset password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your email and we'll send you a one-time code to set a new password.
      </p>
      <div className="mt-6">
        <ResetPasswordForm hasSession={Boolean(profile)} />
      </div>
    </div>
  );
}
