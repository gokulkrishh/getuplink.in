"use server";

import type { ArrivingRow, VersionRow } from "@/components/rollout-lists";
import { versionRows } from "@/components/updates/history";
import type { HistoryRow } from "@/components/updates/history-rows";
import { arrivingRows, versionRows as rolloutVersionRows } from "@/lib/rollout-rows";
import { requireReader } from "@/lib/server/auth";
import { loadHistory, loadOwnerCars, loadReleaseNotes, withTimelines } from "@/lib/server/dashboard";
import { loadRollout } from "@/lib/server/rollout";

// "Show N more" under a car's version history: the rows after the first `offset`, with their timings and
// release notes. Server actions are reachable by POST from anywhere, so this re-checks the session and that
// the car is the owner's.
export async function moreVersions(vehicleId: string, offset: number): Promise<HistoryRow[]> {
  const { owner } = await requireReader();
  if (typeof vehicleId !== "string" || !Number.isInteger(offset) || offset < 0) return [];
  const account = await loadOwnerCars(owner);
  const vehicle = account.kind === "ready" ? account.vehicles.find((v) => v.id === vehicleId) : undefined;
  if (!vehicle) return [];
  const rest = (await loadHistory(owner, vehicle)).slice(offset);
  const [history, notes] = await Promise.all([vehicle.vin ? withTimelines(owner, vehicle.vin, rest) : rest, loadReleaseNotes(rest.map((h) => h.version))]);
  return versionRows(history, notes, Date.now());
}

// "Show N more" under the India rollout's lists: the rows after the first `offset`, drawn as the page draws
// them. These re-check the session and the offset too.
async function rolloutAfter(offset: number) {
  const { owner } = await requireReader();
  if (!Number.isInteger(offset) || offset < 0) return null;
  const data = await loadRollout(owner, Date.now());
  return data.kind === "ready" ? data : null;
}

export async function moreArriving(offset: number): Promise<ArrivingRow[]> {
  const data = await rolloutAfter(offset);
  return data ? arrivingRows(data.arriving, data.releaseNotes).slice(offset) : [];
}

export async function moreRolloutVersions(offset: number): Promise<VersionRow[]> {
  const data = await rolloutAfter(offset);
  return data ? rolloutVersionRows(data.rollout.versions, data.rollout.counted, data.releaseNotes).slice(offset) : [];
}
