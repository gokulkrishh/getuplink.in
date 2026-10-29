import { describe, expect, test } from "bun:test";
import { type AlertInputs, buildAlerts, expiryDays, latestPerComponent, needsYou, quietDays } from "@/lib/alerts";

const CHECKED = "2026-10-29T02:00:00.000Z";
const BEFORE = "2026-10-29T01:00:00.000Z";
const AFTER = "2026-10-29T02:21:00.000Z";
const NOW = Date.parse("2026-10-29T06:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW + ms).toISOString();

const car = (over: Partial<AlertInputs["cars"][number]> = {}): AlertInputs["cars"][number] => ({
  vin: "VIN1",
  name: "Shadow",
  keyPaired: true,
  keyCheckedAt: BEFORE,
  streaming: "synced",
  streamingCheckedAt: BEFORE,
  ...over,
});

const ok: AlertInputs = {
  now: NOW,
  connected: true,
  cars: [car()],
  lastRun: { ok: true, error: null },
  health: [{ component: "Car data stream", status: "operational", problems: [], checkedAt: CHECKED }],
};

describe("buildAlerts", () => {
  test("nothing to show when all is well, and a key not yet asked about isn't a problem", () => {
    expect(buildAlerts(ok)).toEqual([]);
    expect(buildAlerts({ ...ok, cars: [car({ keyPaired: null, keyCheckedAt: null })] })).toEqual([]);
  });

  test("a key removed from the car names the car, needs the owner and points to /setup", () => {
    const [a] = buildAlerts({ ...ok, cars: [car({ keyPaired: false })] });
    expect(a).toEqual({ key: "key:VIN1", kind: "action", icon: "key", title: "Uplink's key isn't on Shadow", detail: "The car stopped sending data. Add the key again.", href: "/setup", since: null });
    expect(buildAlerts({ ...ok, cars: [car({ name: null, keyPaired: false })] })[0].title).toBe("Uplink's key isn't on your car");
  });

  test("a key Tesla was asked about but didn't answer for is good to know, not a problem", () => {
    const alerts = buildAlerts({ ...ok, cars: [car({ keyPaired: null })] });
    expect(alerts.map((a) => [a.kind, a.title, a.detail])).toEqual([["info", "Couldn't check the key on Shadow", "Uplink will try again."]]);
    expect(needsYou(alerts)).toBe(0);
  });

  test("a failed check says why in plain words, and not again when Tesla is disconnected", () => {
    const failed = { ...ok, lastRun: { ok: false, error: 'Token request failed (401): {"error":"login_required"}' } };
    expect(buildAlerts(failed).map((a) => [a.title, a.detail])).toEqual([["The last check failed", "Tesla access has expired. Sign out and sign in with Tesla again."]]);
    expect(buildAlerts({ ...failed, connected: false }).map((a) => a.key)).toEqual(["disconnected"]);
  });

  test("the admin sees a part of Uplink that isn't working, what the health check found and how to fix it", () => {
    const health = [
      { component: "Car data stream", status: "degraded", problems: ["No streaming config on the car"], checkedAt: CHECKED },
      { component: "Database", status: "operational", problems: [], checkedAt: CHECKED },
      { component: "Website", status: "down", problems: [], checkedAt: CHECKED },
    ];
    expect(buildAlerts({ ...ok, health }).map((a) => [a.kind, a.title, a.detail, a.href])).toEqual([
      ["action", "Live car data: having problems", "No streaming config on the car. Add Uplink's key to the car again, then open the setup page.", "/setup"],
      ["action", "Website: down", "See Health on the admin page.", "/admin"],
    ]);
  });

  // On 29 Oct one database blip at 3:16 PM put "Live car data: having problems" in the bell, and the next
  // check was fine. A lone problem after good checks waits for the next; anything worse shows at once.
  test("one failed health check after good ones waits for the next before it's in the bell", () => {
    const blip = { component: "Car data stream", status: "degraded", problems: ["Couldn't check the Tesla config: Reading the database timed out"], checkedAt: CHECKED };
    const keys = (recent: string[], status = "degraded") => buildAlerts({ ...ok, health: [{ ...blip, status, recent }] }).map((a) => a.key);
    expect(keys(["operational", "operational", "operational"])).toEqual([]);
    expect(keys(["degraded", "operational", "operational"])).toEqual(["health:Car data stream"]);
    // Failing every other check is a problem, not a blip.
    expect(keys(["operational", "degraded", "operational"])).toEqual(["health:Car data stream"]);
    // Down shows straight away.
    expect(keys(["operational", "operational", "operational"], "down")).toEqual(["health:Car data stream"]);
    // With no earlier checks known it shows, as before.
    expect(keys([])).toEqual(["health:Car data stream"]);
  });

  test("the latest health check per part carries the statuses of the few before it, newest first", () => {
    const row = (component: string, status: string, checked_at: string) => ({ component, status, problems: [], checked_at });
    const latest = latestPerComponent([
      row("Car data stream", "degraded", "2026-10-29T09:46:02Z"),
      row("Database", "operational", "2026-10-29T09:46:01Z"),
      row("Car data stream", "operational", "2026-10-29T09:15:38Z"),
      row("Car data stream", "degraded", "2026-10-29T08:45:38Z"),
      row("Car data stream", "operational", "2026-10-29T08:15:38Z"),
      row("Car data stream", "operational", "2026-10-29T07:45:38Z"),
      row("Website", "down", "2026-10-29T09:46:00Z"),
    ]);
    expect(latest.map((h) => [h.component, h.status, h.recent])).toEqual([
      ["Car data stream", "degraded", ["operational", "degraded", "operational"]],
      ["Database", "operational", []],
      ["Website", "down", []],
    ]);
  });

  // The health check runs every half hour on an answer up to an hour old; /setup and Check again ask Tesla
  // now. A newer good answer from them settles the check's problem; an older one, or a different problem, doesn't.
  test("a key or config problem from the health check goes once /setup has a newer good answer", () => {
    const stream = (problems: string[]) => [{ component: "Car data stream", status: "degraded", problems, checkedAt: CHECKED }];
    const keyGone = stream(["Uplink's key isn't paired with the car", "No streaming config on the car"]);
    expect(buildAlerts({ ...ok, cars: [car({ keyCheckedAt: AFTER, streaming: "pending", streamingCheckedAt: AFTER })], health: keyGone })).toEqual([]);
    expect(buildAlerts({ ...ok, cars: [car({ keyCheckedAt: AFTER })], health: keyGone }).map((a) => a.detail)).toEqual([
      "No streaming config on the car. Add Uplink's key to the car again, then open the setup page.",
    ]);
    expect(buildAlerts({ ...ok, health: keyGone })).toHaveLength(1);
    expect(buildAlerts({ ...ok, cars: [car({ streamingCheckedAt: AFTER })], health: stream(["Tesla says the streaming config isn't synced"]) })).toEqual([]);
    expect(buildAlerts({ ...ok, cars: [car({ keyCheckedAt: AFTER, streamingCheckedAt: AFTER })], health: stream(["No streamed data for 3 h while the car was online"]) })).toHaveLength(1);
  });

  test("Tesla's flags: an unpaid Supercharger balance needs the owner, a service visit is good to know", () => {
    const alerts = buildAlerts({ ...ok, cars: [car({ unpaidSupercharging: true, inService: true })] });
    expect(alerts.map((a) => [a.kind, a.title, a.detail, a.href])).toEqual([
      ["action", "Shadow has an unpaid Supercharger balance", "Pay it in the Tesla app.", "/"],
      ["info", "Shadow is at a Tesla service centre", "Seen at the car's latest check.", "/car"],
    ]);
    expect(needsYou(alerts)).toBe(1);
  });

  test("each alert carries the picture that fits it", () => {
    const alerts = buildAlerts({
      ...ok,
      connected: false,
      cars: [car({ keyPaired: false, unpaidSupercharging: true, inService: true }), car({ vin: "B", keyPaired: null, keyCheckedAt: BEFORE })],
      health: [{ component: "Website", status: "down", problems: [], checkedAt: CHECKED }],
    });
    expect(Object.fromEntries(alerts.map((a) => [a.key.split(":")[0], a.icon]))).toEqual({
      disconnected: "unplugged",
      key: "key",
      payment: "payment",
      health: "server",
      unknown: "warning",
      service: "service",
    });
  });

  test("what needs the owner comes first, then what's good to know, whatever order they were found in", () => {
    const alerts = buildAlerts({
      ...ok,
      cars: [car({ vin: "A", name: "Ace", inService: true }), car({ vin: "B", name: "Bolt", keyPaired: false })],
      lastRun: { ok: false, error: "Vehicle unavailable" },
    });
    expect(alerts.map((a) => a.kind)).toEqual(["action", "action", "info"]);
    expect(alerts.map((a) => a.key)).toEqual(["key:B", "check", "service:A"]);
    expect(needsYou(alerts)).toBe(2);
  });
});

describe("streaming access running out", () => {
  const expiring = (ms: number, over: Partial<AlertInputs["cars"][number]> = {}) => car({ configExpiresAt: at(ms), ...over });

  test("whole days left, null when not known", () => {
    expect(expiryDays(expiring(5 * DAY + HOUR), NOW)).toBe(5);
    expect(expiryDays(car(), NOW)).toBeNull();
    expect(expiryDays(car({ configExpiresAt: "not a date" }), NOW)).toBeNull();
  });

  test("warns within the window, each case its own sentence, and points to /setup", () => {
    const title = (ms: number) => buildAlerts({ ...ok, cars: [expiring(ms)] }).map((a) => [a.kind, a.title, a.href]);
    expect(title(5 * DAY + HOUR)).toEqual([["action", "Uplink's access to Shadow runs out in 5 days", "/setup"]]);
    expect(title(DAY + HOUR)).toEqual([["action", "Uplink's access to Shadow runs out in 1 day", "/setup"]]);
    expect(title(HOUR)).toEqual([["action", "Uplink's access to Shadow runs out within a day", "/setup"]]);
    expect(title(-HOUR)).toEqual([["action", "Uplink's access to Shadow has run out", "/setup"]]);
  });

  // Uplink renews on its own well before the warning window, so a warning means the renewal hasn't taken.
  test("says what helps: wake the car when Uplink sent a renewal it hasn't taken, open setup when none went", () => {
    const detail = (over: Partial<AlertInputs["cars"][number]>) => buildAlerts({ ...ok, cars: [expiring(5 * DAY + HOUR, over)] }).map((a) => a.detail);
    // Sent two days ago, inside the renewal window, and the expiry hasn't moved.
    expect(detail({ configSentAt: at(-2 * DAY) })).toEqual(["Uplink sent a renewal the car hasn't taken yet. Wake it in the Tesla app."]);
    // Never sent, or sent long before this config (that send made it).
    expect(detail({ configSentAt: null })).toEqual(["Uplink couldn't renew it on its own. Open setup to see what's needed."]);
    expect(detail({ configSentAt: at(-300 * DAY) })).toEqual(["Uplink couldn't renew it on its own. Open setup to see what's needed."]);
  });

  test("quiet outside the window, and for a car without the key or a config", () => {
    expect(buildAlerts({ ...ok, cars: [expiring(14 * DAY + HOUR)] })).toEqual([]);
    expect(buildAlerts({ ...ok, cars: [expiring(13 * DAY + HOUR)] })).toHaveLength(1);
    // The key alert says it already.
    expect(buildAlerts({ ...ok, cars: [expiring(5 * DAY, { keyPaired: false })] }).map((a) => a.key)).toEqual(["key:VIN1"]);
    expect(buildAlerts({ ...ok, cars: [expiring(5 * DAY, { streaming: "none" })] })).toEqual([]);
  });
});

describe("a car that went quiet", () => {
  // Last data three days ago; Uplink's check saw it awake well after that.
  const quiet = (over: Partial<AlertInputs["cars"][number]> = {}) => car({ lastReadingAt: at(-3 * DAY), seenAwakeAt: at(-2 * HOUR), ...over });

  test("no data for over a day while the car was awake: needs the owner, since its last data", () => {
    const [a] = buildAlerts({ ...ok, cars: [quiet()] });
    expect(a).toEqual({
      key: "quiet:VIN1",
      icon: "no-data",
      kind: "action",
      title: "No data from Shadow for 3 days",
      detail: "The car was awake but sent nothing. Open setup to check its key.",
      href: "/setup",
      since: at(-3 * DAY),
    });
    expect(buildAlerts({ ...ok, cars: [quiet({ lastReadingAt: at(-25 * HOUR) })] })[0].title).toBe("No data from Shadow for 1 day");
  });

  test("not within a day, not for a car that never sent anything, and not for one without the key", () => {
    expect(quietDays(quiet({ lastReadingAt: at(-23 * HOUR) }), NOW)).toBeNull();
    expect(quietDays(quiet({ lastReadingAt: null }), NOW)).toBeNull();
    expect(buildAlerts({ ...ok, cars: [quiet({ keyPaired: false })] }).map((a) => a.key)).toEqual(["key:VIN1"]);
    expect(quietDays(quiet({ keyPaired: null }), NOW)).toBeNull();
  });

  test("a parked car asleep since its last data isn't a problem", () => {
    expect(quietDays(quiet({ seenAwakeAt: null }), NOW)).toBeNull();
    expect(quietDays(quiet({ seenAwakeAt: at(-3 * DAY + HOUR) }), NOW)).toBeNull();
  });
});

describe("no row twice", () => {
  const stream = (problems: string[]) => [{ component: "Car data stream", status: "degraded", problems, checkedAt: CHECKED }];

  test("the health check's problem goes when a car's own row already says it", () => {
    const keyGone = buildAlerts({ ...ok, cars: [car({ keyPaired: false })], health: stream(["Uplink's key isn't paired with the car", "No streaming config on the car"]) });
    expect(keyGone.map((a) => a.key)).toEqual(["key:VIN1"]);
    const expiring = buildAlerts({ ...ok, cars: [car({ configExpiresAt: at(5 * DAY + HOUR) })], health: stream(["Streaming config expires in 5 days"]) });
    expect(expiring.map((a) => a.key)).toEqual(["expiry:VIN1"]);
    // No data fleet-wide is Uplink's own problem, not the car's: both stay.
    const quiet = buildAlerts({ ...ok, cars: [car({ lastReadingAt: at(-3 * DAY), seenAwakeAt: at(-2 * HOUR) })], health: stream(["No streamed data for 72 h while cars were awake"]) });
    expect(quiet.map((a) => [a.key, a.href])).toEqual([["quiet:VIN1", "/setup"], ["health:Car data stream", "/admin"]]);
  });

  test("a problem no car row covers stays", () => {
    const both = buildAlerts({ ...ok, cars: [car({ keyPaired: false })], health: stream(["Uplink's key isn't paired with the car", "Receiver not reachable"]) });
    expect(both.map((a) => [a.key, a.detail])).toEqual([
      ["key:VIN1", "The car stopped sending data. Add the key again."],
      ["health:Car data stream", "Receiver not reachable. See Health on the admin page."],
    ]);
  });
});
