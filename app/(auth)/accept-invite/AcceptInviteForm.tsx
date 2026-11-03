"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { activateAccount } from "./actions";

export function AcceptInviteForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setError("Your invite link has expired or was already used. Ask an administrator to send a new one.");
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
          setError(updateError.message);
          return;
        }

        const result = await activateAccount();
        if (result?.error) {
          setError(result.error);
          return;
        }

        router.push(result.redirectTo ?? "/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong setting up your account.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-bold text-slate-700" htmlFor="password">
          Choose a password
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
      <div>
        <label className="text-sm font-bold text-slate-700" htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
        {pending ? "Setting up your account…" : "Activate account"}
      </button>
    </form>
  );
}
