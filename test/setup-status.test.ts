import { describe, expect, test } from "bun:test";
import configJws from "./fixtures/setup/config-jws.json";
import fleetStatus from "./fixtures/setup/fleet-status.json";
import telemetryConfig from "./fixtures/setup/telemetry-config.json";
import {
  type CarSetup,
  gateFor,
  KEY_RECHECK_MS,
  keyStale,
  keyStep,
  PAIRED_RECHECK_MS,
  SILENT_RECHECK_MS,
  parseConfigSent,
  signInPath,
  parseFleetStatus,
  parseTelemetryConfig,
  RESEND_AFTER_MS,
  shouldSendConfig,
  skipReason,
  streamingStep,
} from "@/lib/setup-status";

const PAIRED = "TESTVIN00000PAIRED";
const UNPAIRED = "TESTVIN0000UNPAIRED";
const UNLISTED = "TESTVIN00UNLISTED0";
const NOW = Date.parse("2026-11-03T10:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const car = (over: Partial<CarSetup> = {}): CarSetup => ({
  vin: PAIRED,
  name: null,
  keyPaired: null,
  keyCheckedAt: null,
  streaming: null,
  streamingCheckedAt: null,
  configSentAt: null,
  ...over,
});

describe("fleet_status", () => {
  test("a VIN is paired or unpaired only when Tesla lists it so", () => {
    const status = parseFleetStatus(fleetStatus, [PAIRED, UNPAIRED, UNLISTED]);
    expect(status.get(PAIRED)).toBe(true);
    expect(status.get(UNPAIRED)).toBe(false);
    expect(status.get(UNLISTED)).toBeNull();
  });

  test("any other shape is unknown for every car", () => {
    for (const body of [null, {}, { response: null }, { response: "ok" }, { response: { key_paired_vins: "nope" } }, { error: "x" }]) {
      expect([...parseFleetStatus(body, [PAIRED]).values()]).toEqual([null]);
    }
  });
});

describe("fleet_telemetry_config", () => {
  test("reads each state", () => {
    expect(parseTelemetryConfig(telemetryConfig.synced)).toBe("synced");
    expect(parseTelemetryConfig(telemetryConfig.pending)).toBe("pending");
    expect(parseTelemetryConfig(telemetryConfig.none)).toBe("none");
    expect(parseTelemetryConfig(telemetryConfig.full)).toBe("full");
  });

  // Seen live on 29 Oct 2026 after the key was removed and added back: Tesla says synced with no config.
  test("synced with no config is 'none', so the config is sent again", () => {
    expect(parseTelemetryConfig({ response: { synced: true, config: null, key_paired: true, limit_reached: false } })).toBe("none");
  });

  test("an empty or missing answer is unknown, never 'none' (which would send a config)", () => {
    expect(parseTelemetryConfig(telemetryConfig.empty)).toBeNull();
    expect(parseTelemetryConfig(telemetryConfig.null)).toBeNull();
    expect(parseTelemetryConfig(null)).toBeNull();
  });
});

describe("fleet_telemetry_config_jws", () => {
  test("reads the skipped cars and why", () => {
    const sent = parseConfigSent(configJws)!;
    expect(sent.updated).toBe(1);
    expect(skipReason(sent, UNPAIRED)).toBe("missing_key");
    expect(skipReason(sent, PAIRED)).toBeNull();
  });
});

describe("when to send the config", () => {
  test("only a paired car Tesla says has none, and not twice within the hour", () => {
    expect(shouldSendConfig(car({ keyPaired: true, streaming: "none" }), NOW)).toBe(true);
    expect(shouldSendConfig(car({ keyPaired: true, streaming: "none", configSentAt: ago(RESEND_AFTER_MS - 1) }), NOW)).toBe(false);
    expect(shouldSendConfig(car({ keyPaired: true, streaming: "none", configSentAt: ago(RESEND_AFTER_MS) }), NOW)).toBe(true);
  });

  test("never a car that already has a config (the owner's, synced or not), nor one without the key", () => {
    expect(shouldSendConfig(car({ keyPaired: true, streaming: "synced" }), NOW)).toBe(false);
    expect(shouldSendConfig(car({ keyPaired: true, streaming: "pending" }), NOW)).toBe(false);
    expect(shouldSendConfig(car({ keyPaired: true, streaming: "full" }), NOW)).toBe(false);
    expect(shouldSendConfig(car({ keyPaired: true, streaming: null }), NOW)).toBe(false);
    expect(shouldSendConfig(car({ keyPaired: false, streaming: "none" }), NOW)).toBe(false);
    expect(shouldSendConfig(car({ keyPaired: null, streaming: "none" }), NOW)).toBe(false);
  });
});

