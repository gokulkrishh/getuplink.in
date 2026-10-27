// Pure logic for the public status page (app/status), kept free of server-only imports so it can be
// tested on its own.

export type Status = "operational" | "degraded" | "down";

export const STATUS_WORD: Record<Status, string> = {
  operational: "Working",
  degraded: "Having problems",
  down: "Down",
};

// What the status page calls each checked part. The stored names stay as they are, so past checks still match.
export const COMPONENT_LABEL: Record<string, string> = { "Car data stream": "Live car data" };
export function componentLabel(name: string): string {
  return COMPONENT_LABEL[name] ?? name;
}

const RANK: Record<Status, number> = { operational: 0, degraded: 1, down: 2 };

export function worstStatus(a: Status, b: Status): Status {
  return RANK[b] > RANK[a] ? b : a;
}

export function isStatus(value: unknown): value is Status {
  return value === "operational" || value === "degraded" || value === "down";
}

// One row of public.health_daily(): the worst status on an IST day, and checks that were up / total.
export type DailyRow = { day: string; status: Status; up: number; total: number };

export type DayBar = { day: string; status: Status | null };

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 19_800_000; // UTC+5:30, no daylight saving

// "2026-10-21": the IST calendar day of an instant.
export function istDay(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// The last `count` IST days ending today, oldest first, each with its worst status (null = no data).
export function dailyBars(rows: DailyRow[], now: number, count = 90): DayBar[] {
  const byDay = new Map(rows.map((r) => [r.day, r.status]));
  const bars: DayBar[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = istDay(now - i * DAY_MS);
    bars.push({ day, status: byDay.get(day) ?? null });
  }
  return bars;
}

// Share of checks that were up (operational or degraded) over the days shown; null with no checks.
// One decimal, and never rounded up to 100 while a check failed.
export function uptimePercent(rows: DailyRow[], days: Set<string>): number | null {
  let up = 0;
  let total = 0;
  for (const r of rows) {
    if (!days.has(r.day)) continue;
    up += r.up;
    total += r.total;
  }
  if (total === 0) return null;
  if (up === total) return 100;
  return Math.min(99.9, Math.floor((up / total) * 1000) / 10);
}

export const HEADLINES: Record<Status, string> = {
  operational: "Everything is working",
  degraded: "Some parts have problems",
  down: "Part of Uplink is down",
};

// The line at the top of the page. Null when nothing has been checked yet.
export function overallHeadline(current: (Status | null)[]): { status: Status; text: string } | null {
  const known = current.filter((s): s is Status => s !== null);
  if (known.length === 0) return null;
  const status = known.reduce(worstStatus);
  return { status, text: HEADLINES[status] };
}

// A run of failed checks on one part, close enough together to be one issue, with the worst status and what
// the checks found. Checks come every few minutes while anyone looks and at least every few hours from the
// cron, so failures under INCIDENT_GAP_MS apart are one issue.
export type Incident = { component: string; status: Status; from: string; to: string; problems: string[] };
export type FailedRow = { component: string; status: string; problems: string[] | null; checked_at: string };
const INCIDENT_GAP_MS = 3 * 3_600_000;

// Newest first.
export function incidents(rows: FailedRow[]): Incident[] {
  const open = new Map<string, Incident>();
  const out: Incident[] = [];
  for (const r of [...rows].sort((a, b) => Date.parse(a.checked_at) - Date.parse(b.checked_at))) {
    if (!isStatus(r.status) || r.status === "operational") continue;
    const last = open.get(r.component);
    if (last && Date.parse(r.checked_at) - Date.parse(last.to) <= INCIDENT_GAP_MS) {
      last.to = r.checked_at;
      last.status = worstStatus(last.status, r.status);
      for (const p of r.problems ?? []) if (!last.problems.includes(p)) last.problems.push(p);
    } else {
      const next = { component: r.component, status: r.status, from: r.checked_at, to: r.checked_at, problems: [...(r.problems ?? [])] };
      open.set(r.component, next);
      out.push(next);
    }
  }
  return out.reverse();
}
