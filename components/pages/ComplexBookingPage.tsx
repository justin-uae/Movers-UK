"use client";

import { useEffect, useState, useTransition } from "react";
import { Wand2, Upload, FileText, X, Loader2 } from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { CustomerCombobox } from "@/components/ui/CustomerCombobox";
import { MoveDetailsEditor, VanSizeSelect } from "@/components/ui/MoveDetailsEditor";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  extractComplexBookingAction,
  createComplexBookingLeadAction,
  type ComplexBookingFileRef,
} from "@/app/(staff)/leads/complex-booking/actions";
import { extractComplexBookingFromLeadAction, convertLeadToComplexBookingAction } from "@/app/(staff)/leads/[id]/complex-booking/actions";
import { NO_MOVE_DETAILS, pickMoveDetails, type MoveDetails } from "@/lib/moveDetails";
import type { DuplicateCustomerMatch } from "@/lib/customerDuplicates";
import type { ComplexBookingExtraction } from "@/lib/complexBookingExtraction";

interface CustomerOption {
  id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
}

interface EditableMove {
  pickupAddress: string;
  destinationAddress: string;
  moveDate: string;
  moveTime: string;
  vanSize: string | null;
  specialRequirements: string;
}

const BLANK_MOVE: EditableMove = { pickupAddress: "", destinationAddress: "", moveDate: "", moveTime: "", vanSize: null, specialRequirements: "" };

/** AI-extracted phone numbers come formatted with spaces/dashes (e.g. "+44 7700 900123") — react-phone-number-input needs strict E.164. */
function toE164(phone: string | null): string {
  if (!phone) return "";
  const stripped = phone.replace(/[^\d+]/g, "");
  return /^\+[1-9]\d{1,14}$/.test(stripped) ? stripped : "";
}

