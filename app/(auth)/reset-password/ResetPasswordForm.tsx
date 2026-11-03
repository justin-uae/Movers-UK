"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Code-only reset flow — no email link. A clickable link depends on
 * Supabase's hosted verify redirect surviving intact until the person
 * actually clicks it, which turned out to be unreliable in practice
 * (something — a mail-side scanner, antivirus, etc. — could pre-visit and
 * burn the one-time token before the real click). A 6-digit code typed in by
 * hand has nothing for that to consume. The "Reset Password" email template
 * only needs to show {{ .Token }} — see README.
 */
export function ResetPasswordForm({ hasSession = false }: { hasSession?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"request" | "confirm">(hasSession ? "confirm" : "request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email);
      if (requestError) {
        setError(requestError.message);
        return;
      }
      setSent(true);
      setMessage("If an account exists for that email, we've sent a 6-digit code — enter it below along with your new password.");
    });
  }

  /** One submit does both steps — verifying the code establishes the
      recovery session, then updateUser immediately sets the new password
      against it, so the person never has to see or think about the
      intermediate session step. */
  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "recovery" });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push("/dashboard");
    });
  }

  if (mode === "confirm") {
    return (
      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="text-sm font-bold text-slate-700" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
          />
        </div>
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-primary-500 py-3 text-sm font-black text-white hover:bg-primary-600 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Set new password"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sent ? handleReset : handleRequest} className="space-y-4">
      <div>
        <label className="text-sm font-bold text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          disabled={sent}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100 disabled:bg-slate-50 disabled:text-slate-500"
        />
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {sent && (
        <>
          <div>
            <label className="text-sm font-bold text-slate-700" htmlFor="code">
              6-digit code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              required
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
            />
            <p className="mt-1 text-xs text-slate-400">From the email we just sent — check spam if you don't see it within a minute.</p>
          </div>
          <div>
            <label className="text-sm font-bold text-slate-700" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
            />
            <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-primary-500 py-3 text-sm font-black text-white hover:bg-primary-600 disabled:opacity-60"
      >
        {pending ? (sent ? "Saving…" : "Sending…") : sent ? "Reset password" : "Send code"}
      </button>
      {sent && (
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setMessage(null);
            setError(null);
          }}
          className="w-full text-center text-sm font-bold text-slate-500 hover:text-slate-700"
        >
          Use a different email
        </button>
      )}
    </form>
  );
}
