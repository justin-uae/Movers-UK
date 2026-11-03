"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { upsertEmailAccountAction, testEmailConnectionAction, disconnectEmailAccountAction } from "./actions";
import type { EmailSecurity } from "@/lib/supabase/database.types";

export interface EmailAccountStatus {
  id: string;
  display_name: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_security: EmailSecurity;
  imap_username: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: EmailSecurity;
  smtp_username: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

const SECURITY_OPTIONS: EmailSecurity[] = ["ssl", "starttls", "none"];

export function MailboxBadge({
  userId,
  userName,
  account,
  canManage,
}: {
  userId: string;
  userName: string;
  account: EmailAccountStatus | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  const label = !account
    ? "Not connected"
    : account.last_sync_error
      ? "Sync error"
      : !account.is_active
        ? "Inactive"
        : "Connected";
  const style = !account
    ? "bg-slate-100 text-slate-500"
    : account.last_sync_error
      ? "bg-red-50 text-red-700"
      : !account.is_active
        ? "bg-slate-100 text-slate-500"
        : "bg-emerald-50 text-emerald-700";

  return (
    <>
      <button
        type="button"
        disabled={!canManage}
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold disabled:cursor-default ${style}`}
      >
        <Mail size={12} />
        {label}
      </button>
      {open && (
        <EmailAccountForm userId={userId} userName={userName} account={account} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function EmailAccountForm({
  userId,
  userName,
  account,
  onClose,
}: {
  userId: string;
  userName: string;
  account: EmailAccountStatus | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [testPending, startTest] = useTransition();
  const [disconnectPending, startDisconnect] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ imapError: string | null; smtpError: string | null } | null>(null);

  const [displayName, setDisplayName] = useState(account?.display_name ?? userName);
  const [emailAddress, setEmailAddress] = useState(account?.email_address ?? "");
  const [imapHost, setImapHost] = useState(account?.imap_host ?? "");
  const [imapPort, setImapPort] = useState(String(account?.imap_port ?? 993));
  const [imapSecurity, setImapSecurity] = useState<EmailSecurity>(account?.imap_security ?? "ssl");
  const [imapUsername, setImapUsername] = useState(account?.imap_username ?? "");
  const [imapPassword, setImapPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState(account?.smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState(String(account?.smtp_port ?? 587));
  const [smtpSecurity, setSmtpSecurity] = useState<EmailSecurity>(account?.smtp_security ?? "starttls");
  const [smtpUsername, setSmtpUsername] = useState(account?.smtp_username ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [isActive, setIsActive] = useState(account?.is_active ?? true);

  function currentValues() {
    return {
      displayName,
      emailAddress,
      imapHost,
      imapPort: Number(imapPort) || 993,
      imapSecurity,
      imapUsername,
      imapPassword,
      smtpHost,
      smtpPort: Number(smtpPort) || 587,
      smtpSecurity,
      smtpUsername,
      smtpPassword,
      isActive,
    };
  }

  function runTest() {
    setTestResult(null);
    startTest(async () => {
      const result = await testEmailConnectionAction(currentValues());
      setTestResult(result);
    });
  }

  function save() {
    setError(null);
    if (!displayName || !emailAddress || !imapHost || !imapUsername || !smtpHost || !smtpUsername) {
      setError("Fill in every field except the passwords, which can be left blank to keep what's already saved.");
      return;
    }
    if (!account && (!imapPassword || !smtpPassword)) {
      setError("IMAP and SMTP passwords are required the first time you connect this mailbox.");
      return;
    }
    startTransition(async () => {
      const result = await upsertEmailAccountAction(userId, currentValues());
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify(`Mailbox saved for ${userName}`);
      router.refresh();
      onClose();
    });
  }

  function disconnect() {
    if (!window.confirm(`Disconnect the mailbox for ${userName}? Their synced mail history will be removed — this can't be undone.`)) {
      return;
    }
    setError(null);
    startDisconnect(async () => {
      const result = await disconnectEmailAccountAction(userId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      notify(`Mailbox disconnected for ${userName}`);
      router.refresh();
      onClose();
    });
  }

  return (
    <ConfirmDetailModal
      open
      onClose={() => !pending && onClose()}
      title={`Mailbox for ${userName}`}
      description="Configure this person's IMAP/SMTP mailbox so their sent and received mail appears in the Email Centre. Most providers (Gmail, Outlook, Zoho…) require an app-specific password, not the real account password."
      pending={pending}
      error={error}
      confirmLabel={account ? "Save changes" : "Connect mailbox"}
      onConfirm={save}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Email address
          <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
        </label>
      </div>

      <div className="mt-4 rounded-xl border p-3">
        <div className="text-xs font-bold uppercase text-slate-400">IMAP (incoming)</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">
            Host
            <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.example.com" className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-bold">
            Port
            <input value={imapPort} onChange={(e) => setImapPort(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-bold">
            Security
            <select value={imapSecurity} onChange={(e) => setImapSecurity(e.target.value as EmailSecurity)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal">
              {SECURITY_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Username
            <input value={imapUsername} onChange={(e) => setImapUsername(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            Password {account && <span className="font-normal text-slate-400">(leave blank to keep the saved one)</span>}
            <input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
        </div>
      </div>

      <div className="mt-3 rounded-xl border p-3">
        <div className="text-xs font-bold uppercase text-slate-400">SMTP (outgoing)</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">
            Host
            <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-bold">
            Port
            <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-bold">
            Security
            <select value={smtpSecurity} onChange={(e) => setSmtpSecurity(e.target.value as EmailSecurity)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal">
              {SECURITY_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Username
            <input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-bold sm:col-span-2">
            Password {account && <span className="font-normal text-slate-400">(leave blank to keep the saved one)</span>}
            <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (included in mail sync)
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={testPending}
          onClick={runTest}
          className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-60"
        >
          {testPending ? "Testing…" : "Test connection"}
        </button>
        {testResult && (
          <div className="text-xs">
            <div className={testResult.imapError ? "font-bold text-red-600" : "font-bold text-emerald-600"}>
              IMAP: {testResult.imapError ?? "OK"}
            </div>
            <div className={testResult.smtpError ? "font-bold text-red-600" : "font-bold text-emerald-600"}>
              SMTP: {testResult.smtpError ?? "OK"}
            </div>
          </div>
        )}
      </div>

      {account?.last_sync_error && (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          Last sync error: {account.last_sync_error}
        </div>
      )}

      {account && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-red-100 bg-red-50/50 p-3">
          <div className="text-xs text-red-700">
            <div className="font-bold">Disconnect this mailbox</div>
            <div className="mt-0.5 text-red-600">Removes the connection and all synced mail for {userName}.</div>
          </div>
          <button
            type="button"
            disabled={disconnectPending || pending}
            onClick={disconnect}
            className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-60"
          >
            {disconnectPending ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}
    </ConfirmDetailModal>
  );
}
