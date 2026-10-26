import { describe, expect, test } from "bun:test";
import {
  type CostLine,
  costAlerts,
  daysUntil,
  FLY_PRICES,
  flyEstimate,
  googleEstimate,
  isStale,
  LEGACY_USD_INR,
  machineMonthly,
  monthlyCharge,
  monthlyTotal,
  monthWindow,
  nextRenewal,
  overBudget,
  parseBudget,
  parseEntry,
  rdapExpiry,
  renews,
  renewsSoon,
  sumFocusCharges,
  supabaseEstimate,
  type SupabaseAddon,
  toUsd,
} from "@/lib/costs";
import apis from "./fixtures/cost-apis.json";

// Midday IST on 26 Oct 2026.
const NOW = Date.parse("2026-10-26T06:30:00Z");

const line = (over: Partial<CostLine>): CostLine => ({
  id: "x",
  name: "Thing",
  amount: 10,
  period: "monthly",
  resetsOn: null,
  source: "fixed",
  link: "https://example.com",
  state: "ok",
  ...over,
});

describe("dollars", () => {
  test("an old rupee row converts at the fixed rate; dollars stay", () => {
    expect(toUsd(840, "INR")).toBe(10);
    expect(toUsd(12.5, "USD")).toBe(12.5);
    expect(LEGACY_USD_INR).toBe(84);
  });
});

