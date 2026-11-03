"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { createCustomerAction } from "./actions";
import type { DuplicateCustomerMatch } from "@/lib/customerDuplicates";

export function NewCustomerForm() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateCustomerMatch | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCustomerAction({ error: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.duplicate) {
        setDuplicate(result.duplicate);
        return;
      }
      notify("Customer created");
      setOpen(false);
    });
  }

  function createAnyway(formData: FormData) {
    formData.set("confirmedDuplicate", "true");
    handleSubmit(formData);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white">
        <Plus size={17} />
        Add Customer
      </button>
    );
  }

  return (
    <form action={duplicate ? createAnyway : handleSubmit} className="w-full max-w-xl rounded-2xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Contact name
          <input name="contactName" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Company name
          <input name="companyName" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Email
          <input name="email" type="email" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Phone
          <PhoneNumberField name="phone" className="mt-2" />
        </label>
        <label className="text-sm font-bold">
          Country
          <input name="country" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Notes
          <textarea name="notes" className="mt-2 min-h-20 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
      </div>
      {duplicate && (
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          A customer matching this email or phone already exists: {duplicate.label}. Submit again to create a
          separate record anyway, or cancel and use the existing one.
        </div>
      )}
      {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className={
            "rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 " +
            (duplicate ? "bg-amber-500" : "bg-primary-500")
          }
        >
          {pending ? "Creating…" : duplicate ? "Create anyway" : "Create customer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
}
