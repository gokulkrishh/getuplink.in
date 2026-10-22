import { describe, expect, test } from "bun:test";
import { MAP_HEIGHT, MAP_WIDTH, project, STATE_PATHS, stateAt } from "@/lib/india-map";
import { STATES } from "@/lib/india-states";

describe("stateAt", () => {
  test.each([
    ["Cyber City, Gurugram", 28.495, 77.089, "HR"],
    ["Sector 18, Noida", 28.57, 77.321, "UP"],
    ["Connaught Place, Delhi", 28.6315, 77.2167, "DL"],
    ["Sector 17, Chandigarh", 30.741, 76.782, "CH"],
    ["Ludhiana", 30.901, 75.857, "PB"],
    ["Puducherry", 11.934, 79.83, "PY"],
    ["Nariman Point, Mumbai", 18.9256, 72.8242, "MH"],
    ["Marina Beach, Chennai", 13.05, 80.2824, "TN"],
    ["Fort Kochi", 9.9658, 76.2421, "KL"],
    ["Park Street, Kolkata", 22.553, 88.352, "WB"],
    ["MG Road, Bengaluru", 12.975, 77.606, "KA"],
    ["HITEC City, Hyderabad", 17.445, 78.377, "TG"],
    ["Koregaon Park, Pune", 18.536, 73.893, "MH"],
    ["Srinagar", 34.08, 74.8, "JK"],
    ["Leh", 34.15, 77.58, "LA"],
  ] as const)("%s is in %s", (_, lat, lon, code) => {
    expect(stateAt(lat, lon)).toBe(code);
  });

  test("the official boundary: Gilgit-Baltistan and Aksai Chin in Ladakh, Muzaffarabad in J&K, all of Arunachal", () => {
    expect(stateAt(35.92, 74.31)).toBe("LA"); // Gilgit
    expect(stateAt(36.7, 75.3)).toBe("LA"); // near the Khunjerab Pass
    expect(stateAt(35.2, 79.5)).toBe("LA"); // Aksai Chin
    expect(stateAt(34.37, 73.47)).toBe("JK"); // Muzaffarabad
    expect(stateAt(27.59, 91.86)).toBe("AR"); // Tawang
    expect(stateAt(28.0, 96.9)).toBe("AR"); // the eastern edge, near Kibithu
  });

  test("outside India is no state", () => {
    expect(stateAt(15, 65)).toBeNull(); // Arabian Sea
    expect(stateAt(24.86, 67.0)).toBeNull(); // Karachi
    expect(stateAt(Number.NaN, 77)).toBeNull();
  });
});

describe("map shapes", () => {
  test("every state has a shape, inside the viewBox", () => {
    expect(Object.keys(STATE_PATHS).sort()).toEqual(Object.keys(STATES).sort());
    for (const d of Object.values(STATE_PATHS)) {
      const n = d.replace(/[MZ]/g, " ").trim().split(/\s+/).map(Number);
      for (let i = 0; i < n.length; i += 2) {
        expect(n[i]).toBeGreaterThanOrEqual(0);
        expect(n[i]).toBeLessThanOrEqual(MAP_WIDTH);
        expect(n[i + 1]).toBeGreaterThanOrEqual(0);
        expect(n[i + 1]).toBeLessThanOrEqual(MAP_HEIGHT);
      }
    }
  });

  test("cities project where expected: Delhi north of Mumbai, Kolkata east of Chennai", () => {
    const [delhiX, delhiY] = project(28.61, 77.21);
    const [mumbaiX, mumbaiY] = project(19.08, 72.88);
    const [chennaiX] = project(13.08, 80.27);
    const [kolkataX] = project(22.57, 88.36);
    expect(delhiY).toBeLessThan(mumbaiY);
    expect(delhiX).toBeGreaterThan(mumbaiX);
    expect(kolkataX).toBeGreaterThan(chennaiX);
  });
});
