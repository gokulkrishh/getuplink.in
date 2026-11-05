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
  test("downloaded and waiting overnight is queued, not installing, though the install percent reads 10", () => {
    // This car didn't stream SoftwareUpdateAvailable then, and no check saw it: ready to install isn't known.
    const shown = applyStream(CHECK, streamAt("2026-10-23T22:00:00Z"))!;
    expect(shown.update_status).toBe("queued");
    expect(shown.update_version).toBe("2026.38.3.2");
    expect(shown.expected_duration_sec).toBe(40 * 60);
  });

  test("installing from the moment the car says the install is in progress", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-24T02:20:00Z"))!;
    expect(shown.update_status).toBe("installing");
    expect(shown.install_perc).toBe(30);
  });

  test("the streamed download percent is never shown as a download: queued, no percent", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-23T18:33:30Z"))!;
    expect(shown.update_status).toBe("queued");
    expect(shown.download_perc).toBeNull();
  });

  test("nothing pending once the car clears the version after installing", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-24T03:00:00Z"))!;
    expect(shown.update_status).toBeNull();
    expect(shown.update_version).toBeNull();
  });

  test("without InProgress streamed, the install percent alone doesn't make it installing", () => {
    const shown = applyStream(CHECK, streamAt("2026-10-23T22:00:00Z", ["SoftwareUpdateInProgress"]))!;
    expect(shown.update_status).toBe("queued");
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
  test("from the car alone it is queued all along, 0% or 100%: telemetry can't tell a download", () => {
    for (const at of ["2026-11-05T02:00:00Z", "2026-11-05T04:37:50Z", "2026-11-05T04:40:00Z"]) {
      const shown = applyStream(BEFORE, wifiStream(at))!;
      expect(shown.update_status).toBe("queued");
      expect(shown.update_version).toBe("2026.38.6");
      expect(shown.download_perc).toBeNull();
    }
  });

  test("Tesla's check gives the reason: waiting for Wi-Fi", () => {
    const check = { ...BEFORE, polled_at: "2026-11-05T04:45:00Z", update_status: "downloading_wifi_wait", update_version: "2026.38.6" };
    expect(applyStream(check, wifiStream("2026-11-05T05:00:00Z"))!.update_status).toBe("downloading_wifi_wait");
  });

  test("Tesla's answer holds when the car re-sends its installed Version after the check", () => {
    const check = { ...BEFORE, polled_at: "2026-11-05T04:45:00Z", car_version: "2026.38.5.1", update_status: "downloading_wifi_wait", update_version: "2026.38.6" };
    const stream: Stream = { ...wifiStream("2026-11-05T05:00:00Z"), Version: { at: "2026-11-05T04:55:00.000Z", value: "2026.38.5.1" } };
    expect(applyStream(check, stream)!.update_status).toBe("downloading_wifi_wait");
    // A new Version after the check is an install: the check's answer no longer counts.
    stream.Version = { at: "2026-11-05T04:55:00.000Z", value: "2026.38.6" };
    expect(applyStream(check, stream)!.update_status).toBeNull();
  });

  test("Tesla's check says downloading: downloading, with the check's percent", () => {
    const check = { ...BEFORE, polled_at: "2026-11-05T04:45:00Z", update_status: "downloading", update_version: "2026.38.6", download_perc: 12 };
    const shown = applyStream(check, { ...wifiStream("2026-11-05T05:00:00Z"), SoftwareUpdateDownloadPercentComplete: { at: "2026-11-05T04:50:00.000Z", value: 100 } })!;
    expect(shown.update_status).toBe("downloading");
    expect(shown.download_perc).toBe(12);
  });
});

