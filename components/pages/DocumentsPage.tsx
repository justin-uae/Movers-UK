"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FileText, Trash2, Upload, Download } from "lucide-react";
import clsx from "clsx";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { PageGuide } from "@/components/ui/PageGuide";
import { DocumentsDiagram } from "@/components/ui/guide-diagrams/DocumentsDiagram";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/formatDate";
import { createDocumentAction, deleteDocumentAction } from "@/app/(staff)/documents/actions";
import type { DocumentType } from "@/lib/supabase/database.types";

export interface DocumentRow {
  id: string;
  docType: DocumentType;
  label: string;
  notes: string | null;
  fileName: string;
  fileSize: number | null;
  createdAt: string;
  uploaderName: string;
  linkedLabel: string | null;
  canDelete: boolean;
  downloadUrl: string | null;
}

export interface PickerOption {
  id: string;
  label: string;
}

const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  contract: "Contract",
  nda: "NDA",
  customer_agreement: "Customer Agreement",
  supplier_licence: "Supplier Licence",
  insurance: "Insurance",
  driver_licence: "Driver Licence",
  vehicle_registration: "Vehicle Registration",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit Note",
  itinerary: "Itinerary",
  passenger_list: "Passenger List",
  quote: "Quote",
  other: "Other",
};

const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as DocumentType[];

