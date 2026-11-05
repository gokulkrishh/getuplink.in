import { describe, expect, test } from "bun:test";
import { isPending } from "@/components/updates/update-status";
import type { Snapshot } from "@/lib/server/dashboard";
import { applyStream, type Stream } from "@/lib/telemetry";

// The real 2026.38.3.2 update (23 and 24 Oct 2026, UTC), as the car streamed it. It downloaded at 11:58 PM
// IST, sat downloaded overnight with the installation percent at 10, and installed from 7:41 to 8:02 AM IST
// when the owner started it. No check saw any of it: the car was offline at every one.
const READINGS: [string, string, unknown][] = [
  ["2026-10-23T13:34:25Z", "SoftwareUpdateInProgress", false],
  ["2026-10-23T18:27:39Z", "SoftwareUpdateVersion", " "],
  ["2026-10-23T18:27:39Z", "SoftwareUpdateDownloadPercentComplete", 0],
  ["2026-10-23T18:27:39Z", "SoftwareUpdateInstallationPercentComplete", 1],
  ["2026-10-23T18:27:39Z", "SoftwareUpdateExpectedDurationMinutes", 45],
  ["2026-10-23T18:27:39Z", "SoftwareUpdateInProgress", false],
  ["2026-10-23T18:28:39Z", "SoftwareUpdateDownloadPercentComplete", 100],
  ["2026-10-23T18:28:39Z", "SoftwareUpdateVersion", "2026.38.3.2"],
  ["2026-10-23T18:30:28Z", "SoftwareUpdateInstallationPercentComplete", 3],
  ["2026-10-23T18:32:19Z", "SoftwareUpdateDownloadPercentComplete", 0],
  ["2026-10-23T18:33:19Z", "SoftwareUpdateDownloadPercentComplete", 25],
  ["2026-10-23T18:33:52Z", "SoftwareUpdateInstallationPercentComplete", 4],
  ["2026-10-23T18:34:19Z", "SoftwareUpdateDownloadPercentComplete", 100],
  ["2026-10-23T18:39:05Z", "SoftwareUpdateInstallationPercentComplete", 10],
  ["2026-10-23T18:39:05Z", "SoftwareUpdateExpectedDurationMinutes", 40],
  ["2026-10-24T02:09:50Z", "SoftwareUpdateInProgress", false],
  ["2026-10-24T02:11:57Z", "SoftwareUpdateInProgress", true],
  ["2026-10-24T02:18:15Z", "SoftwareUpdateInstallationPercentComplete", 30],
  ["2026-10-24T02:30:11Z", "SoftwareUpdateInstallationPercentComplete", 100],
  ["2026-10-24T02:32:47Z", "SoftwareUpdateInProgress", false],
  ["2026-10-24T02:33:03Z", "SoftwareUpdateVersion", " "],
  ["2026-10-24T02:33:03Z", "SoftwareUpdateInstallationPercentComplete", 1],
  ["2026-10-24T02:33:04Z", "SoftwareUpdateDownloadPercentComplete", 0],
];

// The latest reading per field at `at`, as loadStream reads it then.
function streamAt(at: string, without: string[] = []): Stream {
  const stream: Stream = {};
  for (const [when, field, value] of READINGS) {
    if (Date.parse(when) <= Date.parse(at) && !without.includes(field)) stream[field] = { at: new Date(when).toISOString(), value };
  }
  return stream;
}

// The last online check before the update: nothing pending.
const CHECK: Snapshot = {
  polled_at: "2026-10-23T06:00:34.415Z",
  state: "online",
  car_version: "2026.38.3.1",
  update_status: null,
  update_version: null,
  download_perc: 0,
  install_perc: 1,
  expected_duration_sec: 2700,
  scheduled_time_ms: null,
  battery_level: 80,
  battery_range_km: 400,
  charging_state: "Stopped",
  charge_limit: 90,
  charge_power_kw: null,
  charge_energy_kwh: null,
  time_to_full_h: null,
  error: null,
};

describe("the pending update laid over the last check", () => {
  test("downloaded and waiting overnight is available, not installing, though the install percent reads 10", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-23T22:00:00Z"))!;
    expect(shown.update_status).toBe("available");
    expect(shown.update_version).toBe("2026.38.3.2");
    expect(shown.expected_duration_sec).toBe(40 * 60);
  });

  test("installing from the moment the car says the install is in progress", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-24T02:20:00Z"))!;
    expect(shown.update_status).toBe("installing");
    expect(shown.install_perc).toBe(30);
  });

  test("a second download while pending shows as downloading", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-23T18:33:30Z"))!;
    expect(shown.update_status).toBe("downloading");
    expect(shown.download_perc).toBe(25);
  });

  test("nothing pending once the car clears the version after installing", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-24T03:00:00Z"))!;
    expect(shown.update_status).toBeNull();
    expect(shown.update_version).toBeNull();
  });

  test("without InProgress streamed, the install percent alone doesn't make it installing", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-23T22:00:00Z", ["SoftwareUpdateInProgress"]))!;
    expect(shown.update_status).toBe("available");
    // A check that saw the install still counts.
    expect(applyStream({ ...CHECK, update_status: "installing" }, streamAt("2026-10-23T22:00:00Z", ["SoftwareUpdateInProgress"]))!.update_status).toBe("installing");
  });

  test("the streamed version is normalised like the check's", () => {
    const stream = streamAt("2026-10-23T22:00:00Z");
    stream.SoftwareUpdateVersion = { at: stream.SoftwareUpdateVersion.at, value: "2026.38.3.2 a1b2c3d4" };
    expect(applyStream(CHECK, stream)!.update_version).toBe("2026.38.3.2");
  });
});

