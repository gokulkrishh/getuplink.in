import { describe, expect, test } from "bun:test";
import {
  type CostLine,
  costAlerts,
  daysUntil,
  DEFAULT_USD_INR,
  googleEstimate,
  monthlyCharge,
  monthlyTotal,
  monthWindow,
  nextRenewal,
  overBudget,
  parseBudget,
  parseEntry,
  parseRate,
  parseRateInput,
  renewsSoon,
  sumFocusCharges,
  toInr,
} from "@/lib/costs";

// Midday IST on 26 Oct 2026.
const NOW = Date.parse("2026-10-26T06:30:00Z");

const line = (over: Partial<CostLine>): CostLine => ({
  id: "x",
  name: "Thing",
  amount: 10,
  currency: "USD",
  period: "monthly",
  resetsOn: null,
  source: "fixed",
  link: "https://example.com",
  state: "ok",
  ...over,
});

describe("currency", () => {
  test("dollars convert at the rate, rupees stay", () => {
    expect(toInr(10, "USD", 84)).toBe(840);
    expect(toInr(500, "INR", 84)).toBe(500);
  });

  test("the rate is a positive number, or null for the default", () => {
    expect(parseRate(undefined)).toBeNull();
    expect(parseRate(" ")).toBeNull();
    expect(parseRate("0")).toBeNull();
    expect(parseRate("-3")).toBeNull();
    expect(parseRate("lots")).toBeNull();
    expect(parseRate(" 83.5 ")).toBe(83.5);
    expect(DEFAULT_USD_INR).toBe(84);
  });
});

describe("the month's total", () => {
  test("a yearly cost counts as a twelfth", () => {
    expect(monthlyCharge(line({ amount: 1200, currency: "INR", period: "yearly" }))).toBe(100);
    expect(monthlyCharge(line({ amount: 25 }))).toBe(25);
  });

  test("an allowance comes off first and never goes below zero", () => {
    expect(monthlyCharge(line({ amount: 12.5, allowance: 10 }))).toBe(2.5);
    expect(monthlyCharge(line({ amount: 4, allowance: 10 }))).toBe(0);
  });

  test("sums rupees and dollars in rupees, with the dollar figure beside it", () => {
    const total = monthlyTotal(
      [line({ amount: 25 }), line({ amount: 1200, currency: "INR", period: "yearly" }), line({ amount: 12, allowance: 10 }), line({ amount: null, state: "not-set" })],
      84,
    );
    expect(total.inr).toBe(25 * 84 + 100 + 2 * 84);
    expect(total.usd).toBeCloseTo(total.inr / 84, 10);
    expect(total.counted).toBe(3);
    expect(total.uncounted).toBe(1);
    expect(total.yearly).toBe(1);
  });

  test("nothing known is zero, not a crash", () => {
    expect(monthlyTotal([], 84)).toEqual({ inr: 0, usd: 0, counted: 0, uncounted: 0, yearly: 0 });
  });
});

