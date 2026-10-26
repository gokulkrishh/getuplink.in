import { describe, expect, test } from "bun:test";
import { odometerKm } from "@/lib/car";
import { isStaleSync, lastSyncedText, newestTime, syncAge } from "@/lib/last-synced";
import { currentVersion } from "@/lib/versions";

// 25 Oct 2026, 10:42 AM IST.
const AT = "2026-10-25T05:12:00.000Z";
const HOUR = 3_600_000;

describe("newestTime", () => {
  test("the newest of the check and the streamed reading, either way round", () => {
    expect(newestTime(["2026-10-25T01:00:00Z", AT])).toBe(AT);
    expect(newestTime([AT, "2026-10-25T01:00:00Z"])).toBe(AT);
  });
  test("skips missing and unreadable times; null when none", () => {
    expect(newestTime([null, undefined, "not a time", AT])).toBe(AT);
    expect(newestTime([null, undefined])).toBeNull();
    expect(newestTime([])).toBeNull();
  });
});

describe("lastSyncedText", () => {
  test("recent: just the date and time", () => {
    expect(lastSyncedText(AT, Date.parse(AT) + 20 * 60_000)).toBe("Last synced 25 Oct, 10:42 AM");
    expect(lastSyncedText(AT, Date.parse(AT) + 12 * HOUR)).toBe("Last synced 25 Oct, 10:42 AM");
  });
  test("over 12 hours: how long ago first", () => {
    expect(lastSyncedText(AT, Date.parse(AT) + 13 * HOUR)).toBe("Last synced 13 hours ago, 25 Oct, 10:42 AM");
    expect(lastSyncedText(AT, Date.parse(AT) + 25 * HOUR)).toBe("Last synced 1 day ago, 25 Oct, 10:42 AM");
    expect(lastSyncedText(AT, Date.parse(AT) + 50 * HOUR)).toBe("Last synced 2 days ago, 25 Oct, 10:42 AM");
    // Past a week still counts days, rather than printing the date twice.
    expect(lastSyncedText(AT, Date.parse(AT) + 10 * 24 * HOUR)).toBe("Last synced 10 days ago, 25 Oct, 10:42 AM");
  });
  test("no time yet", () => {
    expect(lastSyncedText(null, Date.parse(AT))).toBe("Not synced yet");
  });
});

describe("syncAge and isStaleSync", () => {
  test("hours under a day, else days", () => {
    expect(syncAge(AT, Date.parse(AT) + 23.9 * HOUR)).toBe("23 hours ago");
    expect(syncAge(AT, Date.parse(AT) + 48 * HOUR)).toBe("2 days ago");
  });
  test("stale only past 12 hours", () => {
    expect(isStaleSync(AT, Date.parse(AT) + 12 * HOUR)).toBe(false);
    expect(isStaleSync(AT, Date.parse(AT) + 12 * HOUR + 1)).toBe(true);
    expect(isStaleSync(null, Date.parse(AT))).toBe(false);
  });
});

describe("currentVersion", () => {
  test("the vehicle row wins over an older check", () => {
    expect(currentVersion("2026.38.3.2", { version: "2026.38.3.1 abc123", at: "2026-10-23T00:00:00Z" })).toBe("2026.38.3.2");
  });
  test("without the row, the newest of the streamed reading and the check, normalised", () => {
    const check = { version: "2026.38.3.1 abc123", at: "2026-10-23T00:00:00Z" };
    const streamed = { version: "2026.38.3.2 def456", at: "2026-10-25T00:00:00Z" };
    expect(currentVersion(null, check, streamed)).toBe("2026.38.3.2");
    expect(currentVersion(null, streamed, check)).toBe("2026.38.3.2");
    expect(currentVersion(undefined, check, null)).toBe("2026.38.3.1");
  });
  test("nothing known, or only placeholders", () => {
    expect(currentVersion(null)).toBeNull();
    expect(currentVersion("0.0.0", { version: 42, at: AT })).toBeNull();
  });
});

describe("odometerKm", () => {
  test("the newer of the check's and the streamed reading, miles to km, unrounded", () => {
    const check = { miles: 10_000, at: "2026-10-23T00:00:00Z" };
    const streamed = { miles: 10_100, at: "2026-10-25T00:00:00Z" };
    expect(odometerKm(check, streamed)).toBeCloseTo(16_254.3744, 6);
    expect(odometerKm(streamed, check)).toBeCloseTo(16_254.3744, 6);
    expect(odometerKm(check, undefined)).toBeCloseTo(16_093.44, 6);
  });
  test("non-numbers and zero are ignored", () => {
    expect(odometerKm({ miles: "123", at: AT }, null)).toBeNull();
    expect(odometerKm({ miles: 0, at: AT })).toBeNull();
  });
});
