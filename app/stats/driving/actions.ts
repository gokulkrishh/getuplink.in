"use server";

import { tripRows } from "@/components/stats/drive-list";
import { placeRows } from "@/components/stats/driving-extras";
import type { PlaceRow } from "@/components/stats/place-rows";
import type { TripRow } from "@/components/stats/trip-rows";
import { type ListScope, scopeTimeframe } from "@/lib/list";
import { inSpan } from "@/lib/periods";
import { groupTrips } from "@/lib/trips";
import { requireReader } from "@/lib/server/auth";
import { shownTo } from "@/lib/server/data/owner";
import { loadDrivingExtrasFor } from "@/lib/server/driving-extra";
import { insightSpan, withGooglePlaces } from "@/lib/server/driving-places";
import { loadWindowStats } from "@/lib/server/driving";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { loadTripPlaces } from "@/lib/server/trip-places";

// "Show N more" under a period's trips: the rows after the first `offset`, drawn as the page draws them.
// Server actions are reachable by POST from anywhere, so this re-checks the session and the scope.
export async function moreTrips(scope: ListScope, offset: number): Promise<TripRow[]> {
  const { owner } = await requireReader();
  const now = Date.now();
  const frame = scopeTimeframe(scope, now);
  if (!frame || !Number.isInteger(offset) || offset < 0) return [];
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const { driving } = await loadWindowStats(owner, vin, now);
  const trips = groupTrips(driving.drives.filter((d) => inSpan(d.start, frame.span)));
  const { routes } = await loadTripPlaces(owner, vin, driving.drives);
  return tripRows(trips, now, routes, shownTo(owner)).slice(offset);
}

// "Show N more" under a period's places: the same, for the table after its first rows.
export async function morePlaces(scope: ListScope, offset: number): Promise<PlaceRow[]> {
  const { owner } = await requireReader();
  const now = Date.now();
  const frame = scopeTimeframe(scope, now);
  if (!frame || !Number.isInteger(offset) || offset < 0) return [];
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const { driving } = await loadWindowStats(owner, vin, now);
  const [extras] = await loadDrivingExtrasFor(owner, vin, driving.drives, [insightSpan(frame, now)]).then(withGooglePlaces(owner));
  return placeRows(extras.places, !owner.viewOnly).slice(offset);
}
