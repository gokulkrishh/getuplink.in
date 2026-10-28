"use server";

import { redirect } from "next/navigation";
import { tripRows } from "@/components/stats/drive-list";
import type { TripRow } from "@/components/stats/trip-rows";
import { type ListScope, scopeTimeframe } from "@/lib/list";
import { inSpan } from "@/lib/periods";
import { groupTrips } from "@/lib/trips";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadWindowStats } from "@/lib/server/driving";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { loadTripPlaces } from "@/lib/server/trip-places";

// "Show N more" under a period's trips: the rows after the first `offset`, drawn as the page draws them.
// Server actions are reachable by POST from anywhere, so this re-checks the session and the scope.
export async function moreTrips(scope: ListScope, offset: number): Promise<TripRow[]> {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const now = Date.now();
  const frame = scopeTimeframe(scope, now);
  if (!frame || !Number.isInteger(offset) || offset < 0) return [];
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const { driving } = await loadWindowStats(owner, vin, now);
  const trips = groupTrips(driving.drives.filter((d) => inSpan(d.start, frame.span)));
  const routes = await loadTripPlaces(owner, vin, driving.drives);
  return tripRows(trips, now, routes).slice(offset);
}
