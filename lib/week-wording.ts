// Home's AI tips on the last 7 days: the findings behind them (lib/ai-tips.ts has the prompt and the checks).
// Each comes from the owner's own data and says what helps: energy use against the week before and their
// usual, short trips, what charging cost against the stations they've used, what parking cost, charging above
// 90% and a tyre rotation coming up. Pure, so tested (test/week-wording.test.ts); components/tips-box.tsx
// shows them, and lib/server/ai-tips.ts makes the call and stores the tips, once a day.
import { type Finding, IMPACT, plural, type TipSurface } from "@/lib/ai-tips";
import { type PricedCharge, perKwh, stationPrices } from "@/lib/charge-tips";
import type { Drive, ParkedPeriod } from "@/lib/drives";
import type { DrivingPeriod } from "@/lib/driving-figures";
import { formatKwh, formatMoney, formatRangeKm } from "@/lib/format";
import { inSpan, type Timeframe } from "@/lib/periods";
import { formatWhPerKm } from "@/lib/seasons";
import { median } from "@/lib/telemetry-derive";
import { groupTrips } from "@/lib/trips";
import { ROTATE_EVERY_KM, tyreRotation } from "@/lib/tyre-rotation";

export const WEEK_TIPS: TipSurface = {
  scope: "week",
  version: 7,
  context:
    "The tips sit on the home page under the last 7 days' totals: distance, energy used, energy added and spend. Say something the totals don't. Call the 7 days \"this week\".",
};

const DAY = 86_400_000;
// A trip shorter than this is short: a cold start costs more per km.
const SHORT_KM = 5;
// The owner's usual energy use: the median of their drives in the last USUAL_DAYS, once there are enough.
const USUAL_DAYS = 30;
const MIN_USUAL_DRIVES = 5;
// A change smaller than this share is "about the same", not a tip.
const CHANGE = 0.05;
// A charge that ended above this level is a high charge.
const HIGH_LEVEL = 90;
// A tyre rotation this close is worth a tip.
const ROTATION_KM = 1000;

export type WeekInput = {
  frame: Timeframe;
  driving: DrivingPeriod | null;
  // The last 90 days' drives, any order.
  drives: Drive[];
  // Every billed charge the owner has (lib/charge-tips.ts pricedCharges).
  priced: PricedCharge[];
  parked: ParkedPeriod[];
  // The car's own charges, for the level each ended at.
  charges: { started_at: string; end_level: number | null }[];
  odometerKm: number | null;
  now: number;
};

const pct = (a: number, b: number) => (Math.abs(a - b) / b) * 100;

