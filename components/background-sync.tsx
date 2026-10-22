import { io } from "next/cache";
import { after } from "next/server";
import { hasCurrentSession } from "@/lib/server/auth";
import { syncChargingHistoryThrottled } from "@/lib/server/charging";
import { syncStreamSessionsForAllCars } from "@/lib/server/stream-charging";
import { syncStreamVersionsForAllCars } from "@/lib/server/stream-versions";

// Background work a page starts once its response is sent, so the next visit has the result. Each reads
// the clock, so it waits for a real request and stays out of the prerendered page. Render inside <Suspense>.

// Records version changes the car streamed once the response is sent, so the next visit has them.
export async function SyncStreamVersions() {
  await io();
  if (!(await hasCurrentSession())) return null;
  after(syncStreamVersionsForAllCars);
  return null;
}

// Rebuilds sessions from the car's readings, and pulls Supercharger history (at most every 30 minutes).
export async function SyncChargingSessions() {
  await io();
  after(() => Promise.all([syncStreamSessionsForAllCars(), syncChargingHistoryThrottled()]));
  return null;
}
