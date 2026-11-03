"use client";

import { useState, useTransition } from "react";
import { Landmark, Pencil, Trash2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { createBankProfileAction, updateBankProfileAction, deleteBankProfileAction, type BankProfileInput } from "./actions";
import type { BankAccount } from "@/lib/supabase/database.types";
import { BRAND } from "@/lib/brandConfig";

const BLANK: BankProfileInput = {
  profileLabel: "",
  accountName: "",
  bankName: "",
  currency: BRAND.defaultCurrency,
  accountNumber: "",
  iban: "",
  swiftBic: "",
  sortCode: "",
  bankAddress: "",
  paymentNotes: "",
};

function toInput(p: BankAccount): BankProfileInput {
  return {
    profileLabel: p.profile_label ?? "",
    accountName: p.account_name,
    bankName: p.bank_name,
    currency: p.currency,
    accountNumber: p.account_number ?? "",
    iban: p.iban ?? "",
    swiftBic: p.swift_bic ?? "",
    sortCode: p.sort_code ?? "",
    bankAddress: p.bank_address ?? "",
    paymentNotes: p.payment_notes ?? "",
  };
}

function BankProfileFields({ value, onChange }: { value: BankProfileInput; onChange: (patch: Partial<BankProfileInput>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">
        Profile label
        <input
          value={value.profileLabel}
          onChange={(e) => onChange({ profileLabel: e.target.value })}
          placeholder="e.g. UK Local Payments"
          className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal"
        />
      </label>
      <label className="text-sm font-bold">
        Currency
        <input
          value={value.currency}
          onChange={(e) => onChange({ currency: e.target.value.toUpperCase() })}
          className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal"
        />
      </label>
      <label className="text-sm font-bold">
        Account holder
        <input value={value.accountName} onChange={(e) => onChange({ accountName: e.target.value })} className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-bold">
        Bank name
        <input value={value.bankName} onChange={(e) => onChange({ bankName: e.target.value })} className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-bold">
        Sort code
        <input value={value.sortCode} onChange={(e) => onChange({ sortCode: e.target.value })} className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-bold">
        Account number
        <input value={value.accountNumber} onChange={(e) => onChange({ accountNumber: e.target.value })} className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-bold">
        IBAN
        <input value={value.iban} onChange={(e) => onChange({ iban: e.target.value })} className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-bold">
        SWIFT / BIC
        <input value={value.swiftBic} onChange={(e) => onChange({ swiftBic: e.target.value })} className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-bold sm:col-span-2">
        Bank / remittance address
        <input
          value={value.bankAddress}
          onChange={(e) => onChange({ bankAddress: e.target.value })}
          placeholder="Shown if a sender's bank asks for one, e.g. Wise's own address"
          className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal"
        />
      </label>
      <label className="text-sm font-bold sm:col-span-2">
        Notes
        <textarea
          value={value.paymentNotes}
          onChange={(e) => onChange({ paymentNotes: e.target.value })}
          placeholder="e.g. SWIFT payments usually take 4-5 working days to arrive"
          className="mt-1.5 w-full rounded-lg border px-3 py-2 font-normal"
        />
      </label>
    </div>
  );
}

function ProfileCard({ profile, canManage }: { profile: BankAccount; canManage: boolean }) {
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<BankProfileInput>(() => toInput(profile));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateBankProfileAction(profile.id, value);
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify("Bank details updated");
      setEditing(false);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteBankProfileAction(profile.id);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Bank profile removed");
      setConfirmDelete(false);
    });
  }

  if (editing) {
    return (
      <div className="rounded-2xl border p-4">
        <BankProfileFields value={value} onChange={(patch) => setValue((v) => ({ ...v, ...patch }))} />
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button disabled={pending} onClick={save} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setValue(toInput(profile));
              setError(null);
            }}
            className="rounded-lg border px-4 py-2 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Landmark size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <div className="break-words font-bold">{profile.profile_label || profile.account_name}</div>
            <div className="break-words text-xs text-slate-500">
              {profile.account_name} · {profile.bank_name} · {profile.currency}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-1">
            <button onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit">
              <Pencil size={15} />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
        {profile.sort_code && (
          <div>
            Sort code: <b className="text-slate-700">{profile.sort_code}</b>
          </div>
        )}
        {profile.account_number && (
          <div>
            Account number: <b className="text-slate-700">{profile.account_number}</b>
          </div>
        )}
        {profile.iban && (
          <div>
            IBAN: <b className="text-slate-700">{profile.iban}</b>
          </div>
        )}
        {profile.swift_bic && (
          <div>
            SWIFT/BIC: <b className="text-slate-700">{profile.swift_bic}</b>
          </div>
        )}
      </div>
      {profile.bank_address && <p className="mt-2 text-xs text-slate-400">{profile.bank_address}</p>}
      {profile.payment_notes && <p className="mt-1 text-xs text-slate-400">{profile.payment_notes}</p>}

      <ConfirmDetailModal
        open={confirmDelete}
        onClose={() => !pending && setConfirmDelete(false)}
        title="Remove this bank profile?"
        description="Customers will no longer see it on quotes or invoices."
        pending={pending}
        destructive
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  );
}

export function BankProfilesManager({ profiles, canManage }: { profiles: BankAccount[]; canManage: boolean }) {
  const notify = useToast();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState<BankProfileInput>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createBankProfileAction(value);
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify("Bank profile added");
      setValue(BLANK);
      setAdding(false);
    });
  }

  return (
    <div className="mt-4 space-y-3">
      {profiles.map((p) => (
        <ProfileCard key={p.id} profile={p} canManage={canManage} />
      ))}
      {profiles.length === 0 && <p className="text-sm text-slate-400">No bank details configured yet.</p>}

      {canManage &&
        (adding ? (
          <div className="rounded-2xl border border-dashed p-4">
            <BankProfileFields value={value} onChange={(patch) => setValue((v) => ({ ...v, ...patch }))} />
            {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button disabled={pending} onClick={create} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {pending ? "Adding…" : "Add profile"}
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setValue(BLANK);
                  setError(null);
                }}
                className="rounded-lg border px-4 py-2 text-sm font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold">
            <Plus size={16} />
            Add payment profile
          </button>
        ))}
    </div>
  );
}
