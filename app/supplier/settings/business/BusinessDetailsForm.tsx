"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { updateSupplierDetailsAction, addVehicleAction, removeVehicleAction } from "../actions";
import type { Supplier, SupplierVehicle } from "@/lib/supabase/database.types";

const inputClass =
  "mt-1.5 w-full rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-50";
const labelClass = "text-xs font-bold uppercase tracking-wide text-slate-500";

export function BusinessDetailsForm({ supplier, vehicles }: { supplier: Supplier; vehicles: SupplierVehicle[] }) {
  const notify = useToast();
  const router = useRouter();
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveDetails(formData: FormData) {
    setDetailsError(null);
    startTransition(async () => {
      const result = await updateSupplierDetailsAction({ error: null }, formData);
      if (result?.error) {
        setDetailsError(result.error);
        return;
      }
      notify("Details saved");
    });
  }

  function addVehicle(formData: FormData) {
    setVehicleError(null);
    startTransition(async () => {
      const result = await addVehicleAction({ error: null }, formData);
      if (result?.error) {
        setVehicleError(result.error);
        return;
      }
      notify("Vehicle added");
      router.refresh();
    });
  }

  function removeVehicle(id: string) {
    startTransition(async () => {
      await removeVehicleAction(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <h2 className="text-sm font-black">Business details</h2>
        <form action={saveDetails} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Contact name
            <input name="contactName" defaultValue={supplier.contact_name ?? ""} className={inputClass} />
          </label>
          <label className={labelClass}>
            Phone
            <PhoneNumberField name="phone" defaultValue={supplier.phone} className="mt-1.5" />
          </label>
          <label className={labelClass}>
            WhatsApp
            <PhoneNumberField name="whatsapp" defaultValue={supplier.whatsapp} className="mt-1.5" />
          </label>
          <label className={labelClass}>
            Region / location covered
            <input name="region" defaultValue={supplier.region ?? ""} className={inputClass} />
          </label>
          <label className={labelClass}>
            Registration number
            <input name="registrationNumber" defaultValue={supplier.registration_number ?? ""} className={inputClass} />
          </label>
          <label className={labelClass}>
            VAT number
            <input name="vatNumber" defaultValue={supplier.vat_number ?? ""} className={inputClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Insurance details
            <textarea name="insuranceDetails" defaultValue={supplier.insurance_details ?? ""} className={`${inputClass} min-h-12`} />
          </label>
          <label className={labelClass}>
            Driver license number
            <input name="licenseNumber" defaultValue={supplier.license_number ?? ""} className={inputClass} />
          </label>
          {detailsError && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{detailsError}</div>}
          <button type="submit" disabled={pending} className="sm:col-span-2 w-fit rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {pending ? "Saving…" : "Save details"}
          </button>
        </form>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-sm font-black">
          Vehicles <span className="font-normal text-slate-400">· {vehicles.length} added</span>
        </h2>
        <div className="mt-3 space-y-1.5">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <div>
                <b>{v.vehicle_type}</b>
                {v.seat_capacity && <span className="text-slate-500"> · {v.seat_capacity} seats</span>}
                {v.plate_number && <span className="text-slate-500"> · {v.plate_number}</span>}
              </div>
              <button onClick={() => removeVehicle(v.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove vehicle">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <form action={addVehicle} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input name="vehicleType" placeholder="Vehicle type" required className="rounded-lg border px-3 py-2 text-sm sm:col-span-2" />
          <input name="seatCapacity" type="number" min={1} placeholder="Seats" className="rounded-lg border px-3 py-2 text-sm" />
          <input name="plateNumber" placeholder="Plate number" className="rounded-lg border px-3 py-2 text-sm" />
          {vehicleError && <div className="sm:col-span-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{vehicleError}</div>}
          <button type="submit" disabled={pending} className="sm:col-span-4 w-fit rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-60">
            Add vehicle
          </button>
        </form>
      </Panel>
    </div>
  );
}
