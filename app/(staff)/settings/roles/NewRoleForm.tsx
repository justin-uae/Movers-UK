"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { createRoleAction } from "./actions";

export function NewRoleForm() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createRoleAction({ error: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify("Role created");
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
        New Custom Role
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-2xl border p-4">
      <label className="text-sm font-bold">
        Role name
        <input name="name" required className="mt-2 block rounded-xl border px-3 py-2.5 font-normal" />
      </label>
      <label className="text-sm font-bold">
        Description
        <input name="description" className="mt-2 block w-64 rounded-xl border px-3 py-2.5 font-normal" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
        Cancel
      </button>
      {error && <div className="w-full text-sm font-semibold text-red-700">{error}</div>}
    </form>
  );
}
