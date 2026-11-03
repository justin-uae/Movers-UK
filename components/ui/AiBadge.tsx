import { Bot } from "lucide-react";
import { getAiModelLabel } from "@/lib/aiProviderRegistry";

export interface AiModelInfo {
  provider: string;
  model: string;
}

/** Small "AI" pill marking a quote/job that lib/aiAutoQuote.ts priced and
    sent on its own, wherever that quote naturally shows up (Pending Quotes,
    or whichever Bookings tab it's since moved on to) — replaces the old
    standalone "AI Created Quotes" page, which just listed the same quotes a
    second time instead of badging them in place. Pass `model` (the quote's
    own `ai_model` column, see 0099_quote_ai_model.sql) to show which
    provider/model actually priced THIS quote — omit it (or pass null, e.g.
    a quote created before that column existed) for the plain "AI" pill. */
export function AiBadge({ model }: { model?: AiModelInfo | null } = {}) {
  const label = getAiModelLabel(model);
  return (
    <span
      title={label ? `Priced and sent automatically by AI Auto-Quote — ${label}` : "Priced and sent automatically by AI Auto-Quote"}
      className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600"
    >
      <Bot size={12} /> AI{label ? ` · ${label}` : ""}
    </span>
  );
}
