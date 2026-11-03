"use client";

import { useState, useTransition } from "react";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { updateEmailTemplateAction } from "@/app/(staff)/email/actions";
import { EMAIL_TEMPLATE_INFO, type EmailTemplateKey } from "@/lib/emailTemplateInfo";
import type { EmailTemplate } from "@/lib/supabase/database.types";

export function EmailTemplatesPage({ templates }: { templates: EmailTemplate[] }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(template: EmailTemplate) {
    setTarget(template);
    setSubject(template.subject);
    setBodyHtml(template.body_html);
    setError(null);
  }

  function save() {
    if (!target) return;
    startTransition(async () => {
      const result = await updateEmailTemplateAction(target.id, { subject, bodyHtml });
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify("Template saved");
      setTarget(null);
    });
  }

  const targetInfo = target ? EMAIL_TEMPLATE_INFO[target.key as EmailTemplateKey] : null;

  return (
    <div>
      <Panel>
        <SectionTitle title="Email templates" sub="Wording sent automatically at each step — edit the subject and body below. Links and other dynamic values are inserted automatically wherever {{variable}} appears." />
        <div className="mt-4 space-y-3">
          {templates.map((template) => {
            const info = EMAIL_TEMPLATE_INFO[template.key as EmailTemplateKey];
            return (
              <div key={template.id} className="flex items-center justify-between gap-3 rounded-2xl border p-4">
                <div className="min-w-0">
                  <b>{info?.label ?? template.key}</b>
                  <div className="truncate text-sm text-slate-500">{info?.description}</div>
                  <div className="mt-1 truncate text-xs text-slate-400">Subject: {template.subject}</div>
                </div>
                <button
                  onClick={() => open(template)}
                  className="shrink-0 rounded-lg border px-3 py-2 text-xs font-bold"
                >
                  Edit
                </button>
              </div>
            );
          })}
          {templates.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No templates found.</p>}
        </div>
      </Panel>

      <ConfirmDetailModal
        open={!!target}
        onClose={() => !pending && setTarget(null)}
        title={targetInfo?.label ?? "Edit template"}
        description={targetInfo?.description}
        pending={pending}
        error={error}
        confirmLabel="Save template"
        onConfirm={save}
      >
        <div className="space-y-3">
          <label className="block text-sm font-bold">
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-bold">
            Body (HTML)
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="mt-1 min-h-48 w-full rounded-lg border p-3 font-mono text-xs font-normal"
            />
          </label>
          {targetInfo && (
            <p className="text-xs text-slate-400">
              Available variables: {targetInfo.variables.map((v) => `{{${v}}}`).join(", ")}
            </p>
          )}
        </div>
      </ConfirmDetailModal>
    </div>
  );
}
