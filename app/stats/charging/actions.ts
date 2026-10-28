"use server";

import { redirect } from "next/navigation";
import type { ChargeRow } from "@/components/stats/session-rows";
import { type ListScope, scopeTimeframe } from "@/lib/list";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { chargeRows, listCharges, loadChargingLists, startedIn } from "@/lib/server/charging-lists";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

// "Show N more" under a period's charges: the rows after the first `offset`, as the page draws
// them. Server actions are reachable by POST from anywhere, so these re-check the session and the scope.
async function listsFor(scope: ListScope, offset: number) {
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const now = Date.now();
  const frame = scopeTimeframe(scope, now);
  if (!frame || !Number.isInteger(offset) || offset < 0) return null;
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const lists = await loadChargingLists(owner, vin, now);
  return { frame, lists, ...listCharges(lists, now) };
}

export async function moreCharges(scope: ListScope, offset: number): Promise<ChargeRow[]> {
  const found = await listsFor(scope, offset);
  return found ? chargeRows(found.listed.filter(startedIn(found.frame.span))).rows.slice(offset) : [];
}
