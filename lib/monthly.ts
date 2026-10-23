import type { Drive } from "@/lib/drives";
import { monthIndex, monthStart } from "@/lib/periods";

// A month-by-month table after TeslaMate's statistics: driving from the drives, charging from the
// sessions, spend from real bills only. Pure, so tested directly.

export type MonthRow = {
  month: number; // monthIndex
  km: number;
  drivingMs: number;
  kwhUsed: number | null; // null when no drive in the month has an energy figure
  charges: number;
  kwhAdded: number;
  spend: number;
  unbilled: number; // charges with no bill: home charging, or no invoice attached
};

type Charge = { started_at: string; kwh: number | null; cost: number | null };

// Months from the earliest one with a drive or a charge to now, newest first, never before `from`.
export function monthlyRows(drives: Drive[], charges: Charge[], from: number, now: number): MonthRow[] {
  const first = Math.max(
    monthIndex(from),
    Math.min(monthIndex(now), ...drives.map((d) => monthIndex(d.start)), ...charges.map((c) => monthIndex(c.started_at))),
  );
  const rows: MonthRow[] = [];
  for (let m = monthIndex(now); m >= first; m--) {
    const inMonth = (t: number) => t >= monthStart(m) && t < monthStart(m + 1);
    const ds = drives.filter((d) => inMonth(d.start));
    const cs = charges.filter((c) => inMonth(Date.parse(c.started_at)));
    const known = ds.filter((d) => d.kwh !== null);
    rows.push({
      month: m,
      km: ds.reduce((sum, d) => sum + d.km, 0),
      drivingMs: ds.reduce((sum, d) => sum + (d.end - d.start), 0),
      kwhUsed: known.length ? known.reduce((sum, d) => sum + d.kwh!, 0) : null,
      charges: cs.length,
      kwhAdded: cs.reduce((sum, c) => sum + (c.kwh ?? 0), 0),
      spend: cs.reduce((sum, c) => sum + (c.cost ?? 0), 0),
      unbilled: cs.filter((c) => c.cost === null).length,
    });
  }
  return rows;
}
