"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSupplier } from "@/lib/auth";

export async function updateSupplierDetailsAction(_prevState: { error: string | null }, formData: FormData) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { error } = await supabase
    .from("suppliers")
    .update({
      contact_name: String(formData.get("contactName") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      whatsapp: String(formData.get("whatsapp") ?? "").trim() || null,
      region: String(formData.get("region") ?? "").trim() || null,
      registration_number: String(formData.get("registrationNumber") ?? "").trim() || null,
      vat_number: String(formData.get("vatNumber") ?? "").trim() || null,
      insurance_details: String(formData.get("insuranceDetails") ?? "").trim() || null,
      license_number: String(formData.get("licenseNumber") ?? "").trim() || null,
    })
    .eq("id", supplier.id);

  if (error) return { error: error.message };

  revalidatePath("/supplier/settings", "layout");
  return { error: null };
}

export async function addVehicleAction(_prevState: { error: string | null }, formData: FormData) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const vehicleType = String(formData.get("vehicleType") ?? "").trim();
  if (!vehicleType) return { error: "Vehicle type is required." };

  const seatCapacity = Number(formData.get("seatCapacity") ?? 0) || null;
  const plateNumber = String(formData.get("plateNumber") ?? "").trim() || null;

  const { error } = await supabase.from("supplier_vehicles").insert({
    supplier_id: supplier.id,
    vehicle_type: vehicleType,
    seat_capacity: seatCapacity,
    plate_number: plateNumber,
  });

  if (error) return { error: error.message };

  revalidatePath("/supplier/settings", "layout");
  return { error: null };
}

export async function removeVehicleAction(vehicleId: string) {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  await supabase.from("supplier_vehicles").delete().eq("id", vehicleId).eq("supplier_id", supplier.id);
  revalidatePath("/supplier/settings", "layout");
}

export async function submitVerificationAction() {
  const supplier = await requireSupplier();
  const supabase = await createClient();

  const { error } = await supabase.from("suppliers").update({ status: "submitted" }).eq("id", supplier.id);
  if (error) throw new Error(error.message);

  revalidatePath("/supplier/settings", "layout");
}