type LinkType = "none" | "customer" | "supplier" | "quote";

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage({
  rows,
  page,
  pageSize,
  total,
  docType,
  customers,
  suppliers,
  quotes,
}: {
  rows: DocumentRow[];
  page: number;
  pageSize: number;
  total: number;
  docType: DocumentType | null;
  customers: PickerOption[];
  suppliers: PickerOption[];
  quotes: PickerOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [newDocType, setNewDocType] = useState<DocumentType>("other");
  const [linkType, setLinkType] = useState<LinkType>("none");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pickerOptions = linkType === "customer" ? customers : linkType === "supplier" ? suppliers : linkType === "quote" ? quotes : [];
  const filteredPickerOptions = useMemo(
    () => pickerOptions.filter((o) => o.label.toLowerCase().includes(linkSearch.toLowerCase())),
    [pickerOptions, linkSearch],
  );

  function typeHref(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("type");
    else params.set("type", next);
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  }

  function openUpload() {
    setFile(null);
    setLabel("");
    setNotes("");
    setNewDocType("other");
    setLinkType("none");
    setLinkSearch("");
    setLinkId(null);
    setUploadError(null);
    setUploadOpen(true);
  }

  function submitUpload() {
    if (!file) {
      setUploadError("Choose a file to upload.");
      return;
    }
    if (!label.trim()) {
      setUploadError("Give the document a label.");
      return;
    }
    startTransition(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Session expired — please sign in again.");

        // The storage RLS policies match on (storage.foldername(name))[1]
        // against the tenant, not the uploader, so the path needs the
        // tenant id up front rather than the user id.
        const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
        if (!profile) throw new Error("Could not resolve your tenant.");

        const path = `${profile.tenant_id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
        if (uploadError) throw new Error(uploadError.message);

        await createDocumentAction({
          docType: newDocType,
          label,
          notes,
          storagePath: path,
          fileName: file.name,
          fileSize: file.size,
          customerId: linkType === "customer" ? linkId : null,
          supplierId: linkType === "supplier" ? linkId : null,
          quoteId: linkType === "quote" ? linkId : null,
        });

        notify("Document uploaded");
        setUploadOpen(false);
        router.refresh();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Could not upload this document.");
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteDocumentAction(deleteTarget.id);
        notify("Document deleted");
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Could not delete this document.");
      }
    });
  }

  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title="Documents"
        text="Contracts, licences, invoices and other files — searchable, and optionally linked to a customer, supplier or quote."
        action={
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <PageGuide
              title="Documents"
              subtitle="A searchable file library, optionally linked to a customer, supplier or quote."
              screenshot={<DocumentsDiagram />}
              sections={[
                {
                  heading: "What this page is",
                  body: [
                    "Contracts, licences, invoices, insurance certificates and any other file your team needs to keep — uploaded once, searchable, and optionally attached to a specific customer, supplier or quote so it's easy to find from that record too.",
                  ],
                },
                {
                  heading: "Uploading",
                  bullets: true,
                  body: [
                    "Upload document opens the form — choose the file, give it a label, pick a type, and optionally link it to a customer, supplier or quote.",
                    "Filter by type and search by label or notes to find something quickly once the list grows.",
                  ],
                },
                {
                  heading: "Downloading & deleting",
                  bullets: true,
                  body: [
                    "Download opens the file in a new tab.",
                    "Delete only appears for documents your role is allowed to remove — it's permanent, there's a confirmation step first.",
                  ],
                },
              ]}
            />
            <button
              onClick={openUpload}
              className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200"
            >
              <Upload size={17} />
              Upload document
            </button>
          </div>
        }
      />

      <Panel>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput placeholder="Search by label or notes…" />
          <select
            value={docType ?? "all"}
            onChange={(e) => router.push(typeHref(e.target.value))}
            className="rounded-xl border bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-600"
          >
            <option value="all">All types</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOC_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 sm:hidden">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <FileText size={16} className="mt-0.5 shrink-0 text-slate-400" />
                  <div>
                    <b>{row.label}</b>
                    <div className="text-xs text-slate-500">{row.fileName}</div>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{DOC_TYPE_LABEL[row.docType]}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {row.linkedLabel && <span>{row.linkedLabel} · </span>}
                {row.uploaderName} · {formatDateTime(row.createdAt)} · {formatSize(row.fileSize)}
              </div>
              <div className="mt-3 flex items-center gap-3">
                {row.downloadUrl && (
                  <a href={row.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600">
                    Download
                  </a>
                )}
                {row.canDelete && (
                  <button
                    onClick={() => {
                      setDeleteTarget(row);
                      setDeleteError(null);
                    }}
                    className="ml-auto text-xs font-bold text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No documents yet.</p>}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Document</th>
                <th>Type</th>
                <th>Linked to</th>
                <th>Uploaded by</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="py-4">
                    <div className="flex items-center gap-2.5">
                      <FileText size={16} className="shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <div className="truncate font-bold">{row.label}</div>
                        <div className="truncate text-xs text-slate-500">{row.fileName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{DOC_TYPE_LABEL[row.docType]}</span>
                  </td>
                  <td className="whitespace-nowrap">{row.linkedLabel ?? "—"}</td>
                  <td className="whitespace-nowrap">{row.uploaderName}</td>
                  <td className="min-w-[11rem]">{formatDateTime(row.createdAt)}</td>
                  <td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-2">
                      {row.downloadUrl && (
                        <a
                          href={row.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold"
                        >
                          <Download size={13} />
                          Download
                        </a>
                      )}
                      {row.canDelete && (
                        <button
                          onClick={() => {
                            setDeleteTarget(row);
                            setDeleteError(null);
                          }}
                          className="rounded-lg border border-red-200 p-2 text-red-600"
                          aria-label="Delete document"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No documents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} />
      </Panel>

      <ConfirmDetailModal
        open={uploadOpen}
        onClose={() => !pending && setUploadOpen(false)}
        title="Upload a document"
        pending={pending}
        error={uploadError}
        confirmLabel="Upload"
        onConfirm={submitUpload}
      >
        <div className="space-y-3">
          <label className="block text-sm font-bold">
            File
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-xs font-normal" />
          </label>
          <label className="block text-sm font-bold">
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Supplier Insurance Certificate 2026"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-bold">
            Type
            <select
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value as DocumentType)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <div>
            <span className="text-sm font-bold">Link to (optional)</span>
            <div className="mt-1 flex gap-2">
              {(["none", "customer", "supplier", "quote"] as LinkType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setLinkType(t);
                    setLinkSearch("");
                    setLinkId(null);
                  }}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-xs font-bold capitalize",
                    linkType === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {linkType !== "none" && (
              <div className="mt-2">
                <input
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder={`Search ${linkType}s…`}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                  {filteredPickerOptions.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input type="radio" name="link-record" checked={linkId === o.id} onChange={() => setLinkId(o.id)} />
                      {o.label}
                    </label>
                  ))}
                  {filteredPickerOptions.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No matches.</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </ConfirmDetailModal>

      {deleteTarget && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setDeleteTarget(null)}
          title="Delete this document?"
          description="This removes the file permanently — it can't be undone."
          pending={pending}
          error={deleteError}
          destructive
          details={[{ label: "Document", value: deleteTarget.label }]}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