export function ComplexBookingPage({
  customers,
  leadConversion,
}: {
  customers: CustomerOption[];
  /**
   * When set, this instance converts an EXISTING lead into a complex
   * booking instead of creating a brand new one: it skips the paste/upload
   * step entirely, auto-running AI extraction on mount from everything
   * already captured on that lead, fixes the customer to the lead's own
   * linked one (no picker — a lead's customer can't be reassigned through
   * this flow), and saves via convertLeadToComplexBookingAction, which
   * attaches the result to that lead's own enquiry instead of inserting a
   * new lead row.
   */
  leadConversion?: { leadId: string; customerLabel: string };
}) {
  const notify = useToast();
  const [phase, setPhase] = useState<"input" | "extracting" | "review">(leadConversion ? "extracting" : "input");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCustomerMatch | null>(null);

  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<ComplexBookingFileRef | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [existingCustomerId, setExistingCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ contactName: "", companyName: "", email: "", phone: "" });
  const [move, setMove] = useState<EditableMove>(BLANK_MOVE);
  const [moveDetails, setMoveDetails] = useState<MoveDetails>(NO_MOVE_DETAILS);
  const [internalNotes, setInternalNotes] = useState("");
  const [uncertainFields, setUncertainFields] = useState<Set<string>>(new Set());
  const [extractWarning, setExtractWarning] = useState<string | null>(null);

  async function onFileSelected(selected: File | null) {
    if (!selected) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired — please sign in again.");

      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
      if (!profile) throw new Error("Could not resolve your tenant.");

      const path = `${profile.tenant_id}/complex-booking/${crypto.randomUUID()}-${selected.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, selected);
      if (uploadError) throw new Error(uploadError.message);

      setFile({ storagePath: path, fileName: selected.name, mimeType: selected.type, fileSize: selected.size });
      setFileLabel(selected.name);
      setFileSize(selected.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this file.");
      setFile(null);
      setFileLabel(null);
      setFileSize(null);
    } finally {
      setUploading(false);
    }
  }

  function clearFile() {
    setFile(null);
    setFileLabel(null);
    setFileSize(null);
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Shared by both extraction paths (paste/upload, and auto-extracting from an existing lead's own data) — maps the AI's result onto the editable review-phase state. */
  function applyExtraction(data: ComplexBookingExtraction, warning: string | null) {
    // A lead-conversion already has a fixed customer (the lead's own) — never
    // let the AI's read of the pasted-together lead summary overwrite it.
    if (!leadConversion) {
      const c = data.customer;
      if (c.name || c.company || c.email || c.phone) {
        setCustomerMode("new");
        setNewCustomer({ contactName: c.name ?? "", companyName: c.company ?? "", email: c.email ?? "", phone: toE164(c.phone) });
      }
    }

    const m = data.move;
    setMove({
      pickupAddress: m.pickup_address ?? "",
      destinationAddress: m.destination_address ?? "",
      moveDate: m.move_date ?? "",
      moveTime: m.move_time ?? "",
      vanSize: m.van_size,
      specialRequirements: m.special_requirements ?? "",
    });
    setMoveDetails(pickMoveDetails(m));
    setInternalNotes(data.internal_notes ?? "");
    setUncertainFields(new Set(data.uncertain_fields));
    setExtractWarning(warning);
  }

  function extract() {
    setError(null);
    setExtractWarning(null);
    startTransition(async () => {
      const result = await extractComplexBookingAction({ pastedText, file });
      if (result.error || !result.data) {
        setError(result.error ?? "Could not read this enquiry.");
        return;
      }
      applyExtraction(result.data, result.warning);
      notify("AI read the move details — review before creating the lead");
      setPhase("review");
    });
  }

  /** Runs (or re-runs) AI extraction against the lead's own captured data — used on mount in lead-conversion mode, and again from the "Re-run AI" link in the review phase. */
  function runLeadExtraction() {
    if (!leadConversion) return;
    setError(null);
    setExtractWarning(null);
    setPhase("extracting");
    startTransition(async () => {
      const result = await extractComplexBookingFromLeadAction(leadConversion.leadId);
      if (result.error || !result.data) {
        setError(result.error ?? "Could not process this lead.");
        return;
      }
      applyExtraction(result.data, result.warning);
      notify("AI read the move details — review before saving");
      setPhase("review");
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (leadConversion) runLeadExtraction();
  }, []);

  function isUncertain(path: string) {
    return uncertainFields.has(path);
  }

  function fieldClass(base: string, uncertain: boolean) {
    return uncertain ? `${base} border-amber-400 ring-1 ring-amber-300 bg-amber-50/60` : base;
  }

  const pickerUncertainClass =
    "mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-base font-normal border-amber-400 ring-1 ring-amber-300 bg-amber-50/60";

  function submit(confirmDuplicate = false) {
    setError(null);
    setDuplicateWarning(null);
    if (!move.pickupAddress.trim() || !move.destinationAddress.trim()) {
      setError("Enter both the moving-from and moving-to address.");
      return;
    }

    const moveInput = {
      pickupAddress: move.pickupAddress.trim(),
      destinationAddress: move.destinationAddress.trim(),
      moveDate: move.moveDate || null,
      moveTime: move.moveTime || null,
      moveDetails,
      vanSize: move.vanSize,
      specialRequirements: move.specialRequirements.trim() || null,
    };

    startTransition(async () => {
      if (leadConversion) {
        const result = await convertLeadToComplexBookingAction(leadConversion.leadId, {
          move: moveInput,
          internalNotes: internalNotes.trim() || null,
        });
        if (result?.error) setError(result.error);
        // On success this redirects into /quotes/new — nothing else to do here.
        return;
      }

      const result = await createComplexBookingLeadAction({
        existingCustomerId: customerMode === "existing" ? existingCustomerId : null,
        newCustomer: customerMode === "new" ? newCustomer : null,
        move: moveInput,
        internalNotes: internalNotes.trim() || null,
        pastedText: pastedText.trim() || null,
        sourceFile: file,
        confirmedDuplicateCustomer: confirmDuplicate,
      });
      if (result?.duplicate) {
        setDuplicateWarning(result.duplicate);
        return;
      }
      if (result?.error) setError(result.error);
      // On success this redirects into /quotes/new — nothing else to do here.
    });
  }

  if (phase === "extracting") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        {error ? (
          <>
            <p className="max-w-sm text-sm font-semibold text-red-700">{error}</p>
            <button
              type="button"
              onClick={runLeadExtraction}
              className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white"
            >
              <Wand2 size={16} />
              Try again
            </button>
          </>
        ) : (
          <>
            <Loader2 size={28} className="animate-spin text-primary-500" />
            <p className="text-sm font-semibold text-slate-600">Reading everything captured on this lead…</p>
          </>
        )}
      </div>
    );
  }

  if (phase === "input") {
    return (
      <div>
        <SectionTitle title="Paste an enquiry or upload a document" sub="AI will read it and fill in the move details for you to review" />
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-bold">
            Pasted enquiry text
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste an email, inventory, or quote request here…"
              className="mt-2 min-h-40 w-full rounded-xl border px-3 py-3 text-base font-normal sm:text-sm"
            />
          </label>

          <div>
            <span className="block text-sm font-bold">Or upload a document</span>

            {fileLabel ? (
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-sm">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-700">{fileLabel}</div>
                  {fileSize !== null && <div className="text-xs text-slate-400">{formatFileSize(fileSize)}</div>}
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  aria-label="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label
                className={
                  "mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-primary-300 hover:bg-primary-50/40 sm:flex-row sm:justify-start sm:px-5 sm:py-4 sm:text-left " +
                  (uploading ? "pointer-events-none opacity-60" : "")
                }
              >
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-sm">
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-700">{uploading ? "Uploading…" : "Choose a file"}</div>
                  <div className="text-xs text-slate-400">PDF, Word (.docx) or an image — e.g. an inventory or quote request</div>
                </div>
              </label>
            )}
          </div>

          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

          <button
            type="button"
            disabled={pending || uploading || (!pastedText.trim() && !file)}
            onClick={extract}
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <Wand2 size={16} />
            {pending ? "Reading enquiry…" : "Extract with AI"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionTitle
          title="Review & edit"
          sub={leadConversion ? "Correct anything the AI missed, then save it to this lead" : "Correct anything the AI missed, then create the lead"}
        />
        <button
          type="button"
          onClick={() => (leadConversion ? runLeadExtraction() : setPhase("input"))}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-primary-600 hover:bg-primary-50"
        >
          {leadConversion ? "↻ Re-run AI" : "← Start over"}
        </button>
      </div>

      {(extractWarning || uncertainFields.size > 0) && (
        <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          {extractWarning ? `${extractWarning} ` : ""}
          {uncertainFields.size > 0 &&
            `AI wasn't fully confident about ${uncertainFields.size} field${uncertainFields.size === 1 ? "" : "s"} — check the highlighted ones below.`}
        </div>
      )}

      <div className="mt-5 text-xs font-black uppercase tracking-wide text-primary-500">Customer</div>
      {leadConversion ? (
        <div className="mt-2 rounded-xl border bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{leadConversion.customerLabel}</div>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
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
            <div className="mt-3">
              <CustomerCombobox customers={customers} value={existingCustomerId} onChange={setExistingCustomerId} />
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                Contact name
                <input
                  value={newCustomer.contactName}
                  onChange={(e) => setNewCustomer({ ...newCustomer, contactName: e.target.value })}
                  className={fieldClass("mt-2 w-full rounded-xl border px-3 py-3 font-normal", isUncertain("customer.name"))}
                />
              </label>
              <label className="text-sm font-bold">
                Company name
                <input
                  value={newCustomer.companyName}
                  onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                  className={fieldClass("mt-2 w-full rounded-xl border px-3 py-3 font-normal", isUncertain("customer.company"))}
                />
              </label>
              <label className="text-sm font-bold">
                Email
                <input
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  className={fieldClass("mt-2 w-full rounded-xl border px-3 py-3 font-normal", isUncertain("customer.email"))}
                />
              </label>
              <label className="text-sm font-bold">
                Phone
                <PhoneNumberField
                  value={newCustomer.phone}
                  onChange={(v) => setNewCustomer({ ...newCustomer, phone: v ?? "" })}
                  className={"mt-2" + (isUncertain("customer.phone") ? " rounded-xl ring-2 ring-amber-300" : "")}
                />
              </label>
            </div>
          )}
        </>
      )}

      <div className="mt-6 text-xs font-black uppercase tracking-wide text-primary-500">Move</div>
      <div className="mt-3 rounded-2xl border p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            Moving from
            <input
              value={move.pickupAddress}
              onChange={(e) => setMove({ ...move, pickupAddress: e.target.value })}
              className={fieldClass("mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal", isUncertain("move.pickup_address"))}
            />
          </label>
          <label className="text-sm font-bold">
            Moving to
            <input
              value={move.destinationAddress}
              onChange={(e) => setMove({ ...move, destinationAddress: e.target.value })}
              className={fieldClass("mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal", isUncertain("move.destination_address"))}
            />
          </label>
          <label className="text-sm font-bold">
            Move date
            <DatePicker
              value={move.moveDate}
              onChange={(v) => setMove({ ...move, moveDate: v })}
              className={isUncertain("move.move_date") ? pickerUncertainClass : undefined}
            />
          </label>
          <label className="text-sm font-bold">
            Start time
            <TimePicker
              value={move.moveTime}
              onChange={(v) => setMove({ ...move, moveTime: v })}
              className={isUncertain("move.move_time") ? pickerUncertainClass : undefined}
            />
          </label>
        </div>
        <div className="mt-4">
          <MoveDetailsEditor value={moveDetails} onChange={setMoveDetails} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-bold">
            Van size
            <VanSizeSelect
              value={move.vanSize}
              onChange={(v) => setMove({ ...move, vanSize: v })}
              className={fieldClass("mt-1.5 w-full rounded-xl border px-3 py-2.5 font-normal", isUncertain("move.van_size"))}
            />
          </label>
          <label className="text-sm font-bold md:col-span-2">
            Inventory and access notes
            <textarea
              value={move.specialRequirements}
              onChange={(e) => setMove({ ...move, specialRequirements: e.target.value })}
              className={fieldClass("mt-1.5 min-h-16 w-full rounded-xl border px-3 py-2.5 font-normal", isUncertain("move.special_requirements"))}
            />
          </label>
        </div>
      </div>

      <label className="mt-5 block text-sm font-bold">
        Internal notes
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          className="mt-2 min-h-20 w-full rounded-xl border px-3 py-3 font-normal"
        />
      </label>

      {duplicateWarning && (
        <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          A customer matching this email or phone already exists: {duplicateWarning.label}. Submit again to create a
          separate record anyway, or switch to "Existing customer" above and select it instead.
        </div>
      )}
      {error && <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <div className="mt-6 flex justify-end border-t pt-5">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(!!duplicateWarning)}
          className={
            "rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 " +
            (duplicateWarning ? "bg-amber-500" : "bg-primary-500")
          }
        >
          {pending
            ? leadConversion
              ? "Saving…"
              : "Creating…"
            : duplicateWarning
              ? "Create anyway"
              : leadConversion
                ? "Save & Continue to Quote"
                : "Create Lead & Continue to Quote"}
        </button>
      </div>
    </div>
  );
}
