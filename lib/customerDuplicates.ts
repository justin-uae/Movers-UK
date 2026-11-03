import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface DuplicateCustomerMatch {
  id: string;
  label: string;
}

/**
 * Looks for an existing customer in the same tenant sharing this email or
 * phone. Per spec this is a warning, never a block — callers should let the
 * caller re-submit with an explicit override once shown this match, not
 * refuse the create outright.
 */
export async function findDuplicateCustomer(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  email: string | null,
  phone: string | null,
): Promise<DuplicateCustomerMatch | null> {
  if (!email && !phone) return null;

  const filters: string[] = [];
  if (email) filters.push(`email.eq.${email}`);
  if (phone) filters.push(`phone.eq.${phone}`);

  const { data } = await supabase
    .from("customers")
    .select("id, company_name, contact_name")
    .eq("tenant_id", tenantId)
    .or(filters.join(","))
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, label: data.company_name || data.contact_name };
}
