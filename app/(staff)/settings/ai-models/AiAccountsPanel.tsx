// "AI Model Accounts" — one card per provider linking straight to its
// billing page, so Master Admin can check remaining credits. None of
// OpenAI/Anthropic/Gemini expose a remaining-balance API to an ordinary
// inference key (only spend, and only via a separate admin key), so the CRM
// links out rather than showing a number it can't actually know. xAI is the
// one exception — its Management API reports the real prepaid balance, so
// the Grok card shows it when XAI_MANAGEMENT_KEY + XAI_TEAM_ID are set.
// Server component: env vars are read here and only the boolean/balance
// ever reaches the page, never a key itself.

import { ExternalLink } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { AI_PROVIDER_REGISTRY, type AiProvider } from "@/lib/aiProviderRegistry";
import { PROVIDER_ICONS } from "./ProviderIcons";

const PROVIDER_ACCOUNTS: Record<AiProvider, { envVar: string; billingUrl: string; billingLabel: string }> = {
  openai: {
    envVar: "OPENAI_API_KEY",
    billingUrl: "https://platform.openai.com/settings/organization/billing/overview",
    billingLabel: "OpenAI billing",
  },
  anthropic: {
    envVar: "ANTHROPIC_API_KEY",
    billingUrl: "https://platform.claude.com/settings/billing",
    billingLabel: "Claude Console billing",
  },
  gemini: {
    envVar: "GEMINI_API_KEY",
    billingUrl: "https://console.cloud.google.com/billing",
    billingLabel: "Google Cloud billing",
  },
  grok: {
    envVar: "XAI_API_KEY",
    billingUrl: "https://console.x.ai",
    billingLabel: "xAI Console",
  },
};

type GrokBalance = { status: "ok"; dollars: number } | { status: "not_configured" } | { status: "error"; message: string };

/** GET /v1/billing/teams/{team_id}/prepaid/balance — `total.val` is a
    string of USD cents on an inverted ledger (a $10 top-up reads "-1000"),
    so the remaining balance is the negated value. A missing/unparseable
    total is reported as an error, never as $0.00. */
async function fetchGrokBalance(): Promise<GrokBalance> {
  const key = process.env.XAI_MANAGEMENT_KEY;
  const teamId = process.env.XAI_TEAM_ID;
  if (!key || !teamId) return { status: "not_configured" };

  try {
    const res = await fetch(`https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(teamId)}/prepaid/balance`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) return { status: "error", message: "Management key rejected" };
    if (res.status === 404) return { status: "error", message: "Team not found — check XAI_TEAM_ID" };
    if (!res.ok) return { status: "error", message: `xAI returned ${res.status}` };

    const body = (await res.json()) as { total?: { val?: string } };
    const cents = Number(body.total?.val);
    if (body.total?.val == null || !Number.isFinite(cents)) return { status: "error", message: "Unexpected response from xAI" };
    return { status: "ok", dollars: -cents / 100 };
  } catch {
    return { status: "error", message: "Couldn't reach xAI" };
  }
}

export async function AiAccountsPanel() {
  const providers = Object.keys(AI_PROVIDER_REGISTRY) as AiProvider[];
  const grokBalance = await fetchGrokBalance();

  return (
    <div className="mt-8">
      <h2 className="text-lg font-black">AI Model Accounts</h2>
      <p className="mt-1 text-sm text-slate-500">
        Remaining credits are shown on each provider&rsquo;s own billing page — open one below to check the balance or top up.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((provider) => {
          const { envVar, billingUrl, billingLabel } = PROVIDER_ACCOUNTS[provider];
          const ProviderIcon = PROVIDER_ICONS[provider];
          const keySet = Boolean(process.env[envVar]);
          return (
            <Panel key={provider} className="flex h-full flex-col">
              <div className="flex items-center gap-2">
                <ProviderIcon size={20} />
                <h3 className="font-black">{AI_PROVIDER_REGISTRY[provider].label}</h3>
              </div>
              <p className={`mt-2 text-xs font-semibold ${keySet ? "text-emerald-600" : "text-amber-600"}`}>
                {keySet ? "API key set on server" : `${envVar} not set`}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
                <a
                  href={billingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50"
                >
                  {billingLabel}
                  <ExternalLink size={14} />
                </a>
                {provider === "grok" && <GrokBalanceLabel balance={grokBalance} />}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function GrokBalanceLabel({ balance }: { balance: GrokBalance }) {
  if (balance.status === "ok") {
    return (
      <span className="text-sm">
        <span className="font-black">${balance.dollars.toFixed(2)}</span> <span className="text-slate-500">credit left</span>
      </span>
    );
  }
  if (balance.status === "not_configured") {
    return <span className="text-xs text-slate-400">Set XAI_MANAGEMENT_KEY + XAI_TEAM_ID to show balance</span>;
  }
  return <span className="text-xs font-semibold text-amber-600">Balance unavailable: {balance.message}</span>;
}
