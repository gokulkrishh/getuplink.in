import { describeRunError } from "@/lib/run-error";
import { type CarSetup, renewalSent } from "@/lib/setup-status";
import { componentLabel, isStatus, STATUS_WORD } from "@/lib/status";
import { EXPIRY_WARN_DAYS, STALE_AFTER_MS } from "@/lib/stream-health";

// What the header's bell lists, each with where to see or fix it. Built from what Uplink already stored
// (lib/server/alerts.ts reads it), never by asking Tesla, so every page can show it. Pure, so tested.
//
// Two kinds: "action" needs the owner (only these light the bell's dot and count in its label), "info" is
// good to know. `since`: when the problem began, only where that is known (an ISO time), else null.

export type AlertKind = "action" | "info";
// Which picture the bell shows beside an alert (components/alerts-menu.tsx maps each name to an icon).
export type AlertIcon = "key" | "hourglass" | "no-data" | "unplugged" | "warning" | "payment" | "service" | "server" | "new";
export type Alert = { key: string; kind: AlertKind; icon: AlertIcon; title: string; detail: string; href: string; since: string | null };

export type AlertCar = Pick<CarSetup, "vin" | "name" | "keyPaired" | "keyCheckedAt" | "streaming" | "streamingCheckedAt"> & {
  // When Uplink last sent the car its config (a renewal, when inside RENEW_WITHIN_DAYS of the expiry).
  configSentAt?: string | null;
  // When the car's streaming config runs out, as Tesla last said (null or missing: not known).
  configExpiresAt?: string | null;
  // The car's newest data, and the latest time Uplink's check found it awake (null or missing: never, or not known).
  lastReadingAt?: string | null;
  seenAwakeAt?: string | null;
  // What Tesla flagged at the car's latest online check (lib/car-notices.ts).
  unpaidSupercharging?: boolean;
  inService?: boolean;
};

export type AlertInputs = {
  now: number;
  connected: boolean;
  // Each car's name and what Tesla last said, with when, about Uplink's key on it and its streaming.
  cars: AlertCar[];
  // The owner's latest check, with a token error already cleared when they signed in since.
  lastRun: { ok: boolean | null; error: string | null } | null;
  // The admin's view of Uplink itself: each part's latest health check. Empty for everyone else.
  health: HealthNow[];
};

// A part's latest health check, and the statuses of the few checks before it, newest first.
export type HealthNow = { component: string; status: string; problems: string[]; checkedAt: string; recent?: string[] };

const RECENT_CHECKS = 3;

// Newest-first health rows to each part's latest check, with the statuses of up to three checks before it.
export function latestPerComponent(rows: { component: string; status: string; problems: string[] | null; checked_at: string }[]): HealthNow[] {
  const latest = new Map<string, HealthNow & { recent: string[] }>();
  for (const r of rows) {
    const seen = latest.get(r.component);
    if (!seen) latest.set(r.component, { component: r.component, status: r.status, problems: r.problems ?? [], checkedAt: r.checked_at, recent: [] });
    else if (seen.recent.length < RECENT_CHECKS) seen.recent.push(r.status);
  }
  return [...latest.values()];
}

// A lone "having problems" after good checks is often a blip, so the bell waits for the next check. Down,
// or problems that keep coming back, show at once.
const loneBlip = (h: HealthNow) => h.status === "degraded" && (h.recent?.length ?? 0) > 0 && h.recent!.every((s) => s === "operational");

type Car = AlertCar;
const DAY_MS = 86_400_000;
const after = (at: string | null, checkedAt: string) => at !== null && Date.parse(at) > Date.parse(checkedAt);
const nameOf = (car: Car) => car.name ?? "your car";
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

// The blue dot and the bell's label count only what needs the owner.
export const needsYou = (alerts: Alert[]) => alerts.filter((a) => a.kind === "action").length;

// Whole days until the car's streaming config runs out (negative once it has). Null when not known.
export function expiryDays(car: Car, now: number): number | null {
  const at = car.configExpiresAt ? Date.parse(car.configExpiresAt) : NaN;
  return Number.isNaN(at) ? null : Math.floor((at - now) / DAY_MS);
}

