"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { BRAND } from "@/lib/brandConfig";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function requireBrandManager() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_BRANDS);
  if (!allowed) throw new Error("You do not have permission to manage companies and brands.");
  return profile;
}

export async function createCompanyAction(_prevState: { error: string | null }, formData: FormData) {
  const actor = await requireBrandManager();
  const legalName = String(formData.get("legalName") ?? "").trim();
  const tradingName = String(formData.get("tradingName") ?? "").trim() || null;
  const defaultCurrency = String(formData.get("defaultCurrency") ?? BRAND.defaultCurrency).trim() || BRAND.defaultCurrency;

  if (!legalName) return { error: "Legal company name is required." };

  const supabase = await createClient();
  const { data: company, error } = await supabase
    .from("companies")
    .insert({ tenant_id: actor.tenant_id, legal_name: legalName, trading_name: tradingName, default_currency: defaultCurrency })
    .select()
    .single();

  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "company_created",
    entityType: "company",
    entityId: company.id,
    newValue: { legalName },
  });

  revalidatePath("/settings/brands");
  return { error: null };
}

export async function createBrandAction(_prevState: { error: string | null }, formData: FormData) {
  const actor = await requireBrandManager();
  const companyId = String(formData.get("companyId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const defaultCurrency = String(formData.get("defaultCurrency") ?? BRAND.defaultCurrency).trim() || BRAND.defaultCurrency;
  const primaryColor = String(formData.get("primaryColor") ?? "#f97316").trim() || "#f97316";

  if (!companyId || !name) return { error: "Company and brand name are required." };

  const supabase = await createClient();
  const { data: brand, error } = await supabase
    .from("brands")
    .insert({
      tenant_id: actor.tenant_id,
      company_id: companyId,
      name,
      slug: slugify(name),
      default_currency: defaultCurrency,
      primary_color: primaryColor,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "brand_created",
    entityType: "brand",
    entityId: brand.id,
    newValue: { name, companyId },
  });

  revalidatePath("/settings/brands");
  return { error: null };
}
