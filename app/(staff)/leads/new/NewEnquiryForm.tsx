"use client";

import { useState, useTransition } from "react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { AddressAutocompleteField } from "@/components/ui/AddressAutocompleteField";
import { CustomerCombobox } from "@/components/ui/CustomerCombobox";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { createEnquiryAction } from "./actions";
import type { DuplicateCustomerMatch } from "@/lib/customerDuplicates";

const STEPS = ["Customer", "Journey", "Requirements", "Review"];

interface CustomerOption {
  id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
}

interface VehicleTypeOption {
  id: string;
  name: string;
  seat_capacity: number;
}

export function NewEnquiryForm({
  customers,
  vehicleTypes,
}: {
  customers: CustomerOption[];
  vehicleTypes: VehicleTypeOption[];
}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCustomerMatch | null>(null);
  const [pending, startTransition] = useTransition();

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [existingCustomerId, setExistingCustomerId] = useState("");
  // Picked from the combobox — may be a server-search match outside the preloaded `customers`.
  const [pickedCustomer, setPickedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomer, setNewCustomer] = useState({ contactName: "", companyName: "", email: "", phone: "" });

  const [journey, setJourney] = useState({
    type: "one_way",
    pickup: "",
    pickupLat: null as number | null,
    pickupLng: null as number | null,
    destination: "",
    destinationLat: null as number | null,
    destinationLng: null as number | null,
    date: "",
    time: "",
    returnDate: "",
    returnTime: "",
    passengers: 1,
    luggage: 0,
  });

  const [requirements, setRequirements] = useState({
    vehicleTypeId: vehicleTypes[0]?.id ?? "",
    wheelchair: false,
    childSeats: 0,
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
    formData.set("journeyType", journey.type);
    formData.set("pickupAddress", journey.pickup);
    if (journey.pickupLat != null) formData.set("pickupLat", String(journey.pickupLat));
    if (journey.pickupLng != null) formData.set("pickupLng", String(journey.pickupLng));
    formData.set("destinationAddress", journey.destination);
    if (journey.destinationLat != null) formData.set("destinationLat", String(journey.destinationLat));
    if (journey.destinationLng != null) formData.set("destinationLng", String(journey.destinationLng));
    formData.set("pickupDate", journey.date);
    formData.set("pickupTime", journey.time);
    if (journey.type === "return") {
      formData.set("returnDate", journey.returnDate);
      formData.set("returnTime", journey.returnTime);
    }
    formData.set("passengerCount", String(journey.passengers));
    formData.set("luggageCount", String(journey.luggage));
    formData.set("vehicleTypeId", requirements.vehicleTypeId);
    formData.set("childSeats", String(requirements.childSeats));
    formData.set("specialRequirements", requirements.specialRequirements);
    formData.set("internalNotes", requirements.internalNotes);
    if (requirements.wheelchair) formData.set("wheelchairRequired", "on");

    startTransition(async () => {
      const result = await createEnquiryAction({ error: null }, formData);
      if (result?.duplicate) {
        setDuplicateWarning(result.duplicate);
        return;
      }
      if (result?.error) setError(result.error);
    });
  }

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
            <SectionTitle title="Journey Details" sub="Enter the route, schedule and passenger requirements" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Journey type
                <select
                  value={journey.type}
                  onChange={(e) => setJourney({ ...journey, type: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                >
                  <option value="one_way">One way</option>
                  <option value="return">Return</option>
                  <option value="disposal">Disposal hire</option>
                  <option value="multi_day">Multi-day</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Pickup date
                <DatePicker value={journey.date} onChange={(v) => setJourney({ ...journey, date: v })} />
              </label>
              <label className="text-sm font-bold">
                Pickup address
                <AddressAutocompleteField
                  value={journey.pickup}
                  onChange={(v) => setJourney({ ...journey, pickup: v })}
                  onPlaceSelect={(place) =>
                    setJourney((j) => ({ ...j, pickup: place.address, pickupLat: place.lat, pickupLng: place.lng }))
                  }
                  placeholder="Start typing an address, hotel or airport…"
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Destination
                <AddressAutocompleteField
                  value={journey.destination}
                  onChange={(v) => setJourney({ ...journey, destination: v })}
                  onPlaceSelect={(place) =>
                    setJourney((j) => ({ ...j, destination: place.address, destinationLat: place.lat, destinationLng: place.lng }))
                  }
                  placeholder="Start typing an address, hotel or airport…"
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Pickup time
                <TimePicker value={journey.time} onChange={(v) => setJourney({ ...journey, time: v })} />
              </label>
              {journey.type === "return" && (
                <>
                  <label className="text-sm font-bold">
                    Return date
                    <DatePicker value={journey.returnDate} onChange={(v) => setJourney({ ...journey, returnDate: v })} />
                  </label>
                  <label className="text-sm font-bold">
                    Return time
                    <TimePicker value={journey.returnTime} onChange={(v) => setJourney({ ...journey, returnTime: v })} />
                  </label>
                </>
              )}
              <label className="text-sm font-bold">
                Passengers
                <input
                  type="number"
                  min={1}
                  value={journey.passengers}
                  onChange={(e) => setJourney({ ...journey, passengers: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Luggage
                <input
                  type="number"
                  min={0}
                  value={journey.luggage}
                  onChange={(e) => setJourney({ ...journey, luggage: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <SectionTitle title="Vehicle & Additional Requirements" sub="Accessibility, child seats and special requirements" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Vehicle requested
                <select
                  value={requirements.vehicleTypeId}
                  onChange={(e) => setRequirements({ ...requirements, vehicleTypeId: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                >
                  {vehicleTypes.length === 0 && <option value="">No vehicle types configured</option>}
                  {vehicleTypes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.seat_capacity} seats
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Child seats
                <input
                  type="number"
                  min={0}
                  value={requirements.childSeats}
                  onChange={(e) => setRequirements({ ...requirements, childSeats: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={requirements.wheelchair}
                  onChange={(e) => setRequirements({ ...requirements, wheelchair: e.target.checked })}
                  className="h-4 w-4"
                />
                Wheelchair accessible required
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Special requirements
                <textarea
                  value={requirements.specialRequirements}
                  onChange={(e) => setRequirements({ ...requirements, specialRequirements: e.target.value })}
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
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                    <span className="text-slate-500">Name</span>
                    <b>{selectedCustomer?.company_name || selectedCustomer?.contact_name || "—"}</b>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
                    <span className="text-slate-500">Email</span>
                    <b>{selectedCustomer?.email || "—"}</b>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                    <span className="text-slate-500">Contact name</span>
                    <b>{newCustomer.contactName || "—"}</b>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                    <span className="text-slate-500">Company</span>
                    <b>{newCustomer.companyName || "—"}</b>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                    <span className="text-slate-500">Email</span>
                    <b>{newCustomer.email || "—"}</b>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
                    <span className="text-slate-500">Phone</span>
                    <b>{newCustomer.phone || "—"}</b>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 text-xs font-black uppercase tracking-wide text-primary-500">Journey</div>
            <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-5 text-sm">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Journey type</span>
                <b className="capitalize">{journey.type.replaceAll("_", " ")}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Pickup</span>
                <b>{journey.pickup || "—"}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Destination</span>
                <b>{journey.destination || "—"}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Date &amp; time</span>
                <b>{journey.date || "—"} {journey.time}</b>
              </div>
              {journey.type === "return" && (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                  <span className="text-slate-500">Return date &amp; time</span>
                  <b>{journey.returnDate || "—"} {journey.returnTime}</b>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Passengers</span>
                <b>{journey.passengers}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
                <span className="text-slate-500">Luggage</span>
                <b>{journey.luggage}</b>
              </div>
            </div>

            <div className="mt-5 text-xs font-black uppercase tracking-wide text-primary-500">Requirements</div>
            <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-5 text-sm">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Vehicle requested</span>
                <b>{vehicleTypes.find((v) => v.id === requirements.vehicleTypeId)?.name ?? "—"}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Child seats</span>
                <b>{requirements.childSeats}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Wheelchair accessible</span>
                <b>{requirements.wheelchair ? "Required" : "Not required"}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b py-2">
                <span className="text-slate-500">Special requirements</span>
                <b>{requirements.specialRequirements || "—"}</b>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
                <span className="text-slate-500">Internal notes</span>
                <b className="whitespace-pre-wrap">{requirements.internalNotes || "—"}</b>
              </div>
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