// The update's state from every software-update field (lib/telemetry.ts's UPDATE_FIELDS), from the car's real
// readings on 5 Nov 2026 (UTC). At 10:26 AM IST 2026.38.6 was downloaded but the car offered no update, nor did
// the Tesla app: SoftwareUpdateAvailable stayed false. It ran 2026.38.3.2.
const NOV5: [string, string, unknown][] = [
  ["2026-11-05T04:33:22Z", "Version", "2026.38.3.2"],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateVersion", "2026.38.6"],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateDownloadPercentComplete", 0],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateInstallationPercentComplete", 1],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateExpectedDurationMinutes", 45],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateInProgress", false],
  ["2026-11-05T04:33:22Z", "SoftwareUpdateAvailable", false],
  ["2026-11-05T04:36:42Z", "SoftwareUpdateDownloadPercentComplete", 9],
  ["2026-11-05T04:37:42Z", "SoftwareUpdateDownloadPercentComplete", 38],
  ["2026-11-05T04:38:42Z", "SoftwareUpdateDownloadPercentComplete", 100],
  ["2026-11-05T04:46:27Z", "Version", "2026.38.3.2"],
  ["2026-11-05T04:46:27Z", "SoftwareUpdateVersion", "2026.38.6"],
  ["2026-11-05T04:46:27Z", "SoftwareUpdateDownloadPercentComplete", 100],
  ["2026-11-05T04:46:27Z", "SoftwareUpdateInstallationPercentComplete", 3],
  ["2026-11-05T04:46:27Z", "SoftwareUpdateInProgress", false],
  ["2026-11-05T04:46:27Z", "SoftwareUpdateAvailable", false],
];
const AFTER_CHECK = { ...CHECK, polled_at: "2026-11-04T06:00:00Z", car_version: "2026.38.3.2" };
// The 5 Nov stream at `at`, with `extra` readings laid over it.
function nov5(at: string, extra: [string, unknown][] = [], extraAt = at): Stream {
  const stream: Stream = {};
  for (const [when, field, value] of NOV5) if (Date.parse(when) <= Date.parse(at)) stream[field] = { at: new Date(when).toISOString(), value };
  for (const [field, value] of extra) stream[field] = { at: new Date(extraAt).toISOString(), value };
  return stream;
}
const stateAt = (at: string, extra: [string, unknown][] = []) => applyStream(AFTER_CHECK, nov5(at, extra))!;

describe("the update's state from every software-update field", () => {
  test("1. in progress: installing, with the installation percent", () => {
    const shown = stateAt("2026-11-05T05:00:00Z", [["SoftwareUpdateInProgress", true], ["SoftwareUpdateInstallationPercentComplete", 30]]);
    expect(shown.update_status).toBe("installing");
    expect(shown.install_perc).toBe(30);
  });

  test("2. SoftwareUpdateAvailable true: ready to install", () => {
    expect(stateAt("2026-11-05T05:00:00Z", [["SoftwareUpdateAvailable", true]]).update_status).toBe("available");
  });

  test("2. ready to install wins over the download percent", () => {
    expect(stateAt("2026-11-05T04:37:50Z", [["SoftwareUpdateAvailable", true]]).update_status).toBe("available");
  });

  test("3. version set, neither of those: queued, without the streamed percent", () => {
    const shown = stateAt("2026-11-05T04:37:50Z");
    expect(shown.update_status).toBe("queued");
    expect(shown.update_version).toBe("2026.38.6");
    expect(shown.download_perc).toBeNull();
  });

  test("3. a streamed download at 100 with SoftwareUpdateAvailable false is queued, not downloaded or available (10:26 AM IST)", () => {
    const shown = stateAt("2026-11-05T04:56:49Z");
    expect(shown.update_status).toBe("queued");
    expect(shown.download_perc).toBeNull();
  });

  test("4. a blank version (the car sends \" \"): nothing", () => {
    const shown = stateAt("2026-11-05T05:00:00Z", [["SoftwareUpdateVersion", " "]]);
    expect(shown.update_status).toBeNull();
    expect(shown.update_version).toBeNull();
    for (const blank of ["", "   ", null]) expect(stateAt("2026-11-05T05:00:00Z", [["SoftwareUpdateVersion", blank]]).update_status).toBeNull();
  });

  test("4. a version equal to the installed one: nothing, the build hash ignored", () => {
    expect(stateAt("2026-11-05T05:00:00Z", [["Version", "2026.38.6 a1b2c3d4e5"]]).update_status).toBeNull();
    // Older than installed is a stale offer too; segments compare as numbers (38.10 is newer than 38.6).
    expect(stateAt("2026-11-05T05:00:00Z", [["Version", "2026.38.10"]]).update_status).toBeNull();
  });

  test("the offered version's build hash is stripped", () => {
    const shown = stateAt("2026-11-05T05:00:00Z", [["SoftwareUpdateVersion", "2026.38.6 a1b2c3d4e5"]]);
    expect(shown.update_version).toBe("2026.38.6");
    expect(shown.update_status).toBe("queued");
  });

  test("readings from before the latest Version reading are left out: the label clears after the install", () => {
    // Installed at 5:20; the car sends its new Version, and the old update fields aren't sent again.
    const shown = applyStream(AFTER_CHECK, nov5("2026-11-05T05:30:00Z", [["Version", "2026.38.6"]], "2026-11-05T05:20:00Z"))!;
    expect(shown.update_status).toBeNull();
  });

  test("a Version re-sent on its own, unchanged, keeps the queued update", () => {
    // 10:43 AM's SoftwareUpdateVersion, then the installed Version alone at 11:00, no check since the day before.
    const stream = nov5("2026-11-05T05:20:00Z");
    stream.Version = { at: "2026-11-05T05:30:00.000Z", value: "2026.38.3.2" };
    const shown = applyStream(AFTER_CHECK, stream)!;
    expect(shown.update_status).toBe("queued");
    expect(shown.update_version).toBe("2026.38.6");
  });

  test("a Version reading that names the same version again keeps the fields sent with it", () => {
    // 04:46:27's batch re-sent Version with the rest: they count (>=), so the state holds.
    expect(stateAt("2026-11-05T04:50:00Z").update_status).toBe("queued");
  });
});