describe("rechecking", () => {
  test("an unconfirmed key every 10 minutes, a paired one once a day", () => {
    expect(keyStale(car(), NOW)).toBe(true);
    expect(keyStale(car({ keyPaired: false, keyCheckedAt: ago(KEY_RECHECK_MS - 1) }), NOW)).toBe(false);
    expect(keyStale(car({ keyPaired: false, keyCheckedAt: ago(KEY_RECHECK_MS) }), NOW)).toBe(true);
    expect(keyStale(car({ keyPaired: true, keyCheckedAt: ago(KEY_RECHECK_MS * 3) }), NOW)).toBe(false);
    expect(keyStale(car({ keyPaired: true, keyCheckedAt: ago(PAIRED_RECHECK_MS) }), NOW)).toBe(true);
  });

  test("a paired key within the hour once the cars have gone quiet, since a removed key stops the data", () => {
    const paired = car({ keyPaired: true, keyCheckedAt: ago(SILENT_RECHECK_MS) });
    // Nothing sent for an hour (or ever): checked again.
    expect(keyStale(paired, NOW, NOW - SILENT_RECHECK_MS)).toBe(true);
    expect(keyStale(paired, NOW, null)).toBe(true);
    // Sending data: the key is plainly there.
    expect(keyStale(paired, NOW, NOW - 60_000)).toBe(false);
    // Checked within the hour: not again yet, however quiet.
    expect(keyStale(car({ keyPaired: true, keyCheckedAt: ago(SILENT_RECHECK_MS - 1) }), NOW, null)).toBe(false);
  });
});

describe("the gate", () => {
  const checked = ago(60_000);
  test("sends to /setup only when Tesla said a car lacks the key", () => {
    expect(gateFor({ demo: false, admin: false, cars: [{ keyPaired: false, keyCheckedAt: checked }] })).toBe("setup");
    expect(gateFor({ demo: false, admin: false, cars: [{ keyPaired: true, keyCheckedAt: checked }, { keyPaired: false, keyCheckedAt: checked }] })).toBe("setup");
  });

  test("passes when every car is paired, or there are none yet", () => {
    expect(gateFor({ demo: false, admin: false, cars: [{ keyPaired: true, keyCheckedAt: checked }] })).toBe("pass");
    expect(gateFor({ demo: false, admin: false, cars: [] })).toBe("pass");
  });

  test("an unreadable answer is a note, never a gate; never asked is a pass", () => {
    expect(gateFor({ demo: false, admin: false, cars: [{ keyPaired: null, keyCheckedAt: checked }] })).toBe("unknown");
    expect(gateFor({ demo: false, admin: false, cars: [{ keyPaired: null, keyCheckedAt: null }] })).toBe("pass");
  });

  test("demo mode never gates", () => {
    expect(gateFor({ demo: true, admin: false, cars: [{ keyPaired: false, keyCheckedAt: checked }] })).toBe("pass");
  });

  test("the owner is never gated: paired per Tesla, and as the admin never sent to /setup", () => {
    const owner = parseFleetStatus(fleetStatus, [PAIRED]).get(PAIRED)!;
    expect(gateFor({ demo: false, admin: false, cars: [{ keyPaired: owner, keyCheckedAt: checked }] })).toBe("pass");
    for (const keyPaired of [true, null]) {
      expect(gateFor({ demo: false, admin: true, cars: [{ keyPaired, keyCheckedAt: checked }] })).toBe("pass");
    }
  });

  test("the admin is told, not redirected, when Tesla says the key was removed", () => {
    expect(gateFor({ demo: false, admin: true, cars: [{ keyPaired: false, keyCheckedAt: checked }] })).toBe("key-removed");
    expect(gateFor({ demo: true, admin: true, cars: [{ keyPaired: false, keyCheckedAt: checked }] })).toBe("pass");
  });
});

describe("the steps on /setup", () => {
  test("key, then streaming", () => {
    expect(keyStep([car({ keyPaired: false })])).toBe("todo");
    expect(streamingStep([car({ keyPaired: false })])).toBe("waiting");
    expect(keyStep([car({ keyPaired: true })])).toBe("done");
    expect(streamingStep([car({ keyPaired: true, streaming: "pending" })])).toBe("waiting");
    expect(streamingStep([car({ keyPaired: true, streaming: "synced" })])).toBe("done");
    expect(keyStep([])).toBe("unknown");
  });
});

describe("where a sign-in lands", () => {
  test("a first sign-in, with no car stored yet, lands on /setup", () => {
    expect(signInPath([])).toBe("/setup");
  });
  test("a car without the key, or not known yet, lands on /setup", () => {
    expect(signInPath([{ keyPaired: false }])).toBe("/setup");
    expect(signInPath([{ keyPaired: null }])).toBe("/setup");
    expect(signInPath([{ keyPaired: true }, { keyPaired: false }])).toBe("/setup");
  });
  test("every car with the key lands on home", () => {
    expect(signInPath([{ keyPaired: true }, { keyPaired: true }])).toBe("/");
  });
});
