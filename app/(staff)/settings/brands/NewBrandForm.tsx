"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { createBrandAction } from "./actions";
import { BRAND } from "@/lib/brandConfig";

export function NewBrandForm({ companies }: { companies: { id: string; legal_name: string }[] }) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createBrandAction({ error: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify("Brand created");
      setOpen(false);
    });
  }

  if (companies.length === 0) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
        <Plus className="mr-2 inline" size={16} />
        New Brand
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="mt-4 w-full max-w-xl rounded-2xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Company
          <select name="companyId" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Brand name
          <input name="name" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Default currency
          <input name="defaultCurrency" defaultValue={BRAND.defaultCurrency} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Primary colour
          <input name="primaryColor" type="color" defaultValue="#f97316" className="mt-2 h-11 w-full rounded-xl border px-1" />
        </label>
      </div>
      {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create brand"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
}