describe("streamed fields older than the check give way to it", () => {
  // A check at 05:00 UTC, after the 04:46 batch, that saw the car offer the update.
  const offered = { ...AFTER_CHECK, polled_at: "2026-11-05T05:00:00Z", update_status: "scheduled", update_version: "2026.38.6", download_perc: 100, scheduled_time_ms: 1 };
  test("an older SoftwareUpdateAvailable false doesn't hide a newer check that says it's ready", () => {
    const shown = applyStream(offered, nov5("2026-11-05T05:30:00Z", [["SoftwareUpdateInstallationPercentComplete", 4]], "2026-11-05T05:10:00Z"))!;
    expect(shown.update_status).toBe("scheduled");
  });

  test("an update the check found after an install stays, though the streamed version is from before it", () => {
    // Installed 2026.38.6 at 05:20 (Version streamed); a 06:00 check sees 2026.40.2; Version is re-sent at 07:00.
    const check = { ...offered, polled_at: "2026-11-05T06:00:00Z", update_status: "available", update_version: "2026.40.2" };
    const stream = nov5("2026-11-05T04:50:00Z");
    stream.Version = { at: "2026-11-05T05:20:00.000Z", value: "2026.38.6" };
    expect(applyStream(check, stream)!.update_status).toBe("available");
    stream.Version = { at: "2026-11-05T07:00:00.000Z", value: "2026.38.6" };
    // The check came before this Version reading, so it no longer counts either: nothing is known pending.
    expect(applyStream(check, stream)!.update_status).toBeNull();
  });

  test("an install that stops leaves the update ready, not preparing", () => {
    const installing = { ...offered, update_status: "installing" };
    const shown = applyStream(installing, nov5("2026-11-05T05:30:00Z", [["SoftwareUpdateInProgress", false]], "2026-11-05T05:10:00Z"))!;
    expect(shown.update_status).toBe("available");
  });

  test("a new version doesn't take the old one's install time", () => {
    const check = { ...offered, update_version: "2026.38.5", expected_duration_sec: 40 * 60 };
    const stream: Stream = {
      SoftwareUpdateVersion: { at: "2026-11-05T05:10:00.000Z", value: "2026.38.6" },
      SoftwareUpdateDownloadPercentComplete: { at: "2026-11-05T05:10:00.000Z", value: 20 },
    };
    const shown = applyStream(check, stream)!;
    expect(shown.update_version).toBe("2026.38.6");
    expect(shown.expected_duration_sec).toBeNull();
  });
});

describe("the update's state from a check alone", () => {
  const check = (status: string | null, version: string | null = "2026.38.6") => ({ ...AFTER_CHECK, update_status: status, update_version: version });
  test("Tesla's statuses map to the states, a blank or installed version to nothing", () => {
    for (const status of ["available", "scheduled", "downloading", "downloading_wifi_wait", "installing"]) {
      const shown = applyStream(check(status), {})!;
      expect(shown.update_status).toBe(status);
      expect(isPending(shown, "2026.38.3.2")).toBe(true);
    }
    expect(isPending(check("available", null), "2026.38.3.2")).toBe(true);
    expect(isPending(check(null), "2026.38.3.2")).toBe(false);
    expect(isPending(check("available"), "2026.38.6")).toBe(false);
    expect(isPending(check("available"), "2026.38.6 a1b2c3d4e5")).toBe(false);
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
