"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BRAND } from "@/lib/brandConfig";
import { createClient } from "@/lib/supabase/client";
import { updateSignatureDetailsAction } from "@/app/(staff)/email/actions";

const CONFIDENTIALITY_NOTICE =
  "This email and any attachments are confidential and intended solely for the named recipient. If you received this in error, please delete it immediately and notify the sender.";

export interface SignatureProfileInfo {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  signature_switchboard: string | null;
  signature_emergency_email: string | null;
  signature_website: string | null;
  signature_logo_url: string | null;
}

/**
 * Self-service signature settings, in Email Centre. Every field here is
 * editable per user — mirrors what lib/emailSignature.ts actually renders
 * into sent emails; this component re-renders the same layout in JSX for a
 * live preview, since that helper is server-only.
 */
export function EmailSignatureSettings({ profile }: { profile: SignatureProfileInfo }) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [directDial, setDirectDial] = useState(profile.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp_number ?? "");
  const [switchboard, setSwitchboard] = useState(profile.signature_switchboard ?? "");
  const [emergencyEmail, setEmergencyEmail] = useState(profile.signature_emergency_email ?? "");
  const [website, setWebsite] = useState(profile.signature_website ?? "");
  const [logoUrl, setLogoUrl] = useState(profile.signature_logo_url);

  async function onLogoSelected(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${profile.tenant_id}/${profile.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("signature-assets").upload(path, file, {
        contentType: file.type || undefined,
      });
      if (error) {
        notify(`Could not upload logo: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("signature-assets").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not upload the logo.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    startTransition(async () => {
      const result = await updateSignatureDetailsAction({ directDial, whatsapp, switchboard, emergencyEmail, website, logoUrl });
      if (result.error) {
        notify(result.error);
        return;
      }
      notify("Signature updated");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-black">Email signature</h2>
      <p className="mt-1 text-sm text-slate-500">Added automatically to quotes, invoices and other emails you send to customers.</p>

      <div className="mt-5">
        <div className="text-sm font-bold">Logo</div>
        <div className="mt-2 flex items-center gap-4">
          {logoUrl ? (
            <div className="relative">
              <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl border object-contain" />
              <button
                type="button"
                onClick={() => setLogoUrl(null)}
                aria-label="Remove logo"
                className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-slate-700 text-white"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-xl border border-dashed text-slate-300">
              <Upload size={20} />
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            onChange={(e) => {
              onLogoSelected(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {logoUrl ? "Replace logo" : "Upload logo"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Office Phone
          <input
            value={switchboard}
            onChange={(e) => setSwitchboard(e.target.value)}
            placeholder={`e.g. ${BRAND.phoneInternational}`}
            className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
        <label className="text-sm font-bold">
          Direct Dial
          <input
            value={directDial}
            onChange={(e) => setDirectDial(e.target.value)}
            placeholder="e.g. +44 20 7946 0123"
            className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
        <label className="text-sm font-bold">
          WhatsApp
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="e.g. +44 7700 900123"
            className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
        <label className="text-sm font-bold">
          Emergency Email
          <input
            value={emergencyEmail}
            onChange={(e) => setEmergencyEmail(e.target.value)}
            placeholder={`e.g. ${BRAND.contactEmail}`}
            className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Web
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={`e.g. ${BRAND.websiteDisplay}`}
            className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
          />
        </label>
      </div>
      <p className="mt-2 text-xs font-normal text-slate-400">
        Email is always your own account email ({profile.email}) — not editable here.
      </p>
      <button
        onClick={save}
        disabled={pending}
        className="mt-4 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save signature"}
      </button>

      <div className="mt-8 border-t pt-6">
        <div className="text-xs font-black uppercase tracking-wide text-slate-400">Preview</div>
        <div className="mt-3 rounded-2xl bg-slate-50 p-5">
          <div className="flex gap-3.5">
            {logoUrl && <img src={logoUrl} alt="" width={52} className="h-auto rounded-lg" />}
            <div className="text-xs leading-relaxed text-slate-800">
              <div className="font-extrabold">{profile.full_name}</div>
              {profile.job_title && <div className="text-slate-500">{profile.job_title}</div>}
              <div className="mt-1">
                {switchboard && <div>Office Phone: {switchboard}</div>}
                {directDial && <div>Direct Dial: {directDial}</div>}
                {whatsapp && <div>WhatsApp: {whatsapp}</div>}
                <div>Email: {profile.email}</div>
                {emergencyEmail && <div>Emergency Email: {emergencyEmail}</div>}
                {website && <div>Web: {website}</div>}
              </div>
            </div>
          </div>
          <p className="mt-3.5 text-[10px] leading-relaxed text-slate-400">{CONFIDENTIALITY_NOTICE}</p>
        </div>
      </div>
    </div>
  );
}
