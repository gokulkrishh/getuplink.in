"use server";

import type { ChargeRow } from "@/components/stats/session-rows";
import { type ListScope, scopeTimeframe } from "@/lib/list";
import { requireReader } from "@/lib/server/auth";
import { shownTo } from "@/lib/server/data/owner";
import { chargeRows, listCharges, loadChargingLists, startedIn } from "@/lib/server/charging-lists";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

// "Show N more" under a period's charges: the rows after the first `offset`, as the page draws
// them. Server actions are reachable by POST from anywhere, so these re-check the session and the scope.
async function listsFor(scope: ListScope, offset: number) {
  const { owner } = await requireReader();
  const now = Date.now();
  const frame = scopeTimeframe(scope, now);
  if (!frame || !Number.isInteger(offset) || offset < 0) return null;
  const vin = (await loadPrimaryVehicle(owner))?.vin ?? null;
  const lists = await loadChargingLists(owner, vin, now);
  return { frame, lists, shown: shownTo(owner), ...listCharges(lists, now) };
}

export async function moreCharges(scope: ListScope, offset: number): Promise<ChargeRow[]> {
  const found = await listsFor(scope, offset);
  return found ? chargeRows(found.listed.filter(startedIn(found.frame.span)), found.shown).rows.slice(offset) : [];
}