describe("renewals", () => {
  test("a date still ahead stays", () => {
    expect(nextRenewal("2026-11-07", "yearly", NOW)).toBe("2026-11-07");
    expect(nextRenewal("2026-10-26", "monthly", NOW)).toBe("2026-10-26");
  });

  test("a past date rolls on to its next one", () => {
    expect(nextRenewal("2024-11-07", "yearly", NOW)).toBe("2026-11-07");
    expect(nextRenewal("2025-03-01", "yearly", NOW)).toBe("2027-03-01");
    expect(nextRenewal("2026-01-15", "monthly", NOW)).toBe("2026-11-15");
  });

  test("the 31st and 29 Feb clamp to the month's end without drifting", () => {
    // 31 Jan monthly: Feb is the 28th, but Nov keeps the 30th and Dec the 31st.
    expect(nextRenewal("2026-01-31", "monthly", Date.parse("2026-02-10T06:30:00Z"))).toBe("2026-02-28");
    expect(nextRenewal("2026-01-31", "monthly", NOW)).toBe("2026-10-31");
    expect(nextRenewal("2026-01-31", "monthly", Date.parse("2026-11-05T06:30:00Z"))).toBe("2026-11-30");
    expect(nextRenewal("2024-02-29", "yearly", NOW)).toBe("2027-02-28");
    expect(nextRenewal("2024-02-29", "yearly", Date.parse("2028-01-10T06:30:00Z"))).toBe("2028-02-29");
  });

  test("days count in IST", () => {
    expect(daysUntil("2026-10-26", NOW)).toBe(0);
    expect(daysUntil("2026-10-27", NOW)).toBe(1);
    // 23:30 IST on the 26th is still the 26th; 00:30 IST on the 27th is the next day.
    expect(daysUntil("2026-10-27", Date.parse("2026-10-26T18:00:00Z"))).toBe(1);
    expect(daysUntil("2026-10-27", Date.parse("2026-10-26T19:00:00Z"))).toBe(0);
  });

  test("within 30 days, the 30th included", () => {
    expect(renewsSoon("2026-10-26", NOW)).toBe(true);
    expect(renewsSoon("2026-11-25", NOW)).toBe(true);
    expect(renewsSoon("2026-11-26", NOW)).toBe(false);
    expect(renewsSoon("2026-10-25", NOW)).toBe(false);
    expect(renewsSoon(null, NOW)).toBe(false);
  });

  test("the month window is calendar months in UTC", () => {
    expect(monthWindow(NOW)).toEqual({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-27T00:00:00.000Z", resetsOn: "2026-11-01" });
    expect(monthWindow(Date.parse("2026-12-31T23:00:00Z")).resetsOn).toBe("2027-01-01");
  });
});

describe("Vercel charges", () => {
  test("sums BilledCost over every row, credits negative, strings or numbers", () => {
    const body = [
      { BilledCost: 20, BillingCurrency: "USD", ChargeCategory: "Purchase" },
      { BilledCost: "1.25", BillingCurrency: "USD", ChargeCategory: "Usage" },
      { BilledCost: -0.25, BillingCurrency: "USD", ChargeCategory: "Credit" },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n");
    expect(sumFocusCharges(`${body}\n`)).toEqual({ total: 21, rows: 3 });
  });

  test("no rows is $0; a row that doesn't parse makes the whole read unknown", () => {
    expect(sumFocusCharges("")).toEqual({ total: 0, rows: 0 });
    expect(sumFocusCharges('{"BilledCost": 1}\nnot json')).toBeNull();
    expect(sumFocusCharges('{"BilledCost": "abc"}')).toBeNull();
    expect(sumFocusCharges('{"BilledCost": 1, "BillingCurrency": "EUR"}')).toBeNull();
  });
});

describe("Google estimate", () => {
  test("within the free calls a month it's $0", () => {
    expect(googleEstimate({ geocoding: 70_000, placeDetailsPro: 35_000, idsOnly: 1_000_000 })).toBe(0);
  });

  test("calls past each SKU's free allowance, at its price", () => {
    // 10,000 geocodes over at $1.50 and 1,000 Text Search Pro over at $9.60.
    expect(googleEstimate({ geocoding: 80_000, textSearchPro: 36_000 })).toBeCloseTo(15 + 9.6, 10);
  });

  test("odd counts add nothing", () => {
    expect(googleEstimate({ geocoding: -5, placeDetailsPro: Number.NaN })).toBe(0);
  });
});

describe("budgets", () => {
  test("past Tesla's credit or the owner's budget", () => {
    expect(overBudget(line({ amount: 10.01, allowance: 10 }))).toBe(true);
    expect(overBudget(line({ amount: 10, allowance: 10 }))).toBe(false);
    expect(overBudget(line({ amount: 6, budget: 5 }))).toBe(true);
    expect(overBudget(line({ amount: 6, budget: null }))).toBe(false);
    expect(overBudget(line({ amount: null, allowance: 10 }))).toBe(false);
  });

  test("alerts: renewals soonest first, then budgets", () => {
    const alerts = costAlerts(
      [
        line({ id: "domain", name: "Domain", period: "yearly", resetsOn: "2026-11-07" }),
        line({ id: "supabase", name: "Supabase", resetsOn: "2026-10-27" }),
        line({ id: "far", resetsOn: "2026-12-30" }),
        line({ id: "unset", amount: null, state: "not-set", resetsOn: "2026-10-28" }),
        line({ id: "vercel", source: "live", resetsOn: "2026-11-01" }),
        line({ id: "tesla", name: "Tesla Fleet API", source: "estimated", amount: 12, allowance: 10 }),
        line({ id: "google", name: "Google Maps Platform", source: "estimated", amount: 6, budget: 5 }),
      ],
      NOW,
    );
    expect(alerts.map((a) => a.text)).toEqual([
      "Supabase renews tomorrow.",
      "Domain renews in 12 days, on 7 Nov 2026.",
      "Tesla Fleet API is past its $10.00 monthly credit.",
      "Google Maps Platform is over its $5.00 budget.",
    ]);
  });
});

describe("what the owner types", () => {
  const ok = { name: "Email", amount: "1,200.50", currency: "INR", period: "yearly", renewsOn: "2027-01-31", link: "https://example.com/billing" } as const;

  test("a full entry", () => {
    expect(parseEntry(ok)).toEqual({ ok: true, value: { ...ok, amount: 1200.5 } });
  });

  test("empty date and link are left out", () => {
    const parsed = parseEntry({ ...ok, renewsOn: "", link: " " });
    expect(parsed.ok && parsed.value.renewsOn).toBeUndefined();
    expect(parsed.ok && parsed.value.link).toBeUndefined();
  });

  test("refuses what isn't a cost", () => {
    for (const bad of [
      { amount: "-5" },
      { amount: "abc" },
      { amount: "1.234" },
      { amount: "" },
      { currency: "EUR" },
      { period: "weekly" },
      { renewsOn: "2026-02-30" },
      { renewsOn: "tomorrow" },
      { name: "" },
      { name: "x".repeat(81) },
    ]) {
      expect(parseEntry({ ...ok, ...bad }).ok).toBe(false);
    }
  });

  test("links must be https: no javascript:, data: or plain http", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,hi", "http://example.com", "example.com", "https//x"]) {
      expect(parseEntry({ ...ok, link })).toEqual({ ok: false, message: "Links must start with https://" });
    }
  });

  test("the rate and the budget", () => {
    expect(parseRateInput("83.25")).toEqual({ ok: true, value: 83.25 });
    expect(parseRateInput("0").ok).toBe(false);
    expect(parseRateInput("").ok).toBe(false);
    expect(parseBudget("")).toEqual({ ok: true, value: null });
    expect(parseBudget("5")).toEqual({ ok: true, value: 5 });
    expect(parseBudget("-1").ok).toBe(false);
  });
});
