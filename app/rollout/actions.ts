"use server";

import { redirect } from "next/navigation";
import type { ArrivingRow, VersionRow } from "@/components/rollout-lists";
import { arrivingRows, versionRows } from "@/lib/rollout-rows";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadRollout } from "@/lib/server/rollout";

// "Show N more" under the rollout's lists: the rows after the first `offset`, drawn as the page draws them.
// Server actions are reachable by POST from anywhere, so these re-check the session and the offset.
async function rolloutAfter(offset: number) {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
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
  return data ? versionRows(data.rollout.versions, data.rollout.counted, data.releaseNotes).slice(offset) : [];
}
