// What a drive's or a charge's address can hold: a drive by its start (yyyymmddhhmm, seconds optional), a
// charge by its number. The pages check it. For a real 404, proxy.ts turns any other away before the
// page starts streaming (once it streams, the status is already 200).
export const isDriveStart = (start: string) => /^\d{12,14}$/.test(start);
export const isChargeId = (id: string) => /^\d{1,15}$/.test(id);

// A /stats/driving/… or /stats/charging/… address that can't be a drive or a charge.
export function isMissingStatsDetail(pathname: string): boolean {
  const [, stats, topic, key, ...rest] = pathname.split("/");
  if (stats !== "stats" || key === undefined || key === "") return false;
  if (rest.length > 0) return topic === "driving" || topic === "charging";
  if (topic === "driving") return !isDriveStart(key);
  if (topic === "charging") return !isChargeId(key);
  return false;
}