// The real 2026.38.6 update (5 Nov 2026, UTC). The car was offered it at 7:23 AM IST away from Wi-Fi, and the
// download sat at 0% for almost three hours while the Tesla app said to connect to Wi-Fi. On Wi-Fi at 10:06 AM
// it went 9%, 38%, 100% a minute apart. No check saw any of it.
const WIFI_WAIT: [string, string, unknown][] = [
  ["2026-11-05T01:52:10Z", "SoftwareUpdateVersion", " "],
  ["2026-11-05T01:52:10Z", "SoftwareUpdateDownloadPercentComplete", 0],
  ["2026-11-05T01:52:10Z", "SoftwareUpdateInstallationPercentComplete", 1],
  ["2026-11-05T01:52:10Z", "SoftwareUpdateExpectedDurationMinutes", 45],
  ["2026-11-05T01:52:10Z", "SoftwareUpdateInProgress", false],
  ["2026-11-05T01:52:10Z", "SoftwareUpdateAvailable", false],
  ["2026-11-05T01:53:10Z", "SoftwareUpdateVersion", "2026.38.6"],
  ["2026-11-05T02:56:03Z", "SoftwareUpdateVersion", "2026.38.6"],
  ["2026-11-05T02:56:03Z", "SoftwareUpdateDownloadPercentComplete", 0],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateVersion", "2026.38.6"],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateDownloadPercentComplete", 0],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateInProgress", false],
  ["2026-11-05T04:36:42Z", "SoftwareUpdateDownloadPercentComplete", 9],
  ["2026-11-05T04:37:42Z", "SoftwareUpdateDownloadPercentComplete", 38],
  ["2026-11-05T04:38:42Z", "SoftwareUpdateDownloadPercentComplete", 100],
];
const BEFORE = { ...CHECK, polled_at: "2026-11-04T06:00:00Z", car_version: "2026.38.5.1" };
const wifiStream = (at: string): Stream => {
  const stream: Stream = {};
  for (const [when, field, value] of WIFI_WAIT) if (Date.parse(when) <= Date.parse(at)) stream[field] = { at: new Date(when).toISOString(), value };
  return stream;
};

describe("an update offered away from Wi-Fi", () => {
  test("at 0% nothing has come down yet: waiting for Wi-Fi, not downloading", () => {
    for (const at of ["2026-11-05T02:00:00Z", "2026-11-05T03:30:00Z", "2026-11-05T04:35:00Z"]) {
      const shown = applyStream(BEFORE, wifiStream(at))!;
      expect(shown.update_status).toBe("downloading_wifi_wait");
      expect(shown.update_version).toBe("2026.38.6");
    }
  });

  test("downloading once the percent moves", () => {
    const shown = applyStream(BEFORE, wifiStream("2026-11-05T04:37:50Z"))!;
    expect(shown.update_status).toBe("downloading");
    expect(shown.download_perc).toBe(38);
  });

  test("downloaded, it is available", () => {
    expect(applyStream(BEFORE, wifiStream("2026-11-05T04:40:00Z"))!.update_status).toBe("available");
  });
});

describe("isPending", () => {
  const offer = { ...CHECK, update_status: "available", update_version: "2026.38.3.2" };

  test("an offer newer than the installed version is pending", () => {
    expect(isPending(offer, "2026.38.3.1")).toBe(true);
    expect(isPending(offer)).toBe(true);
  });

  test("an offer the car has installed since is a stale check", () => {
    expect(isPending(offer, "2026.38.3.2")).toBe(false);
    expect(isPending(offer, "2026.40.1")).toBe(false);
  });

  test("a status Tesla sent without a version still shows", () => {
    expect(isPending({ ...offer, update_version: null }, "2026.38.3.2")).toBe(true);
  });

  test("no status, or one Uplink doesn't know, is not pending", () => {
    expect(isPending(CHECK, "2026.38.3.1")).toBe(false);
    expect(isPending({ ...offer, update_status: "something_new" })).toBe(false);
    expect(isPending(null)).toBe(false);
  });
});
