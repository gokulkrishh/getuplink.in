import { describe, expect, mock, test } from "bun:test";
import { describeDrive, type DriveInput } from "@/lib/drive-facts";
import { checkWording, factsKey, lineProblem, numbersIn, pickWords, RESPONSE_SCHEMA, wordingRequest } from "@/lib/drive-wording";

mock.module("server-only", () => ({}));

// 7:15 AM IST on 25 Oct 2026.
const T = Date.parse("2026-10-25T07:15:00+05:30");
const at = (seconds: number, v: number) => ({ t: T + seconds * 1000, v });
const series = (n: number, v: (k: number) => number) => Array.from({ length: n }, (_, k) => at(k, v(k)));

// A 20-minute drive, 12.3 km and 1.38 kWh (112 Wh/km), 70% to 65%, two hard brakes and a climb.
const input = (over: Partial<DriveInput> = {}): DriveInput => ({
  trip: { start: T, end: T + 20 * 60_000, km: 12.3, kwh: 1.38, stops: 0, startLevel: 70, endLevel: 65, legs: [{ start: T, end: T + 20 * 60_000 }] },
  battery: [at(0, 70), at(1200, 65)],
  speed: series(600, (k) => 20 + (k % 40)),
  power: series(600, (k) => (k % 10 === 0 ? -8 : 15)),
  accel: [...series(100, () => 0.5), at(200, -3.5), at(300, -3.2), at(400, 1)],
  grade: [...series(60, () => 0), ...Array.from({ length: 60 }, (_, k) => at(100 + k, 5)), ...Array.from({ length: 10 }, (_, k) => at(200 + k, 0))],
  usual: { whPerKm: 107, hard: 2 },
  ...over,
});

describe("describeDrive facts", () => {
  test("hold the figures as the page shows them", () => {
    const { facts, code } = describeDrive(input());
    expect(facts.started).toBe("7:15 AM");
    expect(facts.distance).toBe("12.3 km");
    expect(facts.efficiency).toEqual({ whPerKm: "112 Wh/km", usual: "107 Wh/km", vsUsual: { way: "worse", by: "5%" } });
    expect(facts.hard).toMatchObject({ brakes: 2, starts: 0, brakeTimes: ["7:18 AM", "7:20 AM"], usual: 2, vsUsual: "no more than usual" });
    expect(facts.battery).toEqual({ start: "70%", end: "65%", used: "5%", chargedOnTheWay: false });
    expect(facts.grade?.climbs).toEqual({ count: 1, steepest: "5%", at: "7:16 AM" });
    // Battery fell 5 points: under the chart's 10, so no battery chart and no line for it.
    expect(facts.charts).toEqual(["speed", "power", "acceleration", "grade"]);
    expect(code.summary).toBe("Heavy: 112 Wh/km, 5% worse than your usual 107 Wh/km. Smooth, with 2 hard brakes against your usual 2.");
  });

  test("carry no coordinates, place names, VIN or other identifiers", () => {
    const withExtras = { ...input(), route: [{ lat: 12.9716, lng: 77.5946 }], pins: [{ kind: "start", label: "Juniper Café", lat: 12.97, lng: 77.59 }], vin: "5YJ3E7EB0NF000001", vehicleId: "1492931337" };
    const json = JSON.stringify(describeDrive(withExtras as DriveInput).facts);
    for (const leak of ["12.97", "77.59", "Juniper", "5YJ3", "1492931337", "\"lat\"", "\"lng\"", "\"vin\"", "vehicle"]) expect(json).not.toContain(leak);
  });

  test("with no usual, nothing to compare", () => {
    const { facts } = describeDrive(input({ usual: { whPerKm: null, hard: null } }));
    expect(facts.efficiency).toEqual({ whPerKm: "112 Wh/km", usual: null, vsUsual: null });
    expect(facts.hard?.usual).toBeNull();
  });
});

describe("the number guard", () => {
  const { facts } = describeDrive(input());

  test("reads clock times whole and drops grouping commas", () => {
    expect(numbersIn("At 7:15 AM, 1,234.5 km and 5%.")).toEqual(["7:15", "1234.5", "5"]);
  });

  test("passes numbers copied from the facts", () => {
    expect(lineProblem("summary", "This drive used 112 Wh/km, 5% more than your usual 107 Wh/km, with hard braking at 7:18 AM and 7:20 AM.", facts)).toBeNull();
  });

  test("rejects an invented number", () => {
    // 7% isn't in the facts (it's 5%), nor is a difference worked out from them (112 - 107 = 5 would pass only by luck).
    expect(lineProblem("summary", "This drive used 112 Wh/km, 7% more than usual.", facts)).toBe("number");
    expect(lineProblem("speed", "You averaged 41 km/h.", facts)).toBe("number");
    // A time's minutes can't launder a figure: "15" alone isn't a fact.
    expect(lineProblem("speed", "You went 15 km/h faster than usual.", facts)).toBe("number");
    expect(lineProblem("summary", "You used twice the energy.", facts)).toBe("number");
    expect(lineProblem("summary", "There were nine hard brakes.", facts)).toBe("number");
  });

  test("rejects the house style's don'ts", () => {
    expect(lineProblem("battery", "Battery 70% → 65%.", facts)).toBe("style");
    expect(lineProblem("speed", "Great drive!", facts)).toBe("style");
    expect(lineProblem("speed", "Mostly 30–45 km/h.", facts)).toBe("style");
    expect(lineProblem("speed", "Top 59 km/h. Steady.", facts)).toBe("sentences");
    expect(lineProblem("summary", "One. Two. Three.", facts)).toBe("sentences");
  });

  test("rejects talk about the input or the writer", () => {
    // What the live model wrote for a drive with no acceleration readings.
    expect(lineProblem("summary", "This drive used 112 Wh/km. The facts don't include hard braking, so I can't say how smooth it was.", facts)).toBe("meta");
  });

  test("rejects the usual when there is none", () => {
    const none = describeDrive(input({ usual: { whPerKm: null, hard: null } })).facts;
    expect(lineProblem("summary", "This drive used 112 Wh/km, above your usual.", none)).toBe("usual");
  });
});

