import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cancels one job_allocation — frees its legs (so they can join a different
 * allocation) and withdraws any live offers. Does NOT delete the allocation
 * row itself (kept for cost/invoice history), so this is safe to call on an
 * allocation that already has invoices/payments recorded against it.
 * Shared by cancelAllocationAction (single allocation, staff-initiated) and
 * cancelBookingAction (force-cancels every live allocation on a booking).
 * Callers are responsible for their own recordAudit() call and permission
 * checks — this only does the DB mutations.
 */
export async function cancelAllocation(supabase: SupabaseClient<Database>, allocationId: string): Promise<void> {
  const { error: legsError } = await supabase.from("job_allocation_legs").delete().eq("job_allocation_id", allocationId);
  if (legsError) throw new Error(legsError.message);

  const { error: offersError } = await supabase
    .from("job_allocation_offers")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("job_allocation_id", allocationId)
    .eq("status", "sent");
  if (offersError) throw new Error(offersError.message);

  const { error: allocationError } = await supabase
    .from("job_allocations")
    .update({ status: "cancelled" })
    .eq("id", allocationId);
  if (allocationError) throw new Error(allocationError.message);
}
