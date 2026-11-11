"use client";

import { useState, useTransition } from "react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { AddressAutocompleteField } from "@/components/ui/AddressAutocompleteField";
import { CustomerCombobox } from "@/components/ui/CustomerCombobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { MoveDetailsEditor, VanSizeSelect } from "@/components/ui/MoveDetailsEditor";
import { moveDetailRows, NO_MOVE_DETAILS, type MoveDetails } from "@/lib/moveDetails";
import { createEnquiryAction } from "./actions";
import type { DuplicateCustomerMatch } from "@/lib/customerDuplicates";

const STEPS = ["Customer", "Move", "Property & services", "Review"];

interface CustomerOption {
  id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
}

function ReviewRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={"flex flex-wrap justify-between gap-x-3 gap-y-1 py-2" + (last ? "" : " border-b")}>
      <span className="text-slate-500">{label}</span>
      <b className="whitespace-pre-wrap">{value}</b>
    </div>
  );
}

export function NewEnquiryForm({ customers }: { customers: CustomerOption[] }) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCustomerMatch | null>(null);
  const [pending, startTransition] = useTransition();

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [existingCustomerId, setExistingCustomerId] = useState("");
  // Picked from the combobox — may be a server-search match outside the preloaded `customers`.
  const [pickedCustomer, setPickedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomer, setNewCustomer] = useState({ contactName: "", companyName: "", email: "", phone: "" });

  const [move, setMove] = useState({
    pickup: "",
    pickupLat: null as number | null,
    pickupLng: null as number | null,
    destination: "",
    destinationLat: null as number | null,
    destinationLng: null as number | null,
    date: "",
    time: "",
  });
  const [moveDetails, setMoveDetails] = useState<MoveDetails>(NO_MOVE_DETAILS);

  const [requirements, setRequirements] = useState({
    vanSize: null as string | null,
    specialRequirements: "",
    internalNotes: "",
  });

  const selectedCustomer = customers.find((c) => c.id === existingCustomerId) ?? (pickedCustomer?.id === existingCustomerId ? pickedCustomer : undefined);

  function submit(confirmDuplicate = false) {
    setError(null);
    setDuplicateWarning(null);
    const formData = new FormData();
    if (customerMode === "existing") {
      formData.set("existingCustomerId", existingCustomerId);
    } else {
      formData.set("newContactName", newCustomer.contactName);
      formData.set("newCompanyName", newCustomer.companyName);
      formData.set("newEmail", newCustomer.email);
      formData.set("newPhone", newCustomer.phone);
      if (confirmDuplicate) formData.set("confirmedDuplicateCustomer", "true");
    }
    formData.set("pickupAddress", move.pickup);
    if (move.pickupLat != null) formData.set("pickupLat", String(move.pickupLat));
    if (move.pickupLng != null) formData.set("pickupLng", String(move.pickupLng));
    formData.set("destinationAddress", move.destination);
    if (move.destinationLat != null) formData.set("destinationLat", String(move.destinationLat));
    if (move.destinationLng != null) formData.set("destinationLng", String(move.destinationLng));
    formData.set("pickupDate", move.date);
    formData.set("pickupTime", move.time);
    formData.set("moveDetails", JSON.stringify(moveDetails));
    if (requirements.vanSize) formData.set("vanSize", requirements.vanSize);
    formData.set("specialRequirements", requirements.specialRequirements);
    formData.set("internalNotes", requirements.internalNotes);

    startTransition(async () => {
      const result = await createEnquiryAction({ error: null }, formData);
      if (result?.duplicate) {
        setDuplicateWarning(result.duplicate);
        return;
      }
      if (result?.error) setError(result.error);
    });
  }

  const detailRows = moveDetailRows(moveDetails);

  return (
    <div>
      <div className="flex items-center">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => setStep(i + 1)}
              aria-label={`Step ${i + 1}: ${s}`}
              aria-current={step === i + 1 ? "step" : undefined}
              className={
                "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black transition-colors " +
                (step >= i + 1 ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-400")
              }
            >
              {i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={"mx-1.5 h-0.5 flex-1 rounded-full " + (step > i + 1 ? "bg-primary-500" : "bg-slate-100")} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-sm font-bold text-primary-600">
        Step {step} of {STEPS.length} · {STEPS[step - 1]}
      </p>

      <div className="mt-5">
        {step === 1 && (
          <div>
            <SectionTitle title="Customer" sub="Choose an existing customer or enter new contact details" />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCustomerMode("existing")}
                className={"rounded-xl px-3 py-2 text-sm font-bold " + (customerMode === "existing" ? "bg-primary-500 text-white" : "bg-slate-100")}
              >
                Existing customer
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode("new")}
                className={"rounded-xl px-3 py-2 text-sm font-bold " + (customerMode === "new" ? "bg-primary-500 text-white" : "bg-slate-100")}
              >
                New customer
              </button>
            </div>
            {customerMode === "existing" ? (
              <div className="mt-4">
                <CustomerCombobox
                  customers={customers}
                  value={existingCustomerId}
                  onChange={(id, customer) => {
                    setExistingCustomerId(id);
                    setPickedCustomer(customer);
                  }}
                />
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Contact name
                  <input
                    value={newCustomer.contactName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, contactName: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Company name
                  <input
                    value={newCustomer.companyName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Email
                  <input
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Phone
                  <PhoneNumberField
                    value={newCustomer.phone}
                    onChange={(v) => setNewCustomer({ ...newCustomer, phone: v ?? "" })}
                    className="mt-2"
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <SectionTitle title="Move" sub="Where the customer is moving from and to, and when" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Moving from
                <AddressAutocompleteField
                  value={move.pickup}
                  onChange={(v) => setMove({ ...move, pickup: v })}
                  onPlaceSelect={(place) => setMove((m) => ({ ...m, pickup: place.address, pickupLat: place.lat, pickupLng: place.lng }))}
                  placeholder="Start typing an address or postcode…"
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Moving to
                <AddressAutocompleteField
                  value={move.destination}
                  onChange={(v) => setMove({ ...move, destination: v })}
                  onPlaceSelect={(place) =>
                    setMove((m) => ({ ...m, destination: place.address, destinationLat: place.lat, destinationLng: place.lng }))
                  }
                  placeholder="Start typing an address or postcode…"
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Move date
                <DatePicker value={move.date} onChange={(v) => setMove({ ...move, date: v })} />
              </label>
              <label className="text-sm font-bold">
                Start time
                <TimePicker value={move.time} onChange={(v) => setMove({ ...move, time: v })} />
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <SectionTitle title="Property & Services" sub="Property size, access and the extra services needed" />
            <div className="mt-5">
              <MoveDetailsEditor value={moveDetails} onChange={setMoveDetails} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Van size
                <VanSizeSelect value={requirements.vanSize} onChange={(v) => setRequirements({ ...requirements, vanSize: v })} />
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Inventory and access notes
                <textarea
                  value={requirements.specialRequirements}
                  onChange={(e) => setRequirements({ ...requirements, specialRequirements: e.target.value })}
                  placeholder="Large items, parking details, access restrictions…"
                  className="mt-2 min-h-20 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Internal notes
                <textarea
                  value={requirements.internalNotes}
                  onChange={(e) => setRequirements({ ...requirements, internalNotes: e.target.value })}
                  className="mt-2 min-h-20 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <SectionTitle title="Review" sub="Confirm every detail before saving this enquiry" />

            <div className="mt-5 text-xs font-black uppercase tracking-wide text-primary-500">Customer</div>
            <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-5 text-sm">
              {customerMode === "existing" ? (
                <>
                  <ReviewRow label="Name" value={selectedCustomer?.company_name || selectedCustomer?.contact_name || "—"} />
                  <ReviewRow label="Email" value={selectedCustomer?.email || "—"} last />
                </>
              ) : (
                <>
                  <ReviewRow label="Contact name" value={newCustomer.contactName || "—"} />
                  <ReviewRow label="Company" value={newCustomer.companyName || "—"} />
                  <ReviewRow label="Email" value={newCustomer.email || "—"} />
                  <ReviewRow label="Phone" value={newCustomer.phone || "—"} last />
                </>
              )}
            </div>

            <div className="mt-5 text-xs font-black uppercase tracking-wide text-primary-500">Move</div>
            <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-5 text-sm">
              <ReviewRow label="Moving from" value={move.pickup || "—"} />
              <ReviewRow label="Moving to" value={move.destination || "—"} />
              <ReviewRow label="Date & time" value={`${move.date || "—"} ${move.time}`} last />
            </div>

            <div className="mt-5 text-xs font-black uppercase tracking-wide text-primary-500">Property & services</div>
            <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-5 text-sm">
              {detailRows.map(({ label, value }) => (
                <ReviewRow key={label} label={label} value={value} />
              ))}
              <ReviewRow label="Van size" value={requirements.vanSize ?? "Not decided yet"} />
              <ReviewRow label="Inventory and access notes" value={requirements.specialRequirements || "—"} />
              <ReviewRow label="Internal notes" value={requirements.internalNotes || "—"} last />
            </div>
          </div>
        )}
      </div>

      {duplicateWarning && (
        <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          A customer matching this email or phone already exists: {duplicateWarning.label}. Save again to create a
          separate record anyway, or go back and select the existing customer instead.
        </div>
      )}
      {error && <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <div className="mt-6 flex justify-between border-t pt-5">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep(Math.max(1, step - 1))}
          className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
        >
          Previous
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white"
          >
            Next Step →
          </button>
        ) : duplicateWarning ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Create anyway"}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(false)}
            className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save & Continue to Quote"}
          </button>
        )}
      </div>
    </div>
  );
}
