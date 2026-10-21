import "server-only";
import type { UpdateRow } from "@/lib/telemetry-derive";
import { db } from "./supabase";
import { loadPrimaryVin } from "./telemetry";

// Real software updates of the connected car (not the version already installed when tracking began),
// oldest first. Empty when they can't be read.
export async function loadUpdateRows(): Promise<UpdateRow[]> {
  const vin = await loadPrimaryVin();
  if (!vin) return [];
  const { data: vehicle } = await db().from("vehicles").select("id").eq("vin", vin).maybeSingle();
  if (!vehicle) return [];
  const { data, error } = await db()
    .from("version_history")
    .select("detected_at, available_at")
    .eq("vehicle_id", vehicle.id)
    .not("previous_version", "is", null)
    .order("detected_at", { ascending: true })
    .limit(500);
  if (error) {
    console.warn("Update history unavailable:", error.message);
    return [];
  }
  return (data ?? []) as UpdateRow[];
}
