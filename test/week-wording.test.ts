import { describe, expect, test } from "bun:test";
import { checkWeekLine, modelFacts, quietWeek, type WeekFacts, weekLineProblem, weekRequest } from "@/lib/week-wording";

const facts: WeekFacts = {
  distance: "100.3 km",
  distanceWeekBefore: "78.6 km",
  drivenDays: [{ day: "Friday", distance: "46.6 km" }, { day: "Monday", distance: "46.3 km" }],
  trips: 4,
  longestTrip: { distance: "46.2 km", day: "Monday" },
  energyUsed: "12.4 kWh",
  efficiency: "124 Wh/km",
  efficiencyWeekBefore: "131 Wh/km",
  charges: 1,
  energyAdded: "14.6 kWh",
  spent: "₹243.52",
  costPerKwh: "₹16.68/kWh",
};

describe("Home's AI week line", () => {
  test("the model never sees the four totals the tiles show", () => {
    const sent = JSON.parse(weekRequest(facts).messages[1].content);
    expect(sent).toEqual(modelFacts(facts));
    for (const total of ["100.3 km", "12.4 kWh", "14.6 kWh", "₹243.52"]) expect(JSON.stringify(sent)).not.toContain(total);
  });

  test("a line with only the facts' numbers shows", () => {
    expect(checkWeekLine({ line: "Most of the driving came on Friday and Monday, and efficiency improved from 131 Wh/km to 124 Wh/km." }, facts)).not.toBeNull();
  });

  test("a made-up number, a tile total, a greeting, two sentences or a '!' don't", () => {
    expect(weekLineProblem("Efficiency improved by 7 Wh/km.", facts)).toBe("number");
    expect(weekLineProblem("You drove 100.3 km this week.", facts)).toBe("number");
    expect(weekLineProblem("Good morning, a busy week.", facts)).toBe("meta");
    expect(weekLineProblem("A busy Friday. A busy Monday.", facts)).toBe("sentences");
    expect(weekLineProblem("What a week!", facts)).toBe("style");
  });

  test("a distance next to the wrong day doesn't show", () => {
    expect(weekLineProblem("Most of the driving was on Friday and Monday, with 46.2 km and 46.6 km respectively.", facts)).toBe("pairing");
    expect(weekLineProblem("Monday's 46.6 km led the week.", facts)).toBe("pairing");
    expect(weekLineProblem("Friday's 46.6 km led the week, and the longest trip was 46.2 km on Monday.", facts)).toBeNull();
  });

  test("a week with nothing in it gets no line", () => {
    expect(quietWeek({ ...facts, distance: null, energyAdded: null, spent: null })).toBe(true);
    expect(quietWeek(facts)).toBe(false);
  });
});
