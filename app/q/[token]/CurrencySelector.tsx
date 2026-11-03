"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Globe, Search } from "lucide-react";

interface CurrencyChoice {
  code: string;
  name: string;
}

/**
 * Country flag for a currency. ISO 4217 codes start with the issuing
 * country's ISO 3166 code (AED -> AE, INR -> IN), except the euro, which
 * gets the EU flag, and supranational X.. codes (XOF, XAF...), which have no
 * flag. Images rather than emoji, since Windows doesn't render flag emoji.
 */
function Flag({ code }: { code: string }) {
  const country = code === "EUR" ? "eu" : code.startsWith("X") ? null : code.slice(0, 2).toLowerCase();
  if (!country) return <Globe size={16} className="shrink-0 text-slate-400" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${country}.png`}
      alt=""
      width={20}
      height={15}
      className="h-[15px] w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-slate-200"
    />
  );
}

/**
 * Currency dropdown on the customer's quote page. Picking one reloads the
 * page with ?currency=, which the server uses to convert every amount and
 * to charge card checkout in that currency (lib/localCurrency.ts).
 */
export function CurrencySelector({
  current,
  quoteCurrency,
  localCurrency,
  choices,
}: {
  current: string;
  quoteCurrency: string;
  localCurrency: string | null;
  choices: CurrencyChoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  useEffect(() => setPending(null), [current]);

  const currentName = choices.find((c) => c.code === current)?.name ?? current;
  const q = query.trim().toLowerCase();
  const filtered = choices.filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  // Most useful first: the visitor's own currency, then the quote's.
  const pinned = [localCurrency, quoteCurrency].filter((c, i, all): c is string => !!c && all.indexOf(c) === i);
  const ordered = [
    ...pinned.map((code) => filtered.find((c) => c.code === code)).filter((c): c is CurrencyChoice => !!c),
    ...filtered.filter((c) => !pinned.includes(c.code)),
  ];

  const choose = (code: string) => {
    setOpen(false);
    setQuery("");
    if (code === current) return;
    setPending(code);
    router.push(`?currency=${code}`, { scroll: false });
  };

  return (
    <div ref={ref} className="relative w-full shrink-0 sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:border-primary-300 sm:min-w-[13rem]"
      >
        <Flag code={pending ?? current} />
        <span>{pending ?? current}</span>
        <span className="flex-1 truncate text-left font-normal text-slate-500">{pending ? "Updating…" : currentName}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-full sm:w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search currency"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {ordered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.code === current}
                  onClick={() => choose(c.code)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${c.code === current ? "bg-slate-50" : ""}`}
                >
                  <Flag code={c.code} />
                  <span className="w-10 font-semibold text-slate-800">{c.code}</span>
                  <span className="flex-1 truncate text-slate-500">
                    {c.name}
                    {c.code === localCurrency && <span className="ml-1 text-xs text-primary-600">· your location</span>}
                    {c.code === quoteCurrency && c.code !== localCurrency && <span className="ml-1 text-xs text-slate-400">· quoted</span>}
                  </span>
                  {c.code === current && <Check size={14} className="text-primary-600" />}
                </button>
              </li>
            ))}
            {ordered.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">No matching currency</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
