"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { createCompanyAction } from "./actions";
import { BRAND } from "@/lib/brandConfig";

export function NewCompanyForm() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCompanyAction({ error: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify("Company created");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
      >
        <Plus size={17} />
        New Company
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="w-full max-w-xl rounded-2xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Legal company name
          <input name="legalName" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Trading name
          <input name="tradingName" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Default currency
          <input name="defaultCurrency" defaultValue={BRAND.defaultCurrency} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
      </div>
      {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create company"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
}
