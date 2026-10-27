// The findings behind the charging tips (lib/ai-tips.ts): what each station the owner has used cost per kWh,
// how long DC charges spent above 80%, and how their energy split between AC and DC. For Stats > Charging
// (the owner's whole history, so no tip names a period the page's switch doesn't) and for one charge's page.
// Pure, so tested (test/charge-tips.test.ts).
import { type Finding, IMPACT, plural, type TipSurface } from "@/lib/ai-tips";
import { chargeName, invoiceName } from "@/lib/charge-names";
import { splitSite } from "@/lib/charge-sessions";
import { formatDate, formatDuration, formatLevels, formatMoney, formatPercent } from "@/lib/format";
import { median, num } from "@/lib/telemetry-derive";

export const CHARGING_TIPS: TipSurface = {
  scope: "charging",
  version: 2,
  noPeriod: true,
  context:
    "The tips sit at the top of the Charging page, over everything the owner has charged so far. Don't name a period such as \"this week\": the page's period switch shows that.",
};

export const CHARGE_TIPS: TipSurface = {
  scope: "charge",
  version: 2,
  context: "The tips sit on one charge's page, under its name, the day and the times. Call it \"this charge\".",
};

const MIN = 60_000;
// The level where a DC charger slows down a lot.
export const TAPER_LEVEL = 80;
// A charge counts as gone past 80% from this level up, so a few minutes' overshoot isn't a tip.
const PAST_LEVEL = 84;
// Two level readings further apart than this can't place when 80% was reached.
const LEVEL_GAP_MS = 10 * MIN;
// A station dearer than the cheapest by less than this share isn't worth a tip.
const WORTH = 0.1;
// The usual ₹/kWh needs at least this many other billed charges.
const MIN_USUAL_CHARGES = 3;

// One billed charge: Tesla's for a Supercharger, an attached invoice for anything else. name: as the app shows
// the station; area: its town when the bill says (a Supercharger site's city, the last part of an invoice's
// station address). Never a coordinate.
export type PricedCharge = { id: string; at: number; name: string | null; area: string | null; kwh: number; cost: number; kind: "ac" | "dc" };

type TeslaBilled = { session_id: number | string; started_at: string; site_name: string | null; cost_total: number | null; energy_kwh: number | null };
type StreamBilled = { id: number; started_at: string; kind: "ac" | "dc"; energy_added_kwh: number | null };
type Invoice = { amount: number; kwhBilled: number | null; network?: string | null; station?: string | null };

// The last part of an address ("Sri Sakthi Agency, Bhavani Road, Anthiyur" is in Anthiyur), when it has more
// than one part.
function townOf(address: string | null | undefined): string | null {
  const parts = (address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-1)! : null;
}

// Every billed charge with its kWh and cost known. Pass only the streamed sessions Tesla didn't bill.
export function pricedCharges(tesla: TeslaBilled[], streamOnly: StreamBilled[], invoices: ReadonlyMap<number, Invoice>): PricedCharge[] {
  const out: PricedCharge[] = [];
  for (const s of tesla) {
    if (s.cost_total === null || !(s.energy_kwh && s.energy_kwh > 0)) continue;
    out.push({ id: `t${s.session_id}`, at: Date.parse(s.started_at), name: chargeName({ site: s.site_name })?.text ?? null, area: s.site_name ? splitSite(s.site_name).city : null, kwh: s.energy_kwh, cost: s.cost_total, kind: "dc" });
  }
  for (const s of streamOnly) {
    const invoice = invoices.get(s.id);
    const kwh = invoice?.kwhBilled ?? s.energy_added_kwh;
    if (!invoice || !(kwh && kwh > 0)) continue;
    out.push({ id: `s${s.id}`, at: Date.parse(s.started_at), name: invoiceName(invoice.network ?? null, invoice.station), area: townOf(invoice.station), kwh, cost: invoice.amount, kind: s.kind });
  }
  return out.sort((a, b) => a.at - b.at);
}

export type StationPrice = { name: string; area: string | null; kwh: number; cost: number; perKwh: number; charges: number };

