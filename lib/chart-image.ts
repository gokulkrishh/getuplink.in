// A downloaded chart's file name: "uplink-time-at-each-speed-2026-11-01.png". Only a-z, 0-9 and hyphens, so
// every phone and computer saves it as named. The date is the day it was saved, India time.
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function chartFileName(title: string | undefined, now: Date): string {
  const name = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `uplink-${name || "chart"}-${day.format(now)}.png`;
}
