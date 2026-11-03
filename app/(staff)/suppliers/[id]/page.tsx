import { notFound } from "next/navigation";
import { FileText, Truck } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { BackLink } from "@/components/ui/BackLink";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FormattedText } from "@/components/ui/FormattedText";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatDate } from "@/lib/formatDate";
import { SupplierDecisionButtons } from "./SupplierDecisionButtons";
import { ResendSupplierInviteButton } from "./ResendSupplierInviteButton";
import { EditSupplierButton } from "./EditSupplierButton";
import { SupplierSuspendButton } from "./SupplierSuspendButton";
import { SupplierEditHistory, type SupplierEditRecord } from "@/components/pages/SupplierEditHistory";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: supplier }, { data: vehicles }, { data: documents }, canEdit, canSuspend, { data: editsRaw }] = await Promise.all([
    supabase.from("suppliers").select("*, suspended_by_profile:profiles!suppliers_suspended_by_fkey(full_name)").eq("id", id).single(),
    supabase.from("supplier_vehicles").select("*").eq("supplier_id", id).order("created_at"),
    supabase.from("supplier_documents").select("*").eq("supplier_id", id).order("uploaded_at"),
    hasPermission(profile, PERMISSIONS.SUPPLIERS_EDIT),
    hasPermission(profile, PERMISSIONS.SUPPLIERS_SUSPEND),
    supabase
      .from("supplier_edits")
      .select("id, reason, changes, created_at, profiles(full_name)")
      .eq("supplier_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!supplier) notFound();

  const signedUrls = await Promise.all(
    (documents ?? []).map(async (doc) => {
      const { data } = await supabase.storage.from("supplier-documents").createSignedUrl(doc.storage_path, 3600);
      return { id: doc.id, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div>
      <Breadcrumb items={[{ label: "Suppliers", href: "/suppliers" }, { label: supplier.name }]} />
      <PageHead
        eyebrow="Operations"
        title={supplier.name}
        text={`${supplier.type === "individual" ? "Individual driver" : "Company / travel agency"} · ${supplier.region ?? "No region set"}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <BackLink fallbackHref="/suppliers" label="Back to Suppliers" />
            {canEdit && <EditSupplierButton supplier={supplier} />}
            {(supplier.status === "submitted" || supplier.status === "invited") && (
              <div className="flex flex-wrap gap-2">
                {supplier.status === "invited" && (
                  <ResendSupplierInviteButton supplierId={supplier.id} email={supplier.email} />
                )}
                <SupplierDecisionButtons supplierId={supplier.id} />
              </div>
            )}
            {canSuspend && (supplier.status === "approved" || supplier.status === "suspended") && (
              <SupplierSuspendButton supplierId={supplier.id} status={supplier.status} />
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Business details" sub="Submitted by the supplier during verification" />
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Status" value={supplier.status} />
              <Row label="Registered" value={formatDate(supplier.created_at)} />
              <Row label="Contact" value={supplier.contact_name} />
              <Row label="Email" value={supplier.email} />
              <Row label="Phone" value={supplier.phone} />
              <Row label="WhatsApp" value={supplier.whatsapp} />
              <Row label="Registration number" value={supplier.registration_number} />
              <Row label="VAT number" value={supplier.vat_number} />
              <Row label="Insurance details" value={supplier.insurance_details} />
              <Row label="License number" value={supplier.license_number} />
              {supplier.status === "suspended" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="font-bold text-amber-800">
                    Suspended{supplier.suspended_at ? ` on ${formatDate(supplier.suspended_at)}` : ""}
                    {supplier.suspended_by_profile?.full_name ? ` by ${supplier.suspended_by_profile.full_name}` : ""}
                  </div>
                  <p className="mt-1 text-amber-700">{supplier.suspension_reason}</p>
                </div>
              )}
              {supplier.notes && (
                <div className="border-t pt-2">
                  <div className="text-slate-500">Internal notes</div>
                  <div className="mt-1">
                    <FormattedText text={supplier.notes} />
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <SupplierEditHistory edits={(editsRaw ?? []) as unknown as SupplierEditRecord[]} />
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Vehicles" sub={`${(vehicles ?? []).length} submitted`} />
            <div className="mt-4 space-y-2">
              {(vehicles ?? []).map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <Truck size={16} className="shrink-0 text-slate-400" />
                  <div>
                    <b>{v.vehicle_type}</b>
                    {v.seat_capacity && <span className="text-slate-500"> · {v.seat_capacity} seats</span>}
                    {v.plate_number && <span className="text-slate-500"> · {v.plate_number}</span>}
                  </div>
                </div>
              ))}
              {(vehicles ?? []).length === 0 && <p className="text-sm text-slate-400">No vehicles submitted yet.</p>}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Documents" sub={`${(documents ?? []).length} uploaded`} />
            <div className="mt-4 space-y-2">
              {(documents ?? []).map((doc) => {
                const url = signedUrls.find((s) => s.id === doc.id)?.url;
                return (
                  <a
                    key={doc.id}
                    href={url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border p-3 text-sm hover:bg-slate-50"
                  >
                    <FileText size={16} className="shrink-0 text-slate-400" />
                    <div>
                      <b>{doc.label}</b>
                      <div className="text-xs text-slate-500">{doc.file_name}</div>
                    </div>
                  </a>
                );
              })}
              {(documents ?? []).length === 0 && <p className="text-sm text-slate-400">No documents uploaded yet.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between border-b py-1.5 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold capitalize">{value ?? "—"}</span>
    </div>
  );
}