// What each named station has cost per kWh, over every billed charge there.
export function stationPrices(priced: PricedCharge[]): StationPrice[] {
  const rows = new Map<string, StationPrice>();
  for (const c of priced) {
    if (!c.name) continue;
    const row = rows.get(c.name) ?? { name: c.name, area: c.area, kwh: 0, cost: 0, perKwh: 0, charges: 0 };
    row.kwh += c.kwh;
    row.cost += c.cost;
    row.charges += 1;
    row.area ??= c.area;
    rows.set(c.name, row);
  }
  return [...rows.values()].map((r) => ({ ...r, perKwh: r.cost / r.kwh })).sort((a, b) => a.perKwh - b.perKwh);
}

export const perKwh = (value: number) => `${formatMoney(value, "INR")}/kWh`;
const money = (value: number) => formatMoney(value, "INR");
const sameArea = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

// How long a charge took to reach 80% and how long it ran above it, from its battery level readings (each
// reading where the level was then). 80% is placed between the two readings either side of it, which must be
// close enough to tell. Null when the charge didn't cross 80% or the readings can't place it.
export type Taper = { startLevel: number; endLevel: number; belowMs: number; aboveMs: number };

export function taperTimes(levels: { t: number; v: number }[], start: number, end: number, startLevel: number | null, endLevel: number | null): Taper | null {
  if (startLevel === null || endLevel === null || startLevel >= TAPER_LEVEL || endLevel < PAST_LEVEL || end <= start) return null;
  const inside = levels.filter((p) => p.t >= start && p.t <= end).sort((a, b) => a.t - b.t);
  for (let k = 1; k < inside.length; k++) {
    const [a, b] = [inside[k - 1], inside[k]];
    if (a.v < TAPER_LEVEL && b.v >= TAPER_LEVEL) {
      if (b.t - a.t > LEVEL_GAP_MS) return null;
      const at = a.t + ((TAPER_LEVEL - a.v) / (b.v - a.v)) * (b.t - a.t);
      return { startLevel, endLevel, belowMs: at - start, aboveMs: end - at };
    }
  }
  return null;
}

const minutes = (ms: number) => formatDuration(ms / 1000);

// The DC charges with their taper, newest first, for Stats > Charging.
export type TaperedCharge = { at: number; taper: Taper };

const TAPER_HINT = "Above 80% a DC charger slows down, so moving on at 80% is quicker.";

