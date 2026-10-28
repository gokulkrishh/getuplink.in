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

const parked = { hours: 39, fromFirstReading: false };
const snapshot = { battery_level: 70, charge_limit: 70, charging_state: "Disconnected" } as Snapshot;

test("the red circle sits on the parked line only while Sentry Mode is on", () => {
  const on = renderToStaticMarkup(<BatteryGauge snapshot={snapshot} parked={parked} sentry />);
  expect(on).toContain("Parked 1 day 15 h · Limit 70%");
  expect(on).toContain("Sentry Mode is on.");
  expect(on).toContain("bg-destructive");
  const off = renderToStaticMarkup(<BatteryGauge snapshot={snapshot} parked={parked} />);
  expect(off).toContain("Parked 1 day 15 h · Limit 70%");
  expect(off).not.toContain("Sentry Mode is on.");
  const limitOnly = renderToStaticMarkup(<BatteryGauge snapshot={snapshot} sentry />);
  expect(limitOnly).toContain("Limit 70%");
  expect(limitOnly).not.toContain("Sentry Mode is on.");
});
