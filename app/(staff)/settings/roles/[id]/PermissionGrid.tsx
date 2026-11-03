"use client";

import { useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { savePermissionsAction } from "../actions";

interface PermissionItem {
  id: string;
  key: string;
  description: string | null;
}

/** ADM-02: batched Save/Cancel — every checkbox change stays local until
    Save commits the whole set in one call, rather than firing a request per
    click. Cancel discards local edits back to what the server last had. */
export function PermissionGrid({
  roleId,
  categories,
  grantedIds,
  readOnly,
}: {
  roleId: string;
  categories: Record<string, PermissionItem[]>;
  grantedIds: Set<string>;
  readOnly: boolean;
}) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(grantedIds));

  const dirty = useMemo(() => {
    if (selected.size !== grantedIds.size) return true;
    for (const id of selected) if (!grantedIds.has(id)) return true;
    return false;
  }, [selected, grantedIds]);

  function toggle(permissionId: string, enabled: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(permissionId);
      else next.delete(permissionId);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await savePermissionsAction(roleId, [...selected]);
        notify("Permissions saved");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save permissions");
      }
    });
  }

  function cancel() {
    setSelected(new Set(grantedIds));
  }

  return (
    <div className="space-y-6 pb-16">
      {Object.entries(categories).map(([category, perms]) => (
        <div key={category}>
          <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">{category}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {perms.map((perm) => (
              <label
                key={perm.id}
                className="flex items-start gap-3 rounded-xl border p-3 text-sm has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(perm.id)}
                  disabled={readOnly || pending}
                  onChange={(e) => toggle(perm.id, e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-bold">{perm.key}</div>
                  {perm.description && <div className="text-xs text-slate-500">{perm.description}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}

      {!readOnly && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
          <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-2xl sm:w-auto">
            <span className="text-sm font-bold text-slate-600">Unsaved permission changes</span>
            <div className="flex gap-3">
              <button
                onClick={cancel}
                disabled={pending}
                className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={pending}
                className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
