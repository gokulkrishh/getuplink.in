import { describe, expect, test } from "bun:test";
import { type AlertInputs, buildAlerts } from "@/lib/alerts";

const ok: AlertInputs = {
  connected: true,
  cars: [{ vin: "VIN1", name: "Shadow", keyPaired: true }],
  lastRun: { ok: true, error: null },
  health: [{ component: "Car data stream", status: "operational", problems: [] }],
};

describe("buildAlerts", () => {
  test("nothing to show when all is well, and a key not yet known isn't a problem", () => {
    expect(buildAlerts(ok)).toEqual([]);
    expect(buildAlerts({ ...ok, cars: [{ vin: "VIN1", name: "Shadow", keyPaired: null }] })).toEqual([]);
  });

  test("a key removed from the car names the car and points to /setup", () => {
    const [a] = buildAlerts({ ...ok, cars: [{ vin: "VIN1", name: "Shadow", keyPaired: false }] });
    expect(a).toEqual({ key: "key:VIN1", title: "Uplink's key isn't on Shadow", detail: "The car stopped sending data. Add the key again.", href: "/setup" });
    expect(buildAlerts({ ...ok, cars: [{ vin: "VIN1", name: null, keyPaired: false }] })[0].title).toBe("Uplink's key isn't on your car");
  });

  test("a failed check says why in plain words, and not again when Tesla is disconnected", () => {
    const failed = { ...ok, lastRun: { ok: false, error: 'Token request failed (401): {"error":"login_required"}' } };
    expect(buildAlerts(failed).map((a) => [a.title, a.detail])).toEqual([["The last check failed", "Tesla access has expired. Sign out and sign in with Tesla again."]]);
    expect(buildAlerts({ ...failed, connected: false }).map((a) => a.key)).toEqual(["disconnected"]);
  });

  test("the admin sees a part of Uplink that isn't working, what the health check found and how to fix it", () => {
    const health = [
      { component: "Car data stream", status: "degraded", problems: ["No streaming config on the car"] },
      { component: "Database", status: "operational", problems: [] },
      { component: "Website", status: "down", problems: [] },
    ];
    expect(buildAlerts({ ...ok, health }).map((a) => [a.title, a.detail, a.href])).toEqual([
      ["Live car data: having problems", "No streaming config on the car. Add Uplink's key on the car again, then open Setup to send the streaming setting.", "/setup"],
      ["Website: down", "See Health on the admin page.", "/admin"],
    ]);
  });
});