// Stats > Charging: over everything the owner has charged.
export function chargingFindings(input: { priced: PricedCharge[]; energy: { ac: number; dc: number }; dcWithCurves: number; tapered: TaperedCharge[] }): Finding[] {
  const out: Finding[] = [];
  const stations = stationPrices(input.priced);

  // The same town, a cheaper station and a dearer one the owner has used: the most direct saving.
  const local = areaPair(stations);
  if (local) {
    const { area, cheaper, dearer } = local;
    const extra = (dearer.perKwh - cheaper.perKwh) * dearer.kwh;
    out.push({
      kind: "cheaperNearby",
      score: IMPACT.saves(extra),
      facts: { town: area, cheaper: { station: cheaper.name, price: perKwh(cheaper.perKwh) }, dearer: { station: dearer.name, price: perKwh(dearer.perKwh), charges: dearer.charges }, paidExtra: money(extra) },
      say: `In ${area}, ${cheaper.name} has cost ${perKwh(cheaper.perKwh)} against ${perKwh(dearer.perKwh)} at ${dearer.name}. Choosing it saves money.`,
    });
  }
  // The cheapest and dearest stations overall, when they're not the pair above.
  if (stations.length >= 2) {
    const [cheapest, dearest] = [stations[0], stations.at(-1)!];
    const shown = local && local.cheaper.name === cheapest.name && local.dearer.name === dearest.name;
    if (!shown && dearest.perKwh >= cheapest.perKwh * (1 + WORTH)) {
      const extra = (dearest.perKwh - cheapest.perKwh) * dearest.kwh;
      out.push({
        kind: "stationPrices",
        score: IMPACT.saves(extra),
        facts: { cheapest: { station: cheapest.name, price: perKwh(cheapest.perKwh) }, dearest: { station: dearest.name, price: perKwh(dearest.perKwh), charges: dearest.charges }, paidExtraAtDearest: money(extra) },
        hint: "Charge at the cheaper one when it's on your way.",
        say: `${cheapest.name} has cost you ${perKwh(cheapest.perKwh)}, against ${perKwh(dearest.perKwh)} at ${dearest.name}. Picking the cheaper one saves money.`,
      });
    }
  }
  // DC charges that ran on past 80%.
  const tapered = input.tapered.filter((c) => c.taper.aboveMs >= 3 * MIN);
  if (tapered.length > 0) {
    const above = tapered.reduce((sum, c) => sum + c.taper.aboveMs, 0);
    const longest = tapered.reduce((a, c) => (c.taper.aboveMs > a.taper.aboveMs ? c : a));
    const t = longest.taper;
    out.push({
      kind: "pastEighty",
      score: IMPACT.saves(above / MIN),
      facts: {
        dcChargesPast80: tapered.length,
        dcChargesLooked: input.dcWithCurves,
        timeAbove80: minutes(above),
        longest: { date: formatDate(longest.at), upTo80: formatLevels(t.startLevel, TAPER_LEVEL), tookUpTo80: minutes(t.belowMs), past80: formatLevels(TAPER_LEVEL, t.endLevel), tookPast80: minutes(t.aboveMs) },
      },
      hint: TAPER_HINT,
      say: `${plural(tapered.length, "DC charge")} went past 80%, spending ${minutes(above)} above it. The charger slows down there, so moving on at 80% is quicker.`,
    });
  }
  // How the energy split between AC and DC, and what each cost per kWh when the bills say.
  const { ac, dc } = input.energy;
  if (ac > 0 && dc > 0) {
    const acPriced = input.priced.filter((c) => c.kind === "ac");
    const dcPriced = input.priced.filter((c) => c.kind === "dc");
    const rate = (list: PricedCharge[]) => (list.length ? list.reduce((s, c) => s + c.cost, 0) / list.reduce((s, c) => s + c.kwh, 0) : null);
    const [acRate, dcRate] = [rate(acPriced), rate(dcPriced)];
    const dcShare = (dc / (ac + dc)) * 100;
    // The general rule only when the owner's own bills don't say otherwise.
    const cheaperAc = acRate === null || dcRate === null || acRate < dcRate;
    out.push({
      kind: "acAndDc",
      score: IMPACT.info(300 + dcShare),
      facts: { acShareOfEnergy: formatPercent(100 - dcShare), dcShareOfEnergy: formatPercent(dcShare), acPrice: acRate === null ? null : perKwh(acRate), dcPrice: dcRate === null ? null : perKwh(dcRate) },
      ...(cheaperAc ? { hint: "AC charging usually costs less per kWh than DC." } : {}),
      say: `${formatPercent(dcShare)} of your energy came from DC chargers and ${formatPercent(100 - dcShare)} from AC.${acRate !== null && dcRate !== null ? ` AC has cost you ${perKwh(acRate)} and DC ${perKwh(dcRate)}.` : ""}`,
    });
  }
  return out;
}

// In one town, the cheapest and the dearest station the owner has used there, when they differ enough. The
// town where the dearer one cost the most extra.
function areaPair(stations: StationPrice[]): { area: string; cheaper: StationPrice; dearer: StationPrice } | null {
  let best: { area: string; cheaper: StationPrice; dearer: StationPrice; extra: number } | null = null;
  for (const cheaper of stations) {
    for (const dearer of stations) {
      if (cheaper === dearer || !sameArea(cheaper.area, dearer.area) || dearer.perKwh < cheaper.perKwh * (1 + WORTH)) continue;
      const extra = (dearer.perKwh - cheaper.perKwh) * dearer.kwh;
      if (!best || extra > best.extra) best = { area: cheaper.area!, cheaper, dearer, extra };
    }
  }
  return best;
}