// Only a car that has the key and a config from Uplink: without the key, its own alert says so.
function expiring(car: Car, now: number): number | null {
  if (car.keyPaired !== true || (car.streaming !== "synced" && car.streaming !== "pending")) return null;
  const d = expiryDays(car, now);
  return d !== null && d < EXPIRY_WARN_DAYS ? d : null;
}

// Whole days a car with the key has sent nothing, when that is over a day and Uplink's check saw it awake
// well after its last data: a car parked asleep sends nothing either, and that isn't a problem. Null
// otherwise, and for a car that never sent anything.
export function quietDays(car: Car, now: number): number | null {
  if (car.keyPaired !== true || !car.lastReadingAt || !car.seenAwakeAt) return null;
  const last = Date.parse(car.lastReadingAt);
  const awake = Date.parse(car.seenAwakeAt);
  if (Number.isNaN(last) || Number.isNaN(awake) || now - last <= DAY_MS || awake <= last + STALE_AFTER_MS) return null;
  return Math.floor((now - last) / DAY_MS);
}

// Uplink renews a config RENEW_WITHIN_DAYS before it runs out (lib/setup-status.ts shouldSendConfig), long
// before this warns, so a warning means the renewal hasn't taken. What helps depends on whether one went:
// sent for this config (inside its renewal window) and not taken, the car has to wake to take it; never
// sent, something stops Uplink sending, and /setup shows what (the key, or signing in again).
function expiryDetail(car: Car): string {
  if (renewalSent(car.configSentAt ?? null, car.configExpiresAt ?? null)) return "Uplink sent a renewal the car hasn't taken yet. Wake it in the Tesla app.";
  return "Uplink couldn't renew it on its own. Open setup to see what's needed.";
}

function expiryTitle(car: Car, d: number): string {
  if (d < 0) return `Uplink's access to ${nameOf(car)} has run out`;
  if (d === 0) return `Uplink's access to ${nameOf(car)} runs out within a day`;
  return `Uplink's access to ${nameOf(car)} runs out in ${days(d)}`;
}

