"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { signInAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signInAction({ error: null }, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="text-sm font-bold text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
        />
      </div>
      <div>
        <label className="text-sm font-bold text-slate-700" htmlFor="password">
          Password
        </label>
        <div className="relative mt-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-200 px-3 py-3 pr-11 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
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
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="text-center text-sm">
        <Link href="/reset-password" className="font-bold text-primary-600 hover:underline">
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}