// One charge's page: this charge against the owner's other billed charges.
export function chargeFindings(input: { charge: PricedCharge | null; others: PricedCharge[]; kind: "ac" | "dc"; taper: Taper | null }): Finding[] {
  const out: Finding[] = [];
  const { charge, others } = input;
  if (charge) {
    const price = charge.cost / charge.kwh;
    const stations = stationPrices(others).filter((s) => s.name !== charge.name);
    // A cheaper station the owner has used in the same town.
    const nearby = stations.find((s) => sameArea(s.area, charge.area) && price >= s.perKwh * (1 + WORTH));
    if (nearby) {
      const saved = (price - nearby.perKwh) * charge.kwh;
      out.push({
        kind: "cheaperNearby",
        score: IMPACT.saves(saved),
        facts: { thisCharge: perKwh(price), town: charge.area, cheaper: { station: nearby.name, price: perKwh(nearby.perKwh) }, wouldHaveSaved: money(saved) },
        say: `This charge cost ${perKwh(price)}. In ${charge.area}, ${nearby.name} has cost you ${perKwh(nearby.perKwh)}, which would have saved ${money(saved)} here.`,
      });
    }
    // Against the owner's cheapest station and their usual.
    const prices = others.map((c) => c.cost / c.kwh);
    const middle = prices.length >= MIN_USUAL_CHARGES ? median(prices) : null;
    // The usual only when this charge differs from it: "the same as usual" says nothing.
    const usual = middle !== null && Math.abs(price - middle) / middle >= WORTH ? middle : null;
    const cheapest = stations[0] && stations[0].name !== nearby?.name && price >= stations[0].perKwh * (1 + WORTH) ? stations[0] : null;
    if (cheapest || usual !== null) {
      const saved = cheapest ? (price - cheapest.perKwh) * charge.kwh : 0;
      out.push({
        kind: "thisChargePrice",
        score: cheapest ? IMPACT.saves(saved) : IMPACT.change((Math.abs(price - usual!) / usual!) * 100),
        facts: {
          thisCharge: perKwh(price),
          usual: usual === null ? null : perKwh(usual),
          cheapest: cheapest ? { station: cheapest.name, price: perKwh(cheapest.perKwh), wouldHaveSaved: money(saved) } : null,
        },
        say: cheapest
          ? `This charge cost ${perKwh(price)}, against ${perKwh(cheapest.perKwh)} at ${cheapest.name}, your cheapest. Charging there would have saved ${money(saved)}.`
          : `This charge cost ${perKwh(price)}, against your usual ${perKwh(usual!)}.`,
      });
    }
  }
  const t = input.taper;
  if (input.kind === "dc" && t && t.aboveMs >= 3 * MIN) {
    out.push({
      kind: "pastEighty",
      score: IMPACT.saves(t.aboveMs / MIN),
      facts: { upTo80: formatLevels(t.startLevel, TAPER_LEVEL), tookUpTo80: minutes(t.belowMs), past80: formatLevels(TAPER_LEVEL, t.endLevel), tookPast80: minutes(t.aboveMs) },
      hint: TAPER_HINT,
      say: `Going ${formatLevels(TAPER_LEVEL, t.endLevel)} took ${minutes(t.aboveMs)}, against ${minutes(t.belowMs)} for ${formatLevels(t.startLevel, TAPER_LEVEL)}. Moving on at 80% is usually quicker.`,
    });
  }
  return out;
}

// What the owner pays per kWh on average, over every billed charge, or null with none.
export function averagePrice(priced: PricedCharge[]): number | null {
  const kwh = priced.reduce((s, c) => s + c.kwh, 0);
  return kwh > 0 ? priced.reduce((s, c) => s + c.cost, 0) / kwh : null;
}

// Battery level readings as points for taperTimes.
export function levelSeries(readings: { at: string; value: unknown }[]): { t: number; v: number }[] {
  return readings.flatMap((r) => {
    const v = num(r.value);
    return v === null ? [] : [{ t: Date.parse(r.at), v }];
  });
}
