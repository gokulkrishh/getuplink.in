import { describe, expect, test } from "bun:test";
import { tipProblem } from "@/lib/ai-tips";
import { averagePrice, chargeFindings, chargingFindings, type PricedCharge, pricedCharges, stationPrices, taperTimes } from "@/lib/charge-tips";

const MIN = 60_000;
const t0 = Date.parse("2026-10-14T10:00:00+05:30");
const c = (id: string, name: string, area: string | null, kwh: number, cost: number, kind: "ac" | "dc" = "dc"): PricedCharge => ({ id, at: t0, name, area, kwh, cost, kind });
const priced = [
  c("s1", "Statiq, Brigade Road", "Bengaluru", 30, 600),
  c("s2", "Supercharger, Hebbal", "Bengaluru", 40, 1000),
  c("s3", "Home wallbox", null, 50, 450, "ac"),
];

describe("charging tips: findings", () => {
  test("billed charges are named as the app names them, with the town from the bill", () => {
    const list = pricedCharges(
      [{ session_id: 9, started_at: "2026-10-14T04:30:00Z", site_name: "Bengaluru, Hebbal", cost_total: 1000, energy_kwh: 40 }],
      [{ id: 1, started_at: "2026-10-25T15:55:56Z", kind: "dc", energy_added_kwh: 14.64 }],
      new Map([[1, { amount: 243.52, kwhBilled: 14.74, network: "IndianOil e-Charge", station: "Sri Sakthi Agency, Bhavani Road, Anthiyur" }]]),
    );
    expect(list.map((p) => [p.name, p.area])).toEqual([
      ["Supercharger, Hebbal", "Bengaluru"],
      ["IndianOil e-Charge, Sri Sakthi Agency", "Anthiyur"],
    ]);
    expect(stationPrices(list)[0].perKwh).toBeCloseTo(16.52, 2);
    expect(averagePrice(priced)).toBeCloseTo(17.08, 2);
  });

  test("80% is placed between the readings either side of it", () => {
    const levels = [0, 10, 20, 30, 40].map((m, k) => ({ t: t0 + m * MIN, v: [50, 65, 78, 86, 92][k] }));
    const taper = taperTimes(levels, t0, t0 + 40 * MIN, 50, 92)!;
    expect(Math.round(taper.belowMs / MIN)).toBe(23);
    expect(Math.round(taper.aboveMs / MIN)).toBe(18);
    expect(taperTimes(levels, t0, t0 + 40 * MIN, 50, 82)).toBeNull();
  });

  test("Stats > Charging: a cheaper station in the same town first, then 80%, then AC and DC", () => {
    const findings = chargingFindings({ priced, energy: { ac: 50, dc: 70 }, dcWithCurves: 4, tapered: [{ at: t0, taper: { startLevel: 50, endLevel: 92, belowMs: 23 * MIN, aboveMs: 18 * MIN } }] });
    expect(findings.map((f) => f.kind)).toEqual(["cheaperNearby", "stationPrices", "pastEighty", "acAndDc"]);
    expect(findings[0].facts).toMatchObject({ town: "Bengaluru", cheaper: { station: "Statiq, Brigade Road", price: "₹20.00/kWh" }, dearer: { price: "₹25.00/kWh" }, paidExtra: "₹200.00" });
    expect(findings[2].facts).toMatchObject({ dcChargesPast80: 1, timeAbove80: "18 min", longest: { upTo80: "50% to 80%", tookUpTo80: "23 min", past80: "80% to 92%" } });
    for (const f of findings) expect(tipProblem(f.say, [f])).toBeNull();
  });

  test("one charge: a cheaper station in its town, the owner's cheapest, and its time past 80%", () => {
    const findings = chargeFindings({ charge: priced[1], others: [priced[0], priced[2], c("s4", "Statiq, Brigade Road", "Bengaluru", 10, 210)], kind: "dc", taper: { startLevel: 50, endLevel: 92, belowMs: 23 * MIN, aboveMs: 18 * MIN } });
    expect(findings.map((f) => f.kind)).toEqual(["cheaperNearby", "thisChargePrice", "pastEighty"]);
    expect(findings[0].facts).toMatchObject({ thisCharge: "₹25.00/kWh", cheaper: { station: "Statiq, Brigade Road" } });
    for (const f of findings) expect(tipProblem(f.say, [f])).toBeNull();
  });

  test("a single charge with nothing to compare says nothing", () => {
    expect(chargingFindings({ priced: priced.slice(0, 1), energy: { ac: 0, dc: 30 }, dcWithCurves: 1, tapered: [] })).toEqual([]);
    expect(chargeFindings({ charge: priced[0], others: [], kind: "dc", taper: null })).toEqual([]);
  });
});
