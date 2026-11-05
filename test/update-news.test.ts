import { describe, expect, test } from "bun:test";
import type { Stream } from "@/lib/telemetry";
import { hasUpdateNews, type LastCheck, UPDATE_CHECK_GAP_MS } from "@/lib/update-news";

// When the car's stream has update news worth asking Tesla about, from the real 2026.38.6 readings of 5 Nov 2026
// (UTC): offered at 01:53 away from Wi-Fi, the download 9% to 100% at 04:36 to 04:38. The car ran 2026.38.3.2;
// its latest check was the day before, with nothing pending.
const at = (iso: string) => new Date(iso).toISOString();
const stream = (version: unknown, versionAt: string, download?: [number, string]): Stream => ({
  Version: { at: at("2026-11-05T01:52:10Z"), value: "2026.38.3.2" },
  SoftwareUpdateVersion: { at: at(versionAt), value: version },
  ...(download ? { SoftwareUpdateDownloadPercentComplete: { at: at(download[1]), value: download[0] } } : {}),
});
const yesterday: LastCheck = { at: at("2026-11-04T02:04:56Z"), version: null, downloadPerc: null };
const now = (iso: string) => Date.parse(iso);

describe("update news worth asking Tesla about", () => {
  test("a new version the last check didn't see, while the car is streaming", () => {
    expect(hasUpdateNews(stream("2026.38.6", "2026-11-05T01:53:10Z"), yesterday, now("2026-11-05T02:00:00Z"))).toBe(true);
  });

  test("never more than once per 30 minutes: a check within the gap holds it", () => {
    const justChecked: LastCheck = { at: at("2026-11-05T01:50:00Z"), version: null, downloadPerc: null };
    expect(hasUpdateNews(stream("2026.38.6", "2026-11-05T01:53:10Z"), justChecked, now("2026-11-05T02:00:00Z"))).toBe(false);
    expect(hasUpdateNews(stream("2026.38.6", "2026-11-05T01:53:10Z"), justChecked, now("2026-11-05T01:50:00Z") + UPDATE_CHECK_GAP_MS)).toBe(false);
  });

  test("not once the news is old: the car has likely gone back to sleep, and the check wouldn't wake it anyway", () => {
    expect(hasUpdateNews(stream("2026.38.6", "2026-11-05T01:53:10Z"), yesterday, now("2026-11-05T03:00:00Z"))).toBe(false);
  });

  test("a version the check already saw, sent again, isn't news", () => {
    const sawIt: LastCheck = { at: at("2026-11-05T02:00:00Z"), version: "2026.38.6", downloadPerc: 0 };
    expect(hasUpdateNews(stream("2026.38.6", "2026-11-05T02:56:03Z", [0, "2026-11-05T02:56:03Z"]), sawIt, now("2026-11-05T03:00:00Z"))).toBe(false);
  });

  test("a download percent unlike Tesla's own is news: 100 streamed while the check said waiting at 0", () => {
    const waiting: LastCheck = { at: at("2026-11-05T02:00:00Z"), version: "2026.38.6", downloadPerc: 0 };
    expect(hasUpdateNews(stream("2026.38.6", "2026-11-05T01:53:10Z", [100, "2026-11-05T04:38:42Z"]), waiting, now("2026-11-05T04:45:00Z"))).toBe(true);
  });

  test("a blank version (\" \"), or one the car already runs, build hash and all, is no news", () => {
    expect(hasUpdateNews(stream(" ", "2026-11-05T01:53:10Z", [0, "2026-11-05T01:53:10Z"]), yesterday, now("2026-11-05T02:00:00Z"))).toBe(false);
    expect(hasUpdateNews(stream("2026.38.3.2 a1b2c3d4e5", "2026-11-05T01:53:10Z"), yesterday, now("2026-11-05T02:00:00Z"))).toBe(false);
  });

  test("a car never checked has news as soon as it streams a version", () => {
    expect(hasUpdateNews(stream("2026.38.6", "2026-11-05T01:53:10Z"), null, now("2026-11-05T02:00:00Z"))).toBe(true);
  });
});
