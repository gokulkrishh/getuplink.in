import { io } from "next/cache";
import { after } from "next/server";
import { currentOwner } from "@/lib/server/auth";
import { syncChargingHistoryThrottled } from "@/lib/server/charging";
import { syncStreamSessionsForAllCars } from "@/lib/server/stream-charging";
import { syncStreamVersionsForAllCars } from "@/lib/server/stream-versions";

// Background work a page starts once its response is sent, so the next visit has the result. Each reads
// the clock, so it waits for a real request and stays out of the prerendered page. Render inside <Suspense>.
// Each works on the signed-in account's cars only, so each needs a current session.

// Records version changes the car streamed once the response is sent, so the next visit has them.
export async function SyncStreamVersions() {
  await io();
  const owner = await currentOwner();
  if (!owner) return null;
  after(() => syncStreamVersionsForAllCars(owner));
  return null;
}

// Rebuilds sessions from the car's readings. Database only, and incremental from the last open session.
export async function SyncStreamSessions() {
  await io();
  const owner = await currentOwner();
  if (!owner) return null;
  after(() => syncStreamSessionsForAllCars(owner));
  return null;
}

// The same, and pulls Supercharger history (at most every 30 minutes). That is a billed Fleet API call,
// so only the Charging page makes it; the poll does too.
export async function SyncChargingSessions() {
  await io();
  const owner = await currentOwner();
  if (!owner) return null;
  after(() => Promise.all([syncStreamSessionsForAllCars(owner), syncChargingHistoryThrottled(owner)]));
  return null;
}
