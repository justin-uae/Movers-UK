"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { editSupplierAction, type EditSupplierInput } from "../actions";
import type { Supplier, SupplierType } from "@/lib/supabase/database.types";

const TYPE_OPTIONS: SupplierType[] = ["company", "individual"];

export function EditSupplierButton({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(supplier.name);
  const [type, setType] = useState<SupplierType>(supplier.type);
  const [contactName, setContactName] = useState(supplier.contact_name ?? "");
  const [email, setEmail] = useState(supplier.email);
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(supplier.whatsapp ?? "");
  const [region, setRegion] = useState(supplier.region ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(supplier.registration_number ?? "");
  const [vatNumber, setVatNumber] = useState(supplier.vat_number ?? "");
  const [insuranceDetails, setInsuranceDetails] = useState(supplier.insurance_details ?? "");
  const [licenseNumber, setLicenseNumber] = useState(supplier.license_number ?? "");
  const [notes, setNotes] = useState(supplier.notes ?? "");

  function save() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Name and email can't be empty.");
      return;
    }

    const input: EditSupplierInput = { reason };
    if (name !== supplier.name) input.name = name;
    if (type !== supplier.type) input.type = type;
    if (contactName !== (supplier.contact_name ?? "")) input.contactName = contactName || null;
    if (email !== supplier.email) input.email = email;
    if (phone !== (supplier.phone ?? "")) input.phone = phone || null;
    if (whatsapp !== (supplier.whatsapp ?? "")) input.whatsapp = whatsapp || null;
    if (region !== (supplier.region ?? "")) input.region = region || null;
    if (registrationNumber !== (supplier.registration_number ?? "")) input.registrationNumber = registrationNumber || null;
    if (vatNumber !== (supplier.vat_number ?? "")) input.vatNumber = vatNumber || null;
    if (insuranceDetails !== (supplier.insurance_details ?? "")) input.insuranceDetails = insuranceDetails || null;
    if (licenseNumber !== (supplier.license_number ?? "")) input.licenseNumber = licenseNumber || null;
    if (notes !== (supplier.notes ?? "")) input.notes = notes || null;

    if (Object.keys(input).length === 1) {
      setError("Change at least one field.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await editSupplierAction(supplier.id, input);
      if (result?.error) {
        setError(result.error);
        notify(result.error);
        return;
      }
      notify("Supplier updated");
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-xl border px-4 py-2.5 text-sm font-bold"
      >
        Edit Supplier
      </button>

      {open && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setOpen(false)}
          title={`Edit ${supplier.name}`}
          description="Correct this supplier's business details — every change here is logged with the reason below."
          pending={pending}
          error={error}
          confirmLabel="Save Changes"
          onConfirm={save}
        >
          <div className="space-y-4">
            <label className="block text-sm font-bold">
              Reason (required)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
                placeholder="Why is this supplier being edited?"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal" />
              </label>
              <label className="block text-sm font-bold">
                Type
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SupplierType)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal capitalize"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold">
                Contact name
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal" />
              </label>
              <label className="block text-sm font-bold">
                WhatsApp
                <input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold sm:col-span-2">
                Region
                <input value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal" />
              </label>
            </div>

            <div className="rounded-xl border border-dashed p-3">
              <div className="text-xs font-black uppercase tracking-wide text-slate-400">Compliance</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  Registration number
                  <input
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  VAT number
                  <input
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Insurance details
                  <input
                    value={insuranceDetails}
                    onChange={(e) => setInsuranceDetails(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  License number
                  <input
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>
            </div>

            <label className="block text-sm font-bold">
              Internal notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 font-normal"
              />
            </label>
          </div>
        </ConfirmDetailModal>
      )}
    </>
  );
}
