import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BatteryGauge } from "@/components/battery-gauge";
import { sentryOn } from "@/lib/car-now";
import type { Snapshot } from "@/lib/server/dashboard";

const at = "2026-10-28T10:00:00.000Z";

test("Sentry Mode is on only while it watches, and not after a check found the car asleep", () => {
  expect(sentryOn({ value: "SentryModeStateArmed", at }, null)).toBe(true);
  expect(sentryOn({ value: "SentryModeStateAware", at }, { state: "online", polled_at: "2026-10-28T11:00:00.000Z" })).toBe(true);
  expect(sentryOn({ value: "SentryModeStatePanic", at }, null)).toBe(true);
  expect(sentryOn({ value: "SentryModeStateQuiet", at }, null)).toBe(true);
  expect(sentryOn({ value: "SentryModeStateIdle", at }, null)).toBe(false);
  expect(sentryOn({ value: "SentryModeStateOff", at }, null)).toBe(false);
  expect(sentryOn(undefined, null)).toBe(false);
  expect(sentryOn({ value: "SentryModeStateArmed", at }, { state: "asleep", polled_at: "2026-10-28T11:00:00.000Z" })).toBe(false);
  expect(sentryOn({ value: "SentryModeStateArmed", at }, { state: "asleep", polled_at: "2026-10-28T09:00:00.000Z" })).toBe(true);
});

const NOW = Date.UTC(2026, 9, 28, 12, 0);
const parked = { start: NOW - 39 * 3_600_000, fromFirstReading: false };
const snapshot = { battery_level: 70, charge_limit: 70, charging_state: "Disconnected" } as Snapshot;

test("the red circle leads the parked line only while Sentry Mode is on", () => {
  const on = renderToStaticMarkup(<BatteryGauge snapshot={snapshot} parked={parked} now={NOW} sentry />);
  expect(on).toContain("Parked since yesterday, 2:30 AM");
  expect(on).toContain("Sentry Mode is on.");
  expect(on).toContain("fill-destructive");
  expect(on.indexOf("Sentry Mode is on.")).toBeLessThan(on.indexOf("Parked since"));
  const off = renderToStaticMarkup(<BatteryGauge snapshot={snapshot} parked={parked} now={NOW} />);
  expect(off).toContain("Parked since yesterday, 2:30 AM");
  expect(off).not.toContain("Sentry Mode is on.");
  const unparked = renderToStaticMarkup(<BatteryGauge snapshot={snapshot} now={NOW} sentry />);
  expect(unparked).toContain("Limit 70%");
  expect(unparked).toContain("Sentry Mode on");
});
