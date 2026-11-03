"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { BRAND } from "@/lib/brandConfig";

async function requireBankDetailsManager() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_ACCOUNTING_SETTINGS);
  if (!allowed) throw new Error("You do not have permission to manage bank details.");
  return profile;
}

export interface BankProfileInput {
  profileLabel: string;
  accountName: string;
  bankName: string;
  currency: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  sortCode: string;
  bankAddress: string;
  paymentNotes: string;
}

function validate(input: BankProfileInput): string | null {
  if (!input.profileLabel.trim() || !input.accountName.trim() || !input.bankName.trim()) {
    return "Profile label, account holder and bank name are required.";
  }
  return null;
}

export async function createBankProfileAction(input: BankProfileInput) {
  const actor = await requireBankDetailsManager();
  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("bank_accounts")
    .select("sort_order")
    .eq("tenant_id", actor.tenant_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile, error } = await supabase
    .from("bank_accounts")
    .insert({
      tenant_id: actor.tenant_id,
      brand_id: null,
      profile_label: input.profileLabel.trim(),
      account_name: input.accountName.trim(),
      bank_name: input.bankName.trim(),
      currency: input.currency.trim().toUpperCase() || BRAND.defaultCurrency,
      account_number: input.accountNumber.trim() || null,
      iban: input.iban.trim() || null,
      swift_bic: input.swiftBic.trim() || null,
      sort_code: input.sortCode.trim() || null,
      bank_address: input.bankAddress.trim() || null,
      payment_notes: input.paymentNotes.trim() || null,
      sort_order: (last?.sort_order ?? 0) + 1,
      is_default: false,
    })
    .select("id")
    .single();
  if (error || !profile) return { error: error?.message ?? "Could not create this bank profile." };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "bank_profile_created",
    entityType: "bank_account",
    entityId: profile.id,
    newValue: { profileLabel: input.profileLabel },
  });

  revalidatePath("/settings/bank-details");
  return { error: null };
}

export async function updateBankProfileAction(id: string, input: BankProfileInput) {
  const actor = await requireBankDetailsManager();
  const validationError = validate(input);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      profile_label: input.profileLabel.trim(),
      account_name: input.accountName.trim(),
      bank_name: input.bankName.trim(),
      currency: input.currency.trim().toUpperCase() || BRAND.defaultCurrency,
      account_number: input.accountNumber.trim() || null,
      iban: input.iban.trim() || null,
      swift_bic: input.swiftBic.trim() || null,
      sort_code: input.sortCode.trim() || null,
      bank_address: input.bankAddress.trim() || null,
      payment_notes: input.paymentNotes.trim() || null,
    })
    .eq("id", id)
    .eq("tenant_id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "bank_profile_updated",
    entityType: "bank_account",
    entityId: id,
    newValue: { profileLabel: input.profileLabel },
  });

  revalidatePath("/settings/bank-details");
  return { error: null };
}

export async function deleteBankProfileAction(id: string) {
  const actor = await requireBankDetailsManager();
  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id).eq("tenant_id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "bank_profile_deleted",
    entityType: "bank_account",
    entityId: id,
  });

  revalidatePath("/settings/bank-details");
  return { error: null };
}

export async function updateTermsAction(text: string) {
  const actor = await requireBankDetailsManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ terms_and_conditions: text.trim() || null })
    .eq("id", actor.tenant_id);
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "terms_and_conditions_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
  });

  revalidatePath("/settings/bank-details");
  return { error: null };
}

/** Default validity for new quotes (0104_quote_validity_days.sql) — pre-fills the New Quote form and sets every AI-sent quote's expiry. */
export async function updateQuoteValidityAction(days: number) {
  const actor = await requireBankDetailsManager();
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { error: "Enter a whole number of days between 1 and 365." };
  }
  const supabase = await createClient();
  // .select() so an RLS no-op (tenants_update is Master-Admin-only) comes
  // back as a readable error instead of a silent "saved" that didn't save.
  const { data, error } = await supabase.from("tenants").update({ quote_validity_days: days }).eq("id", actor.tenant_id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only Master Admin can change the default quote validity." };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "quote_validity_updated",
    entityType: "tenant",
    entityId: actor.tenant_id,
    newValue: { quoteValidityDays: days },
  });

  revalidatePath("/settings/bank-details");
  return { error: null };
}
