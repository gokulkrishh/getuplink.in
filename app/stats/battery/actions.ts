"use server";

import { redirect } from "next/navigation";
import { stretches } from "@/components/stats/parked-drain";
import type { ParkedRow } from "@/components/stats/parked-rows";
import { type ListScope, scopeTimeframe } from "@/lib/list";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadWindowStats } from "@/lib/server/driving";
import { loadStretchPlaces } from "@/lib/server/parked-places";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

// "Show N more" under a period's parked stretches: the rows after the first `offset`, drawn as the page
// draws them. Server actions are reachable by POST from anywhere, so this re-checks the session and the scope.
export async function moreParked(scope: ListScope, offset: number): Promise<ParkedRow[]> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const now = Date.now();
  const frame = scopeTimeframe(scope, now);
  if (!frame || !Number.isInteger(offset) || offset < 0) return [];
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const { driving } = await loadWindowStats(owner, vin, now);
  const places = await loadStretchPlaces(owner, vin, driving);
  return stretches(driving.parked, driving.parkedNow, frame.span, places).texts.slice(offset);
}