export function weekFindings(input: WeekInput): Finding[] {
  const { frame, driving, now } = input;
  const inWeek = (t: number) => inSpan(t, frame.span);
  const out: Finding[] = [];

  // Energy use against the week before and the owner's usual.
  const week = driving?.current.whPerKm ?? null;
  const before = driving?.previous?.whPerKm ?? null;
  const recent = input.drives.filter((d) => d.start >= now - USUAL_DAYS * DAY && d.start <= now && d.whPerKm !== null).map((d) => d.whPerKm!);
  const usual = recent.length >= MIN_USUAL_DRIVES ? median(recent) : null;
  if (week !== null && (before !== null || usual !== null)) {
    const change = Math.max(before === null ? 0 : pct(week, before), usual === null ? 0 : pct(week, usual));
    if (change >= CHANGE * 100) {
      out.push({
        kind: "energyUse",
        score: IMPACT.change(change),
        facts: { thisWeek: formatWhPerKm(week), weekBefore: before === null ? null : formatWhPerKm(before), usual: usual === null ? null : formatWhPerKm(usual), usualOver: usual === null ? null : `the last ${USUAL_DAYS} days` },
        say: `Your car used ${formatWhPerKm(week)} this week, against ${formatWhPerKm(usual ?? before!)} ${usual !== null ? "usually" : "the week before"}.`,
      });
    }
  }

  // Short trips, and what they cost per km against longer ones.
  const trips = groupTrips(input.drives.filter((d) => inWeek(d.start)));
  const short = trips.filter((t) => t.km < SHORT_KM && t.kwh !== null);
  const long = trips.filter((t) => t.km >= SHORT_KM && t.kwh !== null);
  const rate = (list: typeof trips) => (list.reduce((s, t) => s + t.kwh!, 0) * 1000) / list.reduce((s, t) => s + t.km, 0);
  if (short.length > 0 && long.length > 0) {
    const [s, l] = [rate(short), rate(long)];
    if (s >= l * (1 + CHANGE)) {
      out.push({
        kind: "shortTrips",
        score: IMPACT.change(pct(s, l)),
        facts: { shortTrips: short.length, trips: trips.length, shortUnderKm: SHORT_KM, shortTripsUsed: formatWhPerKm(s), longerTripsUsed: formatWhPerKm(l) },
        hint: "Joining errands into one trip uses less.",
        say: `${short.length} of your ${plural(trips.length, "trip")} were under ${SHORT_KM} km and used ${formatWhPerKm(s)}, against ${formatWhPerKm(l)} on longer ones. Joining errands into one trip uses less.`,
      });
    }
  }

  // This week's charging cost per kWh against the cheapest and dearest stations the owner has used.
  const thisWeek = input.priced.filter((c) => inWeek(c.at));
  const stations = stationPrices(input.priced);
  if (thisWeek.length > 0 && stations.length >= 2) {
    const kwh = thisWeek.reduce((s, c) => s + c.kwh, 0);
    const paid = thisWeek.reduce((s, c) => s + c.cost, 0) / kwh;
    const [cheapest, dearest] = [stations[0], stations.at(-1)!];
    const saved = (paid - cheapest.perKwh) * kwh;
    if (paid >= cheapest.perKwh * (1 + CHANGE)) {
      out.push({
        kind: "chargingCost",
        score: IMPACT.saves(saved),
        facts: {
          thisWeek: perKwh(paid),
          cheapest: { station: cheapest.name, price: perKwh(cheapest.perKwh) },
          dearest: { station: dearest.name, price: perKwh(dearest.perKwh) },
          atCheapestWouldHaveSaved: formatMoney(saved, "INR"),
        },
        say: `Charging cost ${perKwh(paid)} this week. At ${cheapest.name}, your cheapest at ${perKwh(cheapest.perKwh)}, it would have cost ${formatMoney(saved, "INR")} less.`,
      });
    }
  }

  // What the battery lost while parked this week, a day, in kWh and in rupees at what the owner pays.
  const parked = input.parked.filter((p) => inWeek(p.start) && p.kwh !== null && p.hours > 0);
  const hours = parked.reduce((s, p) => s + p.hours, 0);
  const lost = parked.reduce((s, p) => s + Math.max(0, p.kwh!), 0);
  const billedKwh = input.priced.reduce((s, c) => s + c.kwh, 0);
  const avgPrice = billedKwh > 0 ? input.priced.reduce((s, c) => s + c.cost, 0) / billedKwh : null;
  if (hours >= 24 && lost >= 0.1) {
    const perDay = (lost / hours) * 24;
    const rupees = avgPrice === null ? null : perDay * avgPrice;
    out.push({
      kind: "parkedLoss",
      score: rupees === null ? IMPACT.info(400) : IMPACT.saves(rupees * 7),
      facts: { lostPerDayParked: formatKwh(perDay), costPerDayParked: rupees === null ? null : formatMoney(rupees, "INR"), atWhatYouPay: avgPrice === null ? null : perKwh(avgPrice) },
      say: `Parked, your car lost about ${formatKwh(perDay)} a day this week${rupees === null ? "" : `, ${formatMoney(rupees, "INR")} at what you pay`}.`,
    });
  }

  // Charges this week that ended above 90%.
  const ended = input.charges.filter((c) => inWeek(Date.parse(c.started_at)) && c.end_level !== null);
  const high = ended.filter((c) => c.end_level! > HIGH_LEVEL);
  if (high.length > 0) {
    out.push({
      kind: "chargedAbove90",
      score: IMPACT.change(20 * high.length),
      facts: { chargesAbove90: high.length, charges: ended.length },
      hint: "Tesla suggests a daily limit of 90% or less.",
      say: `${high.length} of your ${plural(ended.length, "charge")} this week ended above 90%. For everyday driving, a limit of 90% or less is what Tesla suggests.`,
    });
  }

  // A tyre rotation coming up.
  const rotation = tyreRotation(input.odometerKm);
  if (rotation && rotation.toGoKm <= ROTATION_KM) {
    out.push({
      kind: "tyreRotation",
      score: IMPACT.change(50 + (ROTATION_KM - rotation.toGoKm) / 20),
      facts: { rotateAt: formatRangeKm(rotation.nextAtKm), toGo: formatRangeKm(rotation.toGoKm), every: formatRangeKm(ROTATE_EVERY_KM) },
      say: `A tyre rotation is due at ${formatRangeKm(rotation.nextAtKm)}, ${formatRangeKm(rotation.toGoKm)} from now. Tesla suggests one every ${formatRangeKm(ROTATE_EVERY_KM)}.`,
    });
  }
  return out;
}
