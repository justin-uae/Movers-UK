import { Building2 } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { BrandsDiagram } from "@/components/ui/guide-diagrams/BrandsDiagram";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewCompanyForm } from "./NewCompanyForm";
import { NewBrandForm } from "./NewBrandForm";
import { BrandCredentials } from "./BrandCredentials";

// Companies stay few (legal entities), but brands don't — the "Join as a
// Supplier"/website-lead work means every external brand site gets its own
// row here, so unlike companies, brands need to be searchable and paginated
// rather than rendered as one big unpaginated grid per company.
const PAGE_SIZE = 12;

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let brandsQuery = supabase
    .from("brands")
    .select(
      "id, name, slug, webhook_secret, default_currency, primary_color, is_active, company:companies(id, legal_name)",
      { count: "exact" },
    );
  if (q) {
    brandsQuery = brandsQuery.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const [{ data: companies }, { data: brands, count }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trading_name, default_currency").order("legal_name"),
    // Newest-first while brands are still being bulk-added (easiest to spot
    // the one you just created) — switch to .order("name") once onboarding
    // settles down and alphabetical is more useful for finding a brand.
    brandsQuery.order("created_at", { ascending: false }).range(from, to),
  ]);

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Companies & Brands"
        text="Legal entities and the trading brands under them — quote, invoice and email identity flow from here."
        action={
          <div className="flex flex-wrap items-start gap-2">
            <PageGuide
              title="Companies & Brands"
              subtitle="Two layers — legal companies above, the trading brands under each one below."
              screenshot={<BrandsDiagram />}
              sections={[
                {
                  heading: "Companies vs brands",
                  body: [
                    "A company is the legal entity — stays few, added rarely. A brand is a trading identity under a company — every external brand site/domain gets its own brand, so this list is searchable and paginated.",
                  ],
                },
                {
                  heading: "What flows from a brand",
                  bullets: true,
                  body: [
                    "Quote/invoice numbering prefix and currency.",
                    "The colour and identity shown on the public quote page and PDFs.",
                    "The webhook slug + secret a brand's website uses to submit leads into this CRM (shown under each brand card).",
                  ],
                },
                {
                  heading: "Adding one",
                  body: [
                    "New company creates a legal entity first; New brand (below the grid) then attaches a trading brand to whichever company you pick.",
                  ],
                },
              ]}
            />
            <NewCompanyForm />
          </div>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(companies ?? []).map((company) => (
          <div key={company.id} className="flex items-center gap-3 rounded-2xl border bg-white p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
              <Building2 size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold">{company.legal_name}</div>
              <div className="truncate text-xs text-slate-500">
                {company.trading_name ?? "No trading name"} · {company.default_currency}
              </div>
            </div>
          </div>
        ))}
        {(companies ?? []).length === 0 && (
          <p className="text-sm text-slate-400 sm:col-span-2 lg:col-span-3">No companies yet — create one to start adding brands.</p>
        )}
      </div>

      <Panel>
        <div className="mb-4">
          <SearchInput placeholder="Search brands by name…" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(brands ?? []).map((brand) => {
            const company = brand.company as unknown as { id: string; legal_name: string } | null;
            return (
              <div key={brand.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: brand.primary_color }} />
                  <div className="min-w-0">
                    <div className="truncate font-bold">{brand.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {company?.legal_name ?? "—"} · {brand.default_currency}
                    </div>
                  </div>
                </div>
                <BrandCredentials slug={brand.slug} secret={brand.webhook_secret} />
              </div>
            );
          })}
          {(brands ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
              {q ? `No brands match "${q}".` : "No brands yet — create one to get started."}
            </p>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Panel>

      <div className="mt-6 flex flex-wrap gap-4">
        <NewBrandForm companies={(companies ?? []).map((c) => ({ id: c.id, legal_name: c.legal_name }))} />
      </div>
    </div>
  );
}
