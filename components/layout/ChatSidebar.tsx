"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Hash, User, Plus, Search, X } from "lucide-react";
import clsx from "clsx";
import { ConfirmDetailModal } from "@/components/ui/ConfirmDetailModal";
import { useToast } from "@/components/ui/Toast";
import { createChannelAction, startDmAction, searchMessagesAction, type ChatSearchResult } from "@/app/(staff)/team-chat/actions";
import type { ChannelListItem } from "@/lib/chat";

export interface ProfileOption {
  id: string;
  name: string;
}

export function ChatSidebar({ channels, profiles }: { channels: ChannelListItem[]; profiles: ProfileOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelError, setChannelError] = useState<string | null>(null);

  const [newDmOpen, setNewDmOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmError, setDmError] = useState<string | null>(null);

  const filteredProfiles = useMemo(
    () => profiles.filter((p) => p.name.toLowerCase().includes(dmSearch.toLowerCase())),
    [profiles, dmSearch],
  );

  const publicChannels = channels.filter((c) => c.type === "channel");
  const dms = channels.filter((c) => c.type === "dm");

  function onSearchChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    startTransition(async () => {
      try {
        const results = await searchMessagesAction(value);
        setSearchResults(results);
      } finally {
        setSearching(false);
      }
    });
  }

  function submitNewChannel() {
    if (!channelName.trim()) {
      setChannelError("Give the channel a name.");
      return;
    }
    startTransition(async () => {
      try {
        const id = await createChannelAction(channelName);
        setNewChannelOpen(false);
        setChannelName("");
        router.push(`/team-chat/${id}`);
      } catch (err) {
        setChannelError(err instanceof Error ? err.message : "Could not create this channel.");
      }
    });
  }

  function openDm(profileId: string) {
    startTransition(async () => {
      try {
        const id = await startDmAction(profileId);
        setNewDmOpen(false);
        setDmSearch("");
        router.push(`/team-chat/${id}`);
      } catch (err) {
        setDmError(err instanceof Error ? err.message : "Could not start this conversation.");
        notify(err instanceof Error ? err.message : "Could not start this conversation.");
      }
    });
  }

  return (
    <div className="flex h-56 w-full shrink-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full lg:w-72">
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages…"
            className="w-full rounded-xl border bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none"
          />
          {query && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {query ? (
          <div>
            <div className="mb-2 px-1 text-xs font-bold uppercase text-slate-400">{searching ? "Searching…" : "Messages"}</div>
            <div className="space-y-1">
              {(searchResults ?? []).map((r) => (
                <button
                  key={r.messageId}
                  onClick={() => {
                    onSearchChange("");
                    router.push(`/team-chat/${r.channelId}`);
                  }}
                  className="block w-full rounded-xl px-2.5 py-2 text-left hover:bg-slate-50"
                >
                  <div className="text-xs font-bold text-slate-500">{r.channelLabel}</div>
                  <div className="truncate text-sm text-slate-700">{r.body}</div>
                </button>
              ))}
              {searchResults && searchResults.length === 0 && !searching && (
                <p className="px-2.5 py-4 text-center text-xs text-slate-400">No messages found.</p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase text-slate-400">Channels</span>
              <button onClick={() => setNewChannelOpen(true)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="New channel">
                <Plus size={15} />
              </button>
            </div>
            <div className="space-y-0.5">
              {publicChannels.map((c) => (
                <ChannelLink key={c.id} channel={c} icon={Hash} active={pathname === `/team-chat/${c.id}`} />
              ))}
              {publicChannels.length === 0 && <p className="px-2.5 py-2 text-xs text-slate-400">No channels yet.</p>}
            </div>

            <div className="mb-1 mt-4 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase text-slate-400">Direct Messages</span>
              <button onClick={() => setNewDmOpen(true)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="New direct message">
                <Plus size={15} />
              </button>
            </div>
            <div className="space-y-0.5">
              {dms.map((c) => (
                <ChannelLink key={c.id} channel={c} icon={User} active={pathname === `/team-chat/${c.id}`} />
              ))}
              {dms.length === 0 && <p className="px-2.5 py-2 text-xs text-slate-400">No conversations yet.</p>}
            </div>
          </>
        )}
      </div>

      <ConfirmDetailModal
        open={newChannelOpen}
        onClose={() => !pending && setNewChannelOpen(false)}
        title="New channel"
        pending={pending}
        error={channelError}
        confirmLabel="Create"
        onConfirm={submitNewChannel}
      >
        <label className="block text-sm font-bold">
          Channel name
          <input
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="e.g. dispatch-ops"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
          />
        </label>
      </ConfirmDetailModal>

      <ConfirmDetailModal
        open={newDmOpen}
        onClose={() => !pending && setNewDmOpen(false)}
        title="New direct message"
        pending={pending}
        error={dmError}
      >
        <input
          value={dmSearch}
          onChange={(e) => setDmSearch(e.target.value)}
          placeholder="Search people…"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
        <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
          {filteredProfiles.map((p) => (
            <button key={p.id} onClick={() => openDm(p.id)} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
              {p.name}
            </button>
          ))}
          {filteredProfiles.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No matches.</p>}
        </div>
      </ConfirmDetailModal>
    </div>
  );
}

function ChannelLink({
  channel,
  icon: Icon,
  active,
}: {
  channel: ChannelListItem;
  icon: typeof Hash;
  active: boolean;
}) {
  return (
    <Link
      href={`/team-chat/${channel.id}`}
      className={clsx(
        "flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm",
        active ? "bg-primary-50 font-bold text-primary-700" : "text-slate-600 hover:bg-slate-50",
        channel.unread && !active && "font-bold text-slate-900",
      )}
    >
      <Icon size={14} className="shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate">{channel.label}</span>
      {channel.unread && !active && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
    </Link>
  );
}
