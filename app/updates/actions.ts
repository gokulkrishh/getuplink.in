"use server";

import { redirect } from "next/navigation";
import { versionRows } from "@/components/updates/history";
import type { HistoryRow } from "@/components/updates/history-rows";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadHistory, loadOwnerCars, loadReleaseNotes, withTimelines } from "@/lib/server/dashboard";

// "Show N more" under a car's version history: the rows after the first `offset`, with their timings and
// release notes. Server actions are reachable by POST from anywhere, so this re-checks the session and that
// the car is the owner's.
export async function moreVersions(vehicleId: string, offset: number): Promise<HistoryRow[]> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  if (typeof vehicleId !== "string" || !Number.isInteger(offset) || offset < 0) return [];
  const account = await loadOwnerCars(owner);
  const vehicle = account.kind === "ready" ? account.vehicles.find((v) => v.id === vehicleId) : undefined;
  if (!vehicle) return [];
  const rest = (await loadHistory(owner, vehicle)).slice(offset);
  const [history, notes] = await Promise.all([vehicle.vin ? withTimelines(owner, vehicle.vin, rest) : rest, loadReleaseNotes(rest.map((h) => h.version))]);
  return versionRows(history, notes, Date.now());
}
