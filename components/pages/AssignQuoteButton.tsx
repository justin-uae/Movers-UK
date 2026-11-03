"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { assignQuoteAction } from "@/app/(staff)/quotes/actions";
import type { AssignableUser } from "@/components/pages/LeadDetailPage";

/** Inline "Assign"/"Reassign" link, meant to sit right next to a Sales Rep
    field — the quote detail page's Customer panel is server-rendered, so
    this is its own small client island rather than folding the whole panel
    into a client component just for one button. */
export function AssignQuoteButton({
  quoteId,
  quoteNumber,
  currentAssigneeId,
  currentAssigneeName,
  assignableUsers,
}: {
  quoteId: string;
  quoteNumber: string;
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  assignableUsers: AssignableUser[];
}) {
  const router = useRouter();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setError(null);
    setAssigneeId(currentAssigneeId ?? "");
    setOpen(true);
  }

  function doAssign() {
    if (!assigneeId) {
      setError("Choose someone to assign this quote to.");
      return;
    }
    if (assigneeId === currentAssigneeId) {
      setError("This quote is already assigned to that person.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignQuoteAction(quoteId, assigneeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      const name = assignableUsers.find((u) => u.id === assigneeId)?.full_name ?? "the selected user";
      notify(`Quote assigned to ${name}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={openModal} className="text-xs font-bold text-primary-600 hover:underline">
        {currentAssigneeName ? "Reassign" : "Assign"}
      </button>

      {open && (
        <ConfirmDetailModal
          open
          onClose={() => !pending && setOpen(false)}
          title={`Assign ${quoteNumber}`}
          description="Hand this quote to a specific sales user — moves it onto their list the same way reassigning its lead would."
          pending={pending}
          error={error}
          details={[{ label: "Currently", value: currentAssigneeName || <span className="font-bold text-primary-600">Unassigned</span> }]}
          confirmLabel="Assign"
          onConfirm={doAssign}
        >
          <label className="block text-sm font-bold">
            Assign to
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
            >
              <option value="">Choose a sales user…</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </label>
        </ConfirmDetailModal>
      )}
    </>
  );
}
