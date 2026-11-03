import Link from "next/link";
import { Users, ShieldCheck, Building2, History, Bot, Cpu, BellRing, MessageCircle, Tag } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { SettingsOverviewDiagram } from "@/components/ui/guide-diagrams/SettingsOverviewDiagram";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brandConfig";

const CARDS = [
  { label: "Users", href: "/settings/users", icon: Users, text: "Invite users, assign a brand and region, and manage account status." },
  { label: "Roles & Permissions", href: "/settings/roles", icon: ShieldCheck, text: "Create custom roles and control granular permissions." },
  { label: "Companies & Brands", href: "/settings/brands", icon: Building2, text: "Manage legal companies, trading brands and numbering." },
  { label: "Audit Log", href: "/settings/audit-log", icon: History, text: "Review every financial, pricing and user change." },
];

const MASTER_ADMIN_CARDS = [
  {
    label: "AI Assistant",
    href: "/settings/ai-auto-quote",
    icon: Bot,
    text: `Set how long a lead can sit unquoted before ${BRAND.aiAssistantName} prices and sends a quote automatically.`,
  },
  {
    label: "AI Models",
    href: "/settings/ai-models",
    icon: Cpu,
    text: "Choose which AI provider — OpenAI, Claude, Gemini, or Grok — answers each AI-powered feature.",
  },
  {
    label: "Quote Reminders",
    href: "/settings/quote-reminders",
    icon: BellRing,
    text: "Automatically email customers who haven't accepted or paid a quote yet, and see how many bookings it brings back.",
  },
  {
    label: "WhatsApp Takeover",
    href: "/settings/whatsapp-takeover",
    icon: MessageCircle,
    text: "Set the hours when sales users get a popup for new WhatsApp messages and can take chats over from the AI.",
  },
  {
    label: "Special Deals",
    href: "/settings/special-deals",
    icon: Tag,
    text: "Automatically re-send a quote at a discount when the customer rejects it as too expensive.",
  },
];

export default async function SettingsOverviewPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const cards = profile.is_master_admin ? [...CARDS, ...MASTER_ADMIN_CARDS] : CARDS;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", profile.tenant_id)
    .single();

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Settings"
        text={`Configuration for ${tenant?.name ?? "your organisation"}.`}
        action={
          <PageGuide
            title="Settings"
            subtitle="Administration — every organisation-wide setting lives under this tab strip."
            screenshot={<SettingsOverviewDiagram />}
            sections={[
              {
                heading: "What lives here",
                bullets: true,
                body: [
                  "Users — invite people, assign a role/brand/region, manage account status and connect a personal mailbox.",
                  "Roles & Permissions — the permission catalogue, grouped into system roles plus any custom roles for your organisation.",
                  "Companies & Brands — legal entities and the trading brands under them, including each brand's webhook credentials.",
                  "Bank Details & Terms — payment profiles shown on quotes/invoices, and the fallback Terms & Conditions text.",
                  "Audit Log — an append-only record of every financial, pricing, allocation and user change, plus login activity.",
                ],
              },
              {
                heading: "Who can see this",
                body: [
                  "The whole /settings surface is gated separately from the sidebar — even a direct link only works for someone holding an admin permission. Most day-to-day roles never see this tab at all.",
                ],
              },
            ]}
          />
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ label, href, icon: Icon, text }) => (
          <Link key={href} href={href}>
            <Panel className="h-full transition hover:border-primary-300">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="font-black">{label}</h3>
                  <p className="mt-1 text-sm text-slate-500">{text}</p>
                </div>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
