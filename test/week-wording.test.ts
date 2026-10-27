import { describe, expect, test } from "bun:test";
import { checkWeekTips, modelFacts, quietWeek, tipProblem, type WeekFacts, weekRequest } from "@/lib/week-wording";

const facts: WeekFacts = {
  distance: "100.3 km",
  distanceWeekBefore: "78.6 km",
  trips: 4,
  shortTrips: 2,
  energyUsed: "12.4 kWh",
  efficiency: "124 Wh/km",
  efficiencyWeekBefore: "131 Wh/km",
  charges: 1,
  energyAdded: "14.6 kWh",
  spent: "₹243.52",
  costPerKwh: "₹16.68/kWh",
};

describe("Home's AI week tips", () => {
  test("the model never sees the four totals the tiles show", () => {
    const sent = JSON.parse(weekRequest(facts).messages[1].content);
    expect(sent).toEqual(modelFacts(facts));
    for (const total of ["100.3 km", "12.4 kWh", "14.6 kWh", "₹243.52"]) expect(JSON.stringify(sent)).not.toContain(total);
  });

  test("tips with only the facts' numbers show, and the ones that fail are dropped", () => {
    const tips = checkWeekTips(
      {
        tips: [
          "Efficiency improved from 131 Wh/km to 124 Wh/km. Steady speeds help keep it there.",
          "Efficiency improved by 7 Wh/km.",
          "Charging cost ₹16.68/kWh this week.",
        ],
      },
      facts,
    );
    expect(tips).toEqual(["Efficiency improved from 131 Wh/km to 124 Wh/km. Steady speeds help keep it there.", "Charging cost ₹16.68/kWh this week."]);
  });

  test("a made-up number, a tile total, a greeting, three sentences, a '!' or battery health don't show", () => {
    expect(tipProblem("Efficiency improved by 7 Wh/km.", facts)).toBe("number");
    expect(tipProblem("You drove 100.3 km this week.", facts)).toBe("number");
    expect(tipProblem("Good morning, a busy week.", facts)).toBe("meta");
    expect(tipProblem("A busy week. Lots of trips. Well done.", facts)).toBe("sentences");
    expect(tipProblem("What a week!", facts)).toBe("style");
    expect(tipProblem("Short trips can wear the battery's health.", facts)).toBe("topic");
    expect(tipProblem("Two of your four trips were short.", facts)).toBe("number");
    expect(tipProblem("2 of your 4 trips were short.", facts)).toBeNull();
  });

  test("at most three tips, and a reply that isn't JSON gives none", () => {
    expect(checkWeekTips({ tips: ["A.", "B.", "C.", "D."] }, facts)).toHaveLength(3);
    expect(checkWeekTips("not json", facts)).toEqual([]);
  });

  test("a week with nothing in it gets no tips", () => {
    expect(quietWeek({ ...facts, distance: null, energyAdded: null, spent: null })).toBe(true);
    expect(quietWeek(facts)).toBe(false);
  });
});
