"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { resendSupplierInviteAction } from "../actions";

export function ResendSupplierInviteButton({ supplierId, email }: { supplierId: string; email: string }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const result = await resendSupplierInviteAction(supplierId);
      if (result.error) {
        notify(`Could not send the invite email (${result.error}) — link: ${result.link ?? "none"}`);
        return;
      }
      notify(`Invite email resent to ${email}`);
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={resend}
      className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-60"
    >
      {pending ? "Sending…" : "Resend invite"}
    </button>
  );
}
