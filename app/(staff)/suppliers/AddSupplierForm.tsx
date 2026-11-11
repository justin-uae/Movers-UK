"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { createSupplierAction } from "./actions";
import { BRAND } from "@/lib/brandConfig";

export function AddSupplierForm() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createSupplierAction({ error: null, link: null, emailError: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setLink(result.link);
      notify(result.emailError ? `Supplier created, but the invite email couldn't be sent (${result.emailError})` : "Supplier created — invite email sent");
    });
  }

  if (link) {
    return (
      <div className="w-full max-w-xl rounded-2xl border p-5">
        <h3 className="font-black">Share this invite link</h3>
        <p className="mt-1 text-sm text-slate-500">
          The invite email was sent to them directly — this link is also here in case you'd rather share it yourself or the email didn't arrive.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 p-3">
          <code className="flex-1 truncate text-sm">{link}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => notify("Link copied"))}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white"
          >
            Copy
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setLink(null);
            setOpen(false);
          }}
          className="mt-4 rounded-xl border px-4 py-2.5 text-sm font-bold"
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
      >
        <Plus size={17} />
        Add Supplier
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="w-full max-w-xl rounded-2xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Supplier / company name
          <input name="name" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Type
          <select name="type" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            <option value="company">Company / removals firm</option>
            <option value="individual">Individual driver</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Contact name
          <input name="contactName" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Email
          <input name="email" type="email" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Phone
          <PhoneNumberField name="phone" className="mt-2" />
        </label>
        <label className="text-sm font-bold">
          WhatsApp
          <PhoneNumberField name="whatsapp" className="mt-2" />
        </label>
        <label className="text-sm font-bold">
          Region / location covered
          <input name="region" placeholder={`e.g. ${BRAND.exampleRegion}`} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Notes
          <textarea name="notes" className="mt-2 min-h-20 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
      </div>
      {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create supplier"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
}