// The health check no longer reports a car's own key, config or expiry (lib/stream-health.ts streamPart):
// those are the car's rows below. These two lists cover a health row recorded before that change, until the
// next check replaces it, and can go once no such row is the latest.
//
// Health check problems that /setup (or its Check again) answers too. The health check runs every half
// hour on Tesla's answer from up to an hour before, so when every car has a good answer from after the
// check, the problem is over and isn't shown.
const SETTLED_BY_SETUP: { match: RegExp; settled: (car: Car, checkedAt: string) => boolean }[] = [
  { match: /key isn't paired/, settled: (c, at) => c.keyPaired === true && after(c.keyCheckedAt, at) },
  { match: /No streaming config/, settled: (c, at) => (c.streaming === "synced" || c.streaming === "pending") && after(c.streamingCheckedAt, at) },
  { match: /isn't synced/, settled: (c, at) => c.streaming === "synced" && after(c.streamingCheckedAt, at) },
];

function stillOpen(problem: string, cars: Car[], checkedAt: string): boolean {
  const rule = SETTLED_BY_SETUP.find((r) => r.match.test(problem));
  return !rule || cars.length === 0 || !cars.every((car) => rule.settled(car, checkedAt));
}

// Health check problems a car's own row already says, by that row's key prefix: the admin sees it once.
const SAID_BY_CAR: { match: RegExp; row: string }[] = [
  { match: /key isn't paired|No streaming config/, row: "key:" },
  { match: /config has expired|config expires/, row: "expiry:" },
];

// What to do about a health check's problem (lib/server/stream-health.ts), and where. A problem the owner
// can act on gets its fix; the rest point to Health on the admin page.
const FIXES: { match: RegExp; fix: string; href: string }[] = [
  {
    match: /No streaming config|key isn't paired/,
    fix: "Add Uplink's key to the car again, then open the setup page.",
    href: "/setup",
  },
  // Opening /setup reads the car's config, and Uplink renews one that runs out soon (shouldSendConfig).
  { match: /config has expired|config expires/, fix: "Open the setup page so Uplink can renew it.", href: "/setup" },
  { match: /isn't synced/, fix: "Wake the car in the Tesla app so it picks up the setting.", href: "/setup" },
  { match: /disconnected/, fix: "Sign in with Tesla again.", href: "/settings" },
];

export function buildAlerts(input: AlertInputs): Alert[] {
  const alerts: Alert[] = [];
  const add = (a: Omit<Alert, "since"> & { since?: string | null }) => alerts.push({ ...a, since: a.since ?? null });
  if (!input.connected) {
    add({ key: "disconnected", icon: "unplugged", kind: "action", title: "Tesla isn't connected", detail: "Uplink can't read your car. Sign in with Tesla again.", href: "/settings" });
  }
  for (const car of input.cars) {
    if (car.keyPaired === false) {
      add({ key: `key:${car.vin}`, icon: "key", kind: "action", title: `Uplink's key isn't on ${nameOf(car)}`, detail: "The car stopped sending data. Add the key again.", href: "/setup" });
    }
    // Asked, and Tesla's answer didn't say. Uplink asks again on its own.
    if (car.keyPaired === null && car.keyCheckedAt !== null) {
      add({ key: `unknown:${car.vin}`, icon: "warning", kind: "info", title: `Couldn't check the key on ${nameOf(car)}`, detail: "Uplink will try again.", href: "/setup" });
    }
    const left = expiring(car, input.now);
    if (left !== null) add({ key: `expiry:${car.vin}`, icon: "hourglass", kind: "action", title: expiryTitle(car, left), detail: expiryDetail(car), href: "/setup" });
    const quiet = quietDays(car, input.now);
    if (quiet !== null) {
      add({
        key: `quiet:${car.vin}`,
        icon: "no-data",
        kind: "action",
        title: `No data from ${nameOf(car)} for ${days(quiet)}`,
        detail: "The car was awake but sent nothing. Open setup to check its key.",
        href: "/setup",
        since: car.lastReadingAt,
      });
    }
    if (car.unpaidSupercharging) {
      add({ key: `payment:${car.vin}`, icon: "payment", kind: "action", title: `${car.name ?? "Your car"} has an unpaid Supercharger balance`, detail: "Pay it in the Tesla app.", href: "/" });
    }
    if (car.inService) {
      add({ key: `service:${car.vin}`, icon: "service", kind: "info", title: `${car.name ?? "Your car"} is at a Tesla service centre`, detail: "Seen at the car's latest check.", href: "/car" });
    }
  }
  // A failed check matters only while Tesla is connected: disconnected already says why.
  if (input.connected && input.lastRun?.ok === false && input.lastRun.error) {
    add({ key: "check", icon: "warning", kind: "action", title: "The last check failed", detail: describeRunError(input.lastRun.error), href: "/settings" });
  }
  const said = (problem: string) => SAID_BY_CAR.some((s) => s.match.test(problem) && alerts.some((a) => a.key.startsWith(s.row)));
  for (const h of input.health) {
    if (!isStatus(h.status) || h.status === "operational") continue;
    if (loneBlip(h)) continue;
    const problems = h.problems.filter((p) => stillOpen(p, input.cars, h.checkedAt) && !said(p));
    // Every problem it found is over, or a car's own row says it.
    if (h.problems.length > 0 && problems.length === 0) continue;
    const fix = FIXES.find((f) => problems.some((p) => f.match.test(p)));
    const found = problems.length ? `${problems.join(". ")}.` : "";
    add({
      key: `health:${h.component}`,
      icon: "server",
      kind: "action",
      title: `${componentLabel(h.component)}: ${STATUS_WORD[h.status].toLowerCase()}`,
      detail: [found, fix?.fix ?? "See Health on the admin page."].filter(Boolean).join(" "),
      href: fix?.href ?? "/admin",
    });
  }
  // What needs the owner first; the sort is stable, so each kind keeps the order above.
  return alerts.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "action" ? -1 : 1));
}