describe("checkWording", () => {
  const { facts } = describeDrive(input());
  const reply = {
    summary: "This drive used 112 Wh/km, 5% more than your usual 107 Wh/km, with 2 hard brakes.",
    speed: "You topped out at 59 km/h.",
    power: "The battery gave about 9 kWh.", // not in the facts
    acceleration: "You braked hard at 7:18 AM and 7:20 AM.",
    grade: null,
    battery: "The battery went from 70% to 65%.", // no battery chart on this page
  };

  test("keeps each line that passes, on its own", () => {
    const words = checkWording(JSON.stringify(reply), facts);
    expect(Object.keys(words ?? {}).sort()).toEqual(["acceleration", "speed", "summary"]);
  });

  test("a reply that doesn't parse, or breaks the schema, is nothing", () => {
    expect(checkWording("not json", facts)).toBeNull();
    expect(checkWording({ summary: 3 }, facts)).toBeNull();
    expect(checkWording({ ...reply, extra: "x" }, facts)).not.toBeNull(); // extra keys are dropped
  });
});

describe("pickWords: the fallback", () => {
  const code = { summary: "Heavy: 112 Wh/km.", speed: "Top 59 km/h.", power: "About 3 kWh drawn." };

  test("AI lines that passed show with the mark; the rest are code sentences, unmarked", () => {
    expect(pickWords(code, { summary: "AI summary.", grade: "AI grade line." })).toEqual({
      summary: { text: "AI summary.", ai: true },
      speed: { text: "Top 59 km/h.", ai: false },
      power: { text: "About 3 kWh drawn.", ai: false },
    });
  });

  test("with nothing stored, all code sentences", () => {
    expect(Object.values(pickWords(code, null)).every((l) => !l?.ai)).toBe(true);
  });
});

describe("the request", () => {
  const { facts } = describeDrive(input());

  test("thinking off, strict schema, no data collection, no temperature", () => {
    const body = wordingRequest(facts);
    expect(body.model).toBe("anthropic/claude-haiku-5.5");
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.provider).toEqual({ data_collection: "deny" });
    expect(body.response_format.json_schema.strict).toBe(true);
    expect("temperature" in body).toBe(false);
    expect(RESPONSE_SCHEMA.required).toEqual(["summary", "speed", "power", "acceleration", "grade", "battery"]);
    expect(body.messages[1].content).toBe(JSON.stringify(facts));
  });

  test("the facts key is stable and changes with the facts", () => {
    expect(factsKey(facts)).toBe(factsKey(JSON.parse(JSON.stringify(facts))));
    expect(factsKey(facts)).not.toBe(factsKey(describeDrive(input({ usual: { whPerKm: 100, hard: 2 } })).facts));
  });
});

describe("demo wording", async () => {
  const { demoHasWording, demoWording } = await import("@/lib/server/demo/wording");
  test("passes the same checks, and skips some drives", () => {
    const { facts } = describeDrive(input());
    const starts = Array.from({ length: 30 }, (_, k) => T + k * 30 * 60_000);
    const [some, none] = [starts.find(demoHasWording)!, starts.find((s) => !demoHasWording(s))!];
    expect(some && none).toBeTruthy();
    const words = demoWording(facts, some);
    expect(Object.keys(words ?? {}).sort()).toEqual(["acceleration", "grade", "power", "speed", "summary"]);
    expect(demoWording(facts, none)).toBeNull();
  });
});

describe("wording v2 guards", () => {
  test("a summary that says a comparison is missing, or a 'between … to' span, doesn't show", async () => {
    const { lineProblem } = await import("@/lib/drive-wording");
    const facts = { charts: [] } as unknown as Parameters<typeof lineProblem>[2];
    expect(lineProblem("summary", "There were 4 hard brakes, and no usual figure is available to compare those against.", facts, new Set(["4"]))).toBe("meta");
    expect(lineProblem("speed", "Speed mostly stayed between 28 to 68 km/h.", facts, new Set(["28", "68"]))).toBe("style");
  });
});
