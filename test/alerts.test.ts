import { describe, expect, test } from "bun:test";
import { type AlertInputs, buildAlerts } from "@/lib/alerts";

const CHECKED = "2026-10-29T02:00:00.000Z";
const BEFORE = "2026-10-29T01:00:00.000Z";
const AFTER = "2026-10-29T02:21:00.000Z";

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
  connected: true,
  cars: [car()],
  lastRun: { ok: true, error: null },
  health: [{ component: "Car data stream", status: "operational", problems: [], checkedAt: CHECKED }],
};

describe("buildAlerts", () => {
  test("nothing to show when all is well, and a key not yet known isn't a problem", () => {
    expect(buildAlerts(ok)).toEqual([]);
    expect(buildAlerts({ ...ok, cars: [car({ keyPaired: null })] })).toEqual([]);
  });

  test("a key removed from the car names the car and points to /setup", () => {
    const [a] = buildAlerts({ ...ok, cars: [car({ keyPaired: false })] });
    expect(a).toEqual({ key: "key:VIN1", title: "Uplink's key isn't on Shadow", detail: "The car stopped sending data. Add the key again.", href: "/setup" });
    expect(buildAlerts({ ...ok, cars: [car({ name: null, keyPaired: false })] })[0].title).toBe("Uplink's key isn't on your car");
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
    expect(buildAlerts({ ...ok, health }).map((a) => [a.title, a.detail, a.href])).toEqual([
      ["Live car data: having problems", "No streaming config on the car. Add Uplink's key to the car again, then open the setup page.", "/setup"],
      ["Website: down", "See Health on the admin page.", "/admin"],
    ]);
  });

  // The health check runs every half hour on an answer up to an hour old; /setup and Check again ask Tesla
  // now. A newer good answer from them settles the check's problem; an older one, or a different problem, doesn't.
  test("a key or config problem from the health check goes once /setup has a newer good answer", () => {
    const stream = (problems: string[]) => [{ component: "Car data stream", status: "degraded", problems, checkedAt: CHECKED }];
    const keyGone = stream(["Uplink's key isn't paired with the car", "No streaming config on the car"]);
    // The key is back and the car has its config again, both said after the check: nothing to show.
    expect(buildAlerts({ ...ok, cars: [car({ keyCheckedAt: AFTER, streaming: "pending", streamingCheckedAt: AFTER })], health: keyGone })).toEqual([]);
    // The key is back, but the only word on the config is older than the check: that problem stays.
    expect(buildAlerts({ ...ok, cars: [car({ keyCheckedAt: AFTER })], health: keyGone }).map((a) => a.detail)).toEqual([
      "No streaming config on the car. Add Uplink's key to the car again, then open the setup page.",
    ]);
    // Setup's answers are older than the check: the check stands.
    expect(buildAlerts({ ...ok, health: keyGone })).toHaveLength(1);
    // Synced, said after the check, settles "isn't synced"; a stalled stream isn't setup's to settle.
    expect(buildAlerts({ ...ok, cars: [car({ streamingCheckedAt: AFTER })], health: stream(["Tesla says the streaming config isn't synced"]) })).toEqual([]);
    expect(buildAlerts({ ...ok, cars: [car({ keyCheckedAt: AFTER, streamingCheckedAt: AFTER })], health: stream(["No streamed data for 3 h while the car was online"]) })).toHaveLength(1);
  });
});
