"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { UserPlus, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { inviteUserAction } from "./actions";
import { BRAND } from "@/lib/brandConfig";

export function InviteUserForm({
  roles,
  brands,
}: {
  roles: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [regions, setRegions] = useState<string[]>([]);
  const [regionInput, setRegionInput] = useState("");

  function addRegion() {
    const value = regionInput.trim();
    if (value && !regions.includes(value)) setRegions([...regions, value]);
    setRegionInput("");
  }

  function handleRegionKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addRegion();
    }
  }

  function removeRegion(value: string) {
    setRegions(regions.filter((r) => r !== value));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteUserAction({ error: null, link: null, emailError: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setLink(result.link);
      notify(result.emailError ? `User created, but the invite email couldn't be sent (${result.emailError})` : "User created — invite email sent");
    });
  }

  if (link) {
    return (
      <div className="w-full max-w-xl rounded-2xl border p-5">
        <h3 className="font-black">Share this invite link</h3>
        <p className="mt-1 text-sm text-slate-500">
          The invite email was sent to them directly — this link is also here in case you'd rather share it yourself (WhatsApp, Slack, etc.) or the email didn't arrive.
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
            setRegions([]);
            setRegionInput("");
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
        <UserPlus size={17} />
        Invite User
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="w-full max-w-xl rounded-2xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Full name
          <input name="fullName" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Email
          <input name="email" type="email" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Job title
          <input name="jobTitle" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Role
          <select name="roleId" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Brand / Branch
          <select name="brandId" required disabled={brands.length === 0} className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            {brands.length === 0 && <option value="">Create a brand first</option>}
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-400">
            Every user belongs to exactly one brand/branch — it drives quote and invoice identity.
          </span>
        </label>
        <div className="text-sm font-bold sm:col-span-2">
          Regions / locations covered
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 font-normal">
            {regions.map((r) => (
              <span
                key={r}
                className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700"
              >
                {r}
                <button
                  type="button"
                  onClick={() => removeRegion(r)}
                  className="rounded-full hover:bg-primary-100"
                  aria-label={`Remove ${r}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              value={regionInput}
              onChange={(e) => setRegionInput(e.target.value)}
              onKeyDown={handleRegionKeyDown}
              onBlur={addRegion}
              placeholder={regions.length === 0 ? `e.g. ${BRAND.exampleRegion} — press Enter to add` : "Add another…"}
              className="min-w-[8rem] flex-1 border-none p-0 text-sm outline-none"
            />
          </div>
          {regions.map((region) => (
            <input key={region} type="hidden" name="regions" value={region} />
          ))}
          <span className="mt-1 block text-xs font-normal text-slate-400">
            Incoming leads whose pickup/destination location matches any of these regions can route to this
            user. A user can cover multiple regions.
          </span>
        </div>
      </div>
      {error && (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create invite"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border px-4 py-2.5 text-sm font-bold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
