import { describe, expect, test } from "bun:test";
import { storedRaw } from "@/lib/stored-raw";

describe("storedRaw", () => {
  test("drops tokens, drive_state and vehicle_state.media_info, keeps the rest", () => {
    const data = {
      tokens: ["t"],
      backseat_token: "b",
      backseat_token_updated_at: 1,
      drive_state: { latitude: 12.9, longitude: 77.6 },
      vehicle_state: { odometer: 1234, car_version: "2026.38.4", media_info: { a2dp_source_name: "Owner's phone", now_playing_title: "Song" }, media_state: { remote_control_enabled: true } },
      charge_state: { battery_level: 80 },
      vehicle_config: { car_type: "modely" },
    };
    expect(storedRaw(data)).toEqual({
      vehicle_state: { odometer: 1234, car_version: "2026.38.4", media_state: { remote_control_enabled: true } },
      charge_state: { battery_level: 80 },
      vehicle_config: { car_type: "modely" },
    });
    // The response itself is untouched.
    expect(data.vehicle_state.media_info.a2dp_source_name).toBe("Owner's phone");
  });
  test("no vehicle_state, or none at all", () => {
    expect(storedRaw({ charge_state: { battery_level: 1 } })).toEqual({ charge_state: { battery_level: 1 } });
    expect(storedRaw(null)).toBeNull();
    expect(storedRaw(undefined)).toBeNull();
  });
});