describe("the month's total", () => {
  test("a yearly cost counts as a twelfth", () => {
    expect(monthlyCharge(line({ amount: 11.98 * 12, period: "yearly" }))).toBeCloseTo(11.98, 10);
    expect(monthlyCharge(line({ amount: 25 }))).toBe(25);
  });

  test("an allowance comes off first and never goes below zero", () => {
    expect(monthlyCharge(line({ amount: 12.5, allowance: 10 }))).toBe(2.5);
    expect(monthlyCharge(line({ amount: 4, allowance: 10 }))).toBe(0);
  });

  test("sums in dollars and names the services it leaves out", () => {
    const total = monthlyTotal([
      line({ amount: 25 }),
      line({ amount: 120, period: "yearly" }),
      line({ amount: 12, allowance: 10 }),
      line({ id: "fly", name: "Fly.io", amount: null, state: "connect" }),
      line({ id: "google", name: "Google Maps Platform", amount: null, state: "not-tracked" }),
    ]);
    expect(total.usd).toBe(25 + 10 + 2);
    expect(total.counted).toBe(3);
    expect(total.yearly).toBe(1);
    expect(total.missing).toEqual([
      { id: "fly", name: "Fly.io" },
      { id: "google", name: "Google Maps Platform" },
    ]);
  });

  test("nothing known is zero, not a crash", () => {
    expect(monthlyTotal([])).toEqual({ usd: 0, counted: 0, yearly: 0, missing: [] });
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

  test("owner entries and yearly costs renew; usage months reset", () => {
    expect(renews(line({}))).toBe(true);
    expect(renews(line({ source: "estimated", period: "yearly" }))).toBe(true);
    expect(renews(line({ source: "estimated" }))).toBe(false);
    expect(renews(line({ source: "live" }))).toBe(false);
  });

  test("a read older than 7 hours is stale", () => {
    expect(isStale(new Date(NOW - 6 * 3_600_000).toISOString(), NOW)).toBe(false);
    expect(isStale(new Date(NOW - 8 * 3_600_000).toISOString(), NOW)).toBe(true);
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

describe("Supabase estimate", () => {
  const addons = apis.supabaseAddons.selected_addons as SupabaseAddon[];

  test("Free is $0 and needs no add-ons", () => {
    expect(supabaseEstimate("free", [])).toEqual({ usd: 0, note: "Free plan" });
  });

  test("Pro with Micro compute is $25: the $10 credit covers it", () => {
    expect(supabaseEstimate("pro", [{ status: "ACTIVE_HEALTHY", addons: [] }])).toEqual({ usd: 25, note: "Pro plan" });
    const micro = [{ type: "compute_instance", variant: { id: "ci_micro" } }];
    expect(supabaseEstimate("pro", [{ status: "ACTIVE_HEALTHY", addons: micro }]).usd).toBe(25);
  });

  test("the fixture: Pro, Small compute past the credit, a custom domain and IPv4 at its hourly API price", () => {
    // $25 + ($15 - $10) + $10 + $0.0055 × 730 hours. The paused project adds nothing.
    const est = supabaseEstimate(apis.supabaseOrg.plan, [
      { status: "ACTIVE_HEALTHY", addons },
      { status: "INACTIVE", addons },
    ]);
    expect(est.usd).toBeCloseTo(25 + 5 + 10 + 0.0055 * 730, 10);
    expect(est.note).toBe("Pro plan, 2 add-ons");
  });

  test("the credit is once per org: two Micro projects pay for one", () => {
    const micro = [{ type: "compute_instance", variant: { id: "ci_micro" } }];
    expect(supabaseEstimate("team", [{ status: "ACTIVE_HEALTHY", addons: micro }, { status: "ACTIVE_HEALTHY", addons: micro }]).usd).toBe(599 + 10);
  });

  test("PITR by retention; phone MFA $75 then $10", () => {
    const pitr = [{ type: "pitr", variant: { id: "pitr_14" } }, { type: "auth_mfa_phone", variant: { id: "auth_mfa_phone_default" } }];
    expect(supabaseEstimate("pro", [{ status: "ACTIVE_HEALTHY", addons: pitr }, { status: "ACTIVE_HEALTHY", addons: pitr }]).usd).toBe(25 + 10 + 400 + 85);
  });

  test("Enterprise has no list price", () => {
    expect(supabaseEstimate("enterprise", [])).toEqual({ usd: null, note: "Enterprise plan, custom pricing" });
  });
});

describe("Fly.io estimate", () => {
  test("the model reproduces every published preset to the cent", () => {
    const presets: [string, number, number, number][] = [
      ["shared", 1, 256, 2.19],
      ["shared", 1, 512, 3.69],
      ["shared", 1, 1024, 6.7],
      ["shared", 2, 2048, 13.39],
      ["performance", 1, 2048, 33],
      ["performance", 2, 4096, 66],
    ];
    for (const [cpu_kind, cpus, memory_mb, price] of presets) {
      expect(Math.round(Math.abs(machineMonthly({ cpu_kind, cpus, memory_mb })! - price) * 100)).toBeLessThanOrEqual(1);
    }
  });

  test("the fixture: two machines always on, 4 GB of volumes, one dedicated IPv4", () => {
    // $3.69 + $2.19 (stopped, counted as on) + 4 × $0.15 + $2. The destroyed machine, the shared v4, IPv6
    // and the egress IP add nothing.
    const est = flyEstimate({ machines: apis.flyMachines, volumes: apis.flyVolumes, ips: apis.flyIps.ips });
    expect(est?.machines).toBe(2);
    expect(est?.usd).toBeCloseTo(3.69 + 2.19 + 0.6 + 2, 10);
  });

  test("a kind Fly doesn't price this way makes the estimate unknown", () => {
    expect(flyEstimate({ machines: [{ state: "started", config: { guest: { cpu_kind: "a100-pcie-40gb", cpus: 8 } } }], volumes: [], ips: [] })).toBeNull();
    expect(machineMonthly({ cpu_kind: "shared", cpus: 0, memory_mb: 256 })).toBeNull();
  });

  test("Fly's informal waiver is under $5", () => {
    expect(FLY_PRICES.waivedUnder).toBe(5);
  });
});

describe("RDAP", () => {
  test("the expiry is the expiration event, as an IST day, with the registrar", () => {
    // 20:15 UTC on the 20th is 01:45 IST on the 21st.
    expect(rdapExpiry(apis.rdap)).toEqual({ expires: "2028-10-21", registrar: "namecheap" });
  });

  test("no expiration event, or not a domain response, is unknown", () => {
    expect(rdapExpiry({ events: [{ eventAction: "registration", eventDate: "2026-10-21T05:15:33Z" }] })).toBeNull();
    expect(rdapExpiry({ events: [{ eventAction: "expiration", eventDate: "soon" }] })).toBeNull();
    expect(rdapExpiry({ errorCode: 404 })).toBeNull();
    expect(rdapExpiry(null)).toBeNull();
    expect(rdapExpiry("<html>")).toBeNull();
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

  test("alerts: renewals soonest first, then budgets; the estimated domain still alerts", () => {
    const alerts = costAlerts(
      [
        line({ id: "domain", name: "Domain", source: "estimated", period: "yearly", resetsOn: "2026-11-07" }),
        line({ id: "entry-1", name: "Email", resetsOn: "2026-10-27" }),
        line({ id: "far", resetsOn: "2026-12-30" }),
        line({ id: "unknown", amount: null, state: "unavailable", resetsOn: "2026-10-28" }),
        line({ id: "vercel", source: "live", resetsOn: "2026-11-01" }),
        line({ id: "fly", source: "estimated", resetsOn: "2026-11-01" }),
        line({ id: "tesla", name: "Tesla Fleet API", source: "estimated", amount: 12, allowance: 10 }),
        line({ id: "google", name: "Google Maps Platform", source: "estimated", amount: 6, budget: 5 }),
      ],
      NOW,
    );
    expect(alerts.map((a) => a.text)).toEqual([
      "Email renews tomorrow.",
      "Domain renews in 12 days, on 7 Nov 2026.",
      "Tesla Fleet API is past its $10.00 monthly credit.",
      "Google Maps Platform is over its $5.00 budget.",
    ]);
  });
});

describe("what the owner types", () => {
  const ok = { name: "Email", amount: "1,200.50", period: "yearly", renewsOn: "2027-01-31", link: "https://example.com/billing" } as const;

  test("a full entry, in dollars", () => {
    expect(parseEntry(ok)).toEqual({ ok: true, value: { ...ok, amount: 1200.5, currency: "USD" } });
    expect(parseEntry({ ...ok, amount: "$12.50", currency: "USD" })).toMatchObject({ ok: true, value: { amount: 12.5 } });
  });

  test("empty date and link are left out", () => {
    const parsed = parseEntry({ ...ok, renewsOn: "", link: " " });
    expect(parsed.ok && parsed.value.renewsOn).toBeUndefined();
    expect(parsed.ok && parsed.value.link).toBeUndefined();
  });

  test("refuses what isn't a cost, and rupees", () => {
    for (const bad of [
      { amount: "-5" },
      { amount: "abc" },
      { amount: "1.234" },
      { amount: "" },
      { amount: "₹500" },
      { currency: "INR" },
      { period: "weekly" },
      { renewsOn: "2026-02-30" },
      { renewsOn: "tomorrow" },
      { name: "" },
      { name: "x".repeat(81) },
    ]) {
      expect(parseEntry({ ...ok, ...bad }).ok).toBe(false);
    }
    expect(parseEntry({ ...ok, currency: "INR" })).toEqual({ ok: false, message: "Enter amounts in dollars" });
  });

  test("links must be https: no javascript:, data: or plain http", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,hi", "http://example.com", "example.com", "https//x"]) {
      expect(parseEntry({ ...ok, link })).toEqual({ ok: false, message: "Links must start with https://" });
    }
  });

  test("the budget", () => {
    expect(parseBudget("")).toEqual({ ok: true, value: null });
    expect(parseBudget("5")).toEqual({ ok: true, value: 5 });
    expect(parseBudget("-1").ok).toBe(false);
  });
});
