import { hasCosts, type Listed, listSessions, sessionView, streamName, withSpots } from "@/components/session-row";
import type { ChargeRow, MonthTotal } from "@/components/stats/session-rows";
import { matchSessions } from "@/lib/charge-sessions";
import { formatMoney, formatMonth } from "@/lib/format";
import { type Shown, SHOWS_ALL } from "@/lib/view-links";
import { serials } from "@/lib/kept";
import { inSpan, type Span } from "@/lib/periods";
import { type StationRow, topStations } from "@/lib/top-stations";
import { type ChargingExtras, loadChargingExtras } from "@/lib/server/charging-extra";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";
import type { Owner } from "@/lib/server/auth";
import { withGoogleNamesBy } from "@/lib/server/google-place-names";
import { invoicesBySession } from "@/lib/server/receipts";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";

// What the Charging page's lists are drawn from, read by the page and by the "Show more" actions beside it
// (app/stats/charging/actions.ts), so the two always agree.
export type ChargingLists = {
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  invoices: Awaited<ReturnType<typeof invoicesBySession>>;
  extras: ChargingExtras;
};

// The session rows get a Google-tagged spot's live name; the pins and curves keep `name`.
export const withGoogleNames = (owner: Owner) => async (x: ChargingExtras) => ({ ...x, spots: await withGoogleNamesBy(owner, x.spots) });

// The invoices need only the car's charges, so they don't wait for Tesla's. With a span (a range picked by
// date), that range's extras are read alongside every charge's, from the same sessions and invoices.
export async function loadChargingLists(owner: Owner, vin: string | null, now: number, span: Span | null = null): Promise<ChargingLists & { rangeExtras: ChargingExtras | null }> {
  const stream = loadStreamSessions(owner);
  const [sessions, streamSessions, invoices] = await Promise.all([
    loadChargingSessions(owner),
    stream,
    stream.then((s) => invoicesBySession(owner, s.filter((c) => !c.supercharger).map((c) => c.id))),
  ]);
  const sources = { tesla: sessions, invoices, now };
  const [extras, rangeExtras] = await Promise.all([
    loadChargingExtras(owner, vin, streamSessions, sources).then(withGoogleNames(owner)),
    span ? loadChargingExtras(owner, vin, streamSessions.filter(startedIn(span)), sources).then(withGoogleNames(owner)) : null,
  ]);
  return { sessions, streamSessions, invoices, extras, rangeExtras };
}

export const startedIn = (span: Span) => (s: { started_at: string }) => inSpan(Date.parse(s.started_at), span);

// Every charge, newest first, each named from its spot when the page has it (the latest PINNED charges), the
// owner's tag first; and the ones only the car reported.
export function listCharges({ sessions, streamSessions, invoices, extras }: ChargingLists, now: number) {
  const { pairs, streamOnly } = matchSessions(sessions, streamSessions, now);
  return { listed: withSpots(listSessions(pairs, streamOnly, invoices), extras.spots), streamOnly };
}

// Where you charge most in the span, all of them (see topStations).
export function stationsIn(span: Span, { sessions, invoices, extras }: ChargingLists, streamOnly: StreamChargeSession[]): StationRow[] {
  const ownName = (s: StreamChargeSession) => {
    const name = extras.spots[s.id]?.name;
    return name?.source === "tag" ? name.text : null;
  };
  return topStations([
    ...sessions.filter(startedIn(span)).map((s) => ({ name: s.site_name, kwh: s.energy_kwh, cost: s.cost_total })),
    ...streamOnly
      .filter((s) => s.ended_at !== null && startedIn(span)(s))
      // Named by the owner's tag, the station check or the invoice; an area name is a place, not a station.
      .map((s) => ({ name: ownName(s) ?? streamName(s, invoices.get(s.id))?.text ?? null, kwh: s.energy_added_kwh, cost: invoices.get(s.id)?.amount ?? null })),
  ]);
}

// The station a charge counts for, named as stationsIn names it; null for a charge at no named station
// or one still going.
function stationOf(item: Listed): string | null {
  if (item.tesla) return item.tesla.site_name || null;
  const s = item.stream;
  if (!s || s.ended_at === null) return null;
  return (item.spot?.name?.source === "tag" ? item.spot.name.text : null) ?? streamName(s, item.invoice)?.text ?? null;
}

// The station used most in these charges: most charges, then most energy. Null unless there are two or
// more stations, as one station being the most used says nothing.
function mostUsedStation(items: Listed[]): string | null {
  const tally = new Map<string, { charges: number; kwh: number }>();
  for (const item of items) {
    const name = stationOf(item);
    if (!name) continue;
    const t = tally.get(name) ?? { charges: 0, kwh: 0 };
    t.charges++;
    t.kwh += (item.tesla ? item.tesla.energy_kwh : item.stream?.energy_added_kwh) ?? 0;
    tally.set(name, t);
  }
  if (tally.size < 2) return null;
  return [...tally].sort(([, a], [, b]) => b.charges - a.charges || b.kwh - a.kwh)[0][0];
}

// What a month of charges was billed: Tesla's bills and the invoices attached, as in Summary.
function billed(rows: Listed[]) {
  const costs = rows.flatMap((r) => (r.tesla ? (r.tesla.cost_total === null ? [] : [r.tesla.cost_total]) : r.invoice ? [r.invoice.amount] : []));
  return costs.length > 0 ? formatMoney(costs.reduce((sum, n) => sum + n, 0), rows.find((r) => r.tesla?.currency)?.tesla?.currency ?? "INR") : null;
}

// A period's charges (newest first) as list rows, numbered from the top row, 1: the charts in that period
// use the same numbers (see streamSerial in the page). `costs` and the month totals are over all of them.
// `shown`: what the reader may see; a view link that hides locations gets "Hidden" where a place goes.
export function chargeRows(inPeriod: Listed[], shown: Shown = SHOWS_ALL): { rows: ChargeRow[]; months: MonthTotal[]; costs: boolean } {
  const serial = serials(inPeriod, (s) => s.key);
  const costs = hasCosts(inPeriod);
  // Over the whole period, not the page of rows sent first, so rows fetched later are marked too.
  const mostUsed = mostUsedStation(inPeriod);
  const byMonth = new Map<string, Listed[]>();
  for (const s of inPeriod) {
    const month = formatMonth(s.started_at);
    byMonth.set(month, [...(byMonth.get(month) ?? []), s]);
  }
  return {
    rows: inPeriod.map((s) => ({ key: s.key, month: formatMonth(s.started_at), view: { ...sessionView(s, serial.get(s.key) ?? 0, undefined, costs, shown), mostUsed: mostUsed !== null && stationOf(s) === mostUsed } })),
    months: [...byMonth].map(([month, rows]) => ({ month, count: rows.length, billed: billed(rows) })),
    costs,
  };
}
