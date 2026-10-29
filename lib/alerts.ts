import { describeRunError } from "@/lib/run-error";
import type { CarSetup } from "@/lib/setup-status";
import { componentLabel, isStatus, STATUS_WORD } from "@/lib/status";

// What the header's bell lists: problems the owner should know about now, each with where to fix it. Built
// from what Uplink already stored (lib/server/alerts.ts reads it), never by asking Tesla, so every page
// can show it. Pure, so tested.

export type Alert = { key: string; title: string; detail: string; href: string };

export type AlertInputs = {
  connected: boolean;
  // Each car's name and what Tesla last said, with when, about Uplink's key on it and its streaming (null: not known).
  cars: Pick<CarSetup, "vin" | "name" | "keyPaired" | "keyCheckedAt" | "streaming" | "streamingCheckedAt">[];
  // The owner's latest check, with a token error already cleared when they signed in since.
  lastRun: { ok: boolean | null; error: string | null } | null;
  // The admin's view of Uplink itself: each part's latest health check. Empty for everyone else.
  health: { component: string; status: string; problems: string[]; checkedAt: string }[];
};

type Car = AlertInputs["cars"][number];
const after = (at: string | null, checkedAt: string) => at !== null && Date.parse(at) > Date.parse(checkedAt);

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

// What to do about a health check's problem (lib/server/stream-health.ts), and where. A problem the owner
// can act on gets its fix; the rest point to Health on the admin page.
const FIXES: { match: RegExp; fix: string; href: string }[] = [
  {
    match: /No streaming config|key isn't paired|config has expired|config expires/,
    fix: "Add Uplink's key to the car again, then open the setup page.",
    href: "/setup",
  },
  { match: /isn't synced/, fix: "Wake the car in the Tesla app so it picks up the setting.", href: "/setup" },
  { match: /disconnected/, fix: "Sign in with Tesla again.", href: "/settings" },
  { match: /No streamed data|stream error/, fix: "Open the setup page and choose Check again.", href: "/setup" },
];

export function buildAlerts(input: AlertInputs): Alert[] {
  const alerts: Alert[] = [];
  if (!input.connected) {
    alerts.push({ key: "disconnected", title: "Tesla isn't connected", detail: "Uplink can't read your car. Sign in with Tesla again.", href: "/settings" });
  }
  for (const car of input.cars) {
    if (car.keyPaired !== false) continue;
    alerts.push({
      key: `key:${car.vin}`,
      title: `Uplink's key isn't on ${car.name ?? "your car"}`,
      detail: "The car stopped sending data. Add the key again.",
      href: "/setup",
    });
  }
  // A failed check matters only while Tesla is connected: disconnected already says why.
  if (input.connected && input.lastRun?.ok === false && input.lastRun.error) {
    alerts.push({ key: "check", title: "The last check failed", detail: describeRunError(input.lastRun.error), href: "/settings" });
  }
  for (const h of input.health) {
    if (!isStatus(h.status) || h.status === "operational") continue;
    const problems = h.problems.filter((p) => stillOpen(p, input.cars, h.checkedAt));
    // Every problem it found is over.
    if (h.problems.length > 0 && problems.length === 0) continue;
    const fix = FIXES.find((f) => problems.some((p) => f.match.test(p)));
    const found = problems.length ? `${problems.join(". ")}.` : "";
    alerts.push({
      key: `health:${h.component}`,
      title: `${componentLabel(h.component)}: ${STATUS_WORD[h.status].toLowerCase()}`,
      detail: [found, fix?.fix ?? "See Health on the admin page."].filter(Boolean).join(" "),
      href: fix?.href ?? "/admin",
    });
  }
  return alerts;
}
