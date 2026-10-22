import "server-only";
import type { UpdateRow } from "@/lib/telemetry-derive";
import { DEMO } from "@/lib/demo";
import { demoUpdateRows } from "./demo";
import { db } from "./supabase";

// Real software updates of the connected car (not the version already installed when tracking began),
// oldest first. `vehicleId` is the car's id (see loadPrimaryVehicle). Empty when they can't be read.
export async function loadUpdateRows(vehicleId: string | null): Promise<UpdateRow[]> {
  if (DEMO) return demoUpdateRows();
  if (!vehicleId) return [];
  const { data, error } = await db()
    .from("version_history")
    .select("detected_at, available_at")
    .eq("vehicle_id", vehicleId)
    .not("previous_version", "is", null)
    .order("detected_at", { ascending: true })
    .limit(500);
  if (error) {
    console.warn("Update history unavailable:", error.message);
    return [];
  }
  return (data ?? []) as UpdateRow[];
}
