"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Hand, MessageCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { takeOverWhatsAppChatAction } from "@/app/(staff)/whatsapp/actions";

interface Alert {
  waId: string;
  name: string;
  preview: string;
  at: string;
}

interface ConversationPayload {
  wa_id: string;
  contact_name: string | null;
  owner_id: string | null;
  last_inbound_at: string | null;
  last_inbound_preview: string | null;
}

/** An alert this old (no newer message since) is no longer worth interrupting anyone for. */
const ALERT_TTL_MS = 10 * 60 * 1000;
const MAX_VISIBLE = 3;

/**
 * Popup for sales users when a WhatsApp message arrives on a chat nobody
 * owns, during the takeover hours Master Admin sets (Settings -> WhatsApp
 * Takeover). RLS on whatsapp_conversations only lets a sales user see an
 * unowned row while that window is open (0113_whatsapp_sales_takeover.sql),
 * so realtime only delivers these events inside the window.
 *
 * A successful takeover is broadcast on the tenant channel so the popup
 * closes for every other sales user straight away — they can't see the row
 * any more once it has an owner, so they'd never get that update otherwise.
 */
export function WhatsAppTakeoverAlerts({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const notify = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busyWaId, setBusyWaId] = useState<string | null>(null);
  const broadcastRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const remove = (waId: string) => setAlerts((prev) => prev.filter((a) => a.waId !== waId));

    const changes = supabase
      .channel(`whatsapp-takeover-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations", filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        const row = payload.new as ConversationPayload | undefined;
        if (!row?.wa_id) return;
        if (row.owner_id) return remove(row.wa_id);
        if (!row.last_inbound_at || Date.now() - new Date(row.last_inbound_at).getTime() > ALERT_TTL_MS) return;
        const alert: Alert = {
          waId: row.wa_id,
          name: row.contact_name && row.contact_name !== row.wa_id ? row.contact_name : `+${row.wa_id}`,
          preview: row.last_inbound_preview ?? "",
          at: row.last_inbound_at,
        };
        setAlerts((prev) => [alert, ...prev.filter((a) => a.waId !== row.wa_id)]);
      })
      .subscribe();

    const broadcast = supabase
      .channel(`whatsapp-takeover-claims-${tenantId}`)
      .on("broadcast", { event: "claimed" }, ({ payload }) => {
        if (typeof payload?.waId === "string") remove(payload.waId);
      })
      .subscribe();
    broadcastRef.current = broadcast;

    const sweep = setInterval(() => {
      setAlerts((prev) => prev.filter((a) => Date.now() - new Date(a.at).getTime() <= ALERT_TTL_MS));
    }, 30_000);

    return () => {
      clearInterval(sweep);
      supabase.removeChannel(changes);
      supabase.removeChannel(broadcast);
      broadcastRef.current = null;
    };
  }, [tenantId]);

  async function takeOver(alert: Alert) {
    setBusyWaId(alert.waId);
    const result = await takeOverWhatsAppChatAction(alert.waId);
    setBusyWaId(null);
    setAlerts((prev) => prev.filter((a) => a.waId !== alert.waId));
    if (result.error) {
      notify(result.error);
      return;
    }
    void broadcastRef.current?.send({ type: "broadcast", event: "claimed", payload: { waId: alert.waId } });
    notify(`You've taken over the chat with ${alert.name} — AI paused`);
    router.push(`/whatsapp?chat=${encodeURIComponent(alert.waId)}`);
  }

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3" aria-live="polite">
      {alerts.slice(0, MAX_VISIBLE).map((alert) => (
        <div key={alert.waId} className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl ring-1 ring-black/5">
          <div className="flex items-start gap-3 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
              <MessageCircle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black uppercase tracking-wide text-emerald-600">New WhatsApp message</div>
              <div className="truncate text-sm font-bold text-slate-900">{alert.name}</div>
              {alert.preview && <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{alert.preview}</p>}
            </div>
            <button
              type="button"
              onClick={() => setAlerts((prev) => prev.filter((a) => a.waId !== alert.waId))}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5">
            <span className="text-[11px] text-slate-500">AI is replying until someone takes over</span>
            <button
              type="button"
              disabled={busyWaId === alert.waId}
              onClick={() => takeOver(alert)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary-600 disabled:opacity-60"
            >
              <Hand size={14} />
              {busyWaId === alert.waId ? "Taking over…" : "Take over"}
            </button>
          </div>
        </div>
      ))}
      {alerts.length > MAX_VISIBLE && (
        <div className="self-end rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white shadow">+{alerts.length - MAX_VISIBLE} more waiting</div>
      )}
    </div>
  );
}
