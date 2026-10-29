import { describeRunError } from "@/lib/run-error";
import { componentLabel, isStatus, STATUS_WORD } from "@/lib/status";

// What the header's bell lists: problems the owner should know about now, each with where to fix it. Built
// from what Uplink already stored (lib/server/alerts.ts reads it), never by asking Tesla, so every page
// can show it. Pure, so tested.

export type Alert = { key: string; title: string; detail: string; href: string };

export type AlertInputs = {
  connected: boolean;
  // Each car's name and whether Tesla last said Uplink's key is on it (null: not known).
  cars: { vin: string; name: string | null; keyPaired: boolean | null }[];
  // The owner's latest check, with a token error already cleared when they signed in since.
  lastRun: { ok: boolean | null; error: string | null } | null;
  // The admin's view of Uplink itself: each part's latest health check. Empty for everyone else.
  health: { component: string; status: string; problems: string[] }[];
};

// What to do about a health check's problem (lib/server/stream-health.ts), and where. A problem the owner
// can act on gets its fix; the rest point to Health on the admin page.
const FIXES: { match: RegExp; fix: string; href: string }[] = [
  {
    match: /No streaming config|key isn't paired|config has expired|config expires/,
    fix: "Add Uplink's key on the car again, then open Setup to send the streaming setting.",
    href: "/setup",
  },
  { match: /isn't synced/, fix: "Wake the car in the Tesla app so it picks up the setting.", href: "/setup" },
  { match: /disconnected/, fix: "Sign in with Tesla again.", href: "/settings" },
  { match: /No streamed data|stream error/, fix: "Open Setup and choose Check again.", href: "/setup" },
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
    const fix = FIXES.find((f) => h.problems.some((p) => f.match.test(p)));
    const found = h.problems.length ? `${h.problems.join(". ")}.` : "";
    alerts.push({
      key: `health:${h.component}`,
      title: `${componentLabel(h.component)}: ${STATUS_WORD[h.status].toLowerCase()}`,
      detail: [found, fix?.fix ?? "See Health on the admin page."].filter(Boolean).join(" "),
      href: fix?.href ?? "/admin",
    });
  }
  return alerts;
}
