import Link from "next/link";
import { Mail } from "lucide-react";

/** Email Centre link that opens Compose pre-filled — see initialCompose in components/pages/EmailCentrePage.tsx. */
export function composeEmailHref({ to, subject }: { to: string; subject: string }): string {
  const params = new URLSearchParams({ compose: "1", to, subject });
  return `/email?${params.toString()}`;
}

/**
 * "Send Email" — opens the CRM's own Email Centre (not the user's mail
 * client) with the customer's address in To and the quote reference in the
 * subject, so the conversation lands in the shared CRM mailbox history.
 * `block` is the full-width side-panel style used on detail pages; `row` is
 * the compact list-row style that sits beside View/Assign. Rendered
 * disabled rather than hidden when there's no customer email on file, so
 * it's clear why it can't be used.
 */
export function SendEmailButton({
  email,
  quoteNumber,
  variant = "block",
  className = "",
}: {
  email: string | null | undefined;
  quoteNumber?: string | null;
  variant?: "block" | "row";
  className?: string;
}) {
  const base =
    variant === "block"
      ? "flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-bold"
      : "inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold";
  const size = variant === "block" ? 16 : 14;

  if (!email) {
    return (
      <span title="No email address on file for this customer" className={`${base} cursor-not-allowed text-slate-300 ${className}`}>
        <Mail size={size} />
        Send Email
      </span>
    );
  }

  return (
    <Link
      href={composeEmailHref({ to: email, subject: quoteNumber ? `Quote ${quoteNumber}` : "" })}
      className={`${base} hover:bg-slate-50 ${className}`}
    >
      <Mail size={size} />
      Send Email
    </Link>
  );
}
