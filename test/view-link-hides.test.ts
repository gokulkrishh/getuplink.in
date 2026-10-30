import { beforeEach, describe, expect, mock, test } from "bun:test";
import { packReadings } from "@/lib/drive-archive";
import type { Drive } from "@/lib/drives";
import { FakeDb } from "./fake-db";

// What a guest link leaves out never leaves the server. A made-up car is seeded with marker values: a place the
// owner named, an area name, coordinates to 6 decimals, a station name, a Supercharger site, an attached
// invoice (its number, network, station and a printed station ID) and Tesla's invoice id, and what charges
// cost. Each read a guest reaches (the page loaders' lib reads and every "Show more" action) is run, and what
// it returns is serialised (JSON.stringify: what a page passes on toward the browser). The owner's own read
// shows every marker, so the checks can't pass on empty output. A guest never gets an invoice; with Hide
// locations, no place either, and "Hidden" where one was. Costs are always shared. Made-up data only.

let fake: FakeDb;
const jar = new Map<string, string>();

mock.module("server-only", () => ({}));
mock.module("@/lib/server/supabase", () => ({ db: () => fake.client() }));
mock.module("@/lib/server/crypto", () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }));
mock.module("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
  headers: async () => new Headers({ host: "app.getuplink.in" }),
}));
mock.module("next/navigation", () => ({
  unstable_rethrow: () => {},
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
const realServer = await import("next/server");
mock.module("next/server", () => ({ ...realServer, connection: async () => {}, after: () => {} }));

process.env.TOKEN_ENCRYPTION_KEY ??= "test-key-not-a-secret";
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "TESLA_CLIENT_ID", "TESLA_CLIENT_SECRET", "TESLA_REDIRECT_URI"]) process.env[name] ??= "test";
// Nothing here may ask anyone outside Uplink: every fetch is refused.
globalThis.fetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;

const { asOwner, asViewer, shownTo } = await import("@/lib/server/data/owner");
const views = await import("@/lib/server/view-links");
const { VIEW_COOKIE, VIEW_PENDING_COOKIE } = await import("@/lib/view-cookie");
const { createSession, SESSION_COOKIE } = await import("@/lib/session");
const { HIDDEN_PLACE } = await import("@/lib/view-links");
const { GET: openLink } = await import("@/app/v/[token]/route");
const { POST: seen } = await import("@/app/v/seen/route");
const { chargeRows, listCharges, loadChargingLists } = await import("@/lib/server/charging-lists");
const { loadChargeDetail } = await import("@/lib/server/charge-curve");
const { loadChargeSpots } = await import("@/lib/server/charging-extra");
const { loadChargingSessions } = await import("@/lib/server/charging");
const { loadStreamSessions } = await import("@/lib/server/stream-charging");
const { invoicesBySession, sessionInvoice } = await import("@/lib/server/receipts");
const { loadTripPlaces } = await import("@/lib/server/trip-places");
const { loadDrivingExtrasFor } = await import("@/lib/server/driving-extra");
const { withGooglePlaces } = await import("@/lib/server/driving-places");
const { loadParkedPlaces } = await import("@/lib/server/parked-places");
const { loadDriveDetail } = await import("@/lib/server/drive-detail");
const { loadLastCharge } = await import("@/lib/server/car");
const { loadWindowStats } = await import("@/lib/server/driving");
const { loadUserPlaces } = await import("@/lib/server/user-places");
const { placeKey } = await import("@/lib/server/place-names");
const { loadPricedCharges } = await import("@/lib/server/charge-tips");
const { loadTipsBox } = await import("@/components/tips-box");
const { moreCharges } = await import("@/app/stats/charging/actions");
const { morePlaces, moreTrips } = await import("@/app/stats/driving/actions");
const { moreParked } = await import("@/app/stats/battery/actions");

const VIN = "TESTVIN0000000HIDES";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (t: number) => new Date(t).toISOString();

// Two made-up spots: one the owner named, one with only an area name kept.
const TAGGED = { latitude: 19.123456, longitude: 72.987654 };
const AREA = { latitude: 18.654321, longitude: 73.123456 };
const at = (p: typeof TAGGED) => ({ lat: p.latitude, lng: p.longitude });

// Places the guest sees unless the link hides locations.
const LOCATION_MARKERS = ["19.123456", "72.987654", "18.654321", "73.123456", "Marker Tag Place", "Marker Area Name", "Marker Station Name", "Marker Site"];
// What charging cost: always shared.
const COST_MARKERS = ["987.65", "543.21", "₹"];
// The invoices themselves: the owner's only.
const INVOICE_MARKERS = ["INV-MARKER-4321", "marker-content-id", "MadeUpNet", "Marker Receipt Station", "MARKER-STN-77", "/api/charging/"];

// A drive 100 days ago, kept only in the archive, from the named spot to the area; one 3 days ago, live,
// that parks at the area; an AC charge at the named spot (station name, invoice), and a Supercharger
// charge Tesla billed.
const OLD: Drive = { start: NOW - 100 * DAY, end: NOW - 100 * DAY + 20 * MIN, km: 12, kwh: 2, whPerKm: 160, startLevel: 80, endLevel: 76 };
const RECENT: Drive = { start: NOW - 3 * DAY, end: NOW - 3 * DAY + 20 * MIN, km: 9, kwh: 1.5, whPerKm: 160, startLevel: 70, endLevel: 67 };
const AC_START = NOW - 2 * DAY;
const DC_START = NOW - 1 * DAY;

function tripLocations(drive: Drive, from: typeof TAGGED, to: typeof TAGGED) {
  const out = [
    { at: iso(drive.start - 10 * MIN), value: from },
    { at: iso(drive.start), value: from },
  ];
  for (let t = drive.start + MIN; t < drive.end; t += 4 * MIN) out.push({ at: iso(t), value: t < (drive.start + drive.end) / 2 ? from : to });
  out.push({ at: iso(drive.end), value: to }, { at: iso(drive.end + 2 * MIN), value: to });
  return out;
}

function seed() {
  const live = [
    ...tripLocations(RECENT, TAGGED, AREA),
    { at: iso(AC_START - 2 * MIN), value: TAGGED },
    { at: iso(AC_START + 2 * MIN), value: TAGGED },
    { at: iso(DC_START - 2 * MIN), value: AREA },
    { at: iso(DC_START + 2 * MIN), value: AREA },
  ];
  fake = new FakeDb({
    users: [{ id: 1, tesla_sub: "made-up-owner", status: "approved", role: "user", sessions_valid_after: "-infinity", signed_out_sessions: [], created_at: "2026-01-01T00:00:00Z" }],
    car_view_links: [],
    vehicles: [{ id: 11, user_id: 1, vin: VIN, display_name: "Made-up Car", created_at: "2026-01-01T00:00:00Z" }],
    telemetry_readings: [
      ...live.map((r) => ({ vin: VIN, field: "Location", created_at: r.at, value: r.value })),
      { vin: VIN, field: "LocatedAtHome", created_at: iso(RECENT.end), value: true },
    ],
    user_drive_archive: [
      {
        user_id: 1,
        vin: VIN,
        start_at: iso(OLD.start),
        end_at: iso(OLD.end),
        readings_from: iso(OLD.start - 30 * MIN),
        readings_to: iso(OLD.end + 10 * MIN),
        drive: OLD,
        readings: packReadings({ Location: tripLocations(OLD, TAGGED, AREA) }),
      },
    ],
    user_places: [{ id: 1, user_id: 1, name: "Marker Tag Place", google_place_id: null, lat: TAGGED.latitude, lng: TAGGED.longitude, radius_m: 150, updated_at: iso(NOW - 10 * DAY) }],
    place_names: [{ key: placeKey(at(AREA)), name: "Marker Area Name, Made-up City" }],
    stream_charge_sessions: [
      {
        id: 501,
        user_id: 1,
        vin: VIN,
        started_at: iso(AC_START),
        ended_at: iso(AC_START + 2 * HOUR),
        kind: "ac",
        supercharger: false,
        energy_added_kwh: 20,
        start_level: 40,
        end_level: 70,
        station_name: "Marker Station Name",
      },
      { id: 502, user_id: 1, vin: VIN, started_at: iso(DC_START), ended_at: iso(DC_START + 40 * MIN), kind: "dc", supercharger: true, energy_added_kwh: 30, start_level: 20, end_level: 70, station_name: "Marker Station Name" },
    ],
    charging_sessions: [
      {
        user_id: 1,
        session_id: "made-up-tesla-1",
        vehicle_vin: VIN,
        site_name: "Marker Site, Made-up City",
        started_at: iso(DC_START),
        stopped_at: iso(DC_START + 40 * MIN),
        energy_kwh: 30,
        cost_total: 987.65,
        currency: "INR",
        invoices: [{ fileName: "made-up.pdf", contentId: "marker-content-id", invoiceType: "IMMEDIATE" }],
        fees: null,
      },
    ],
    charge_receipts: [
      {
        user_id: 1,
        session_id: 501,
        network: "MadeUpNet",
        station: "Marker Receipt Station",
        amount_total: 543.21,
        gst: 82.86,
        kwh_billed: 20,
        energy_amount: 460.35,
        invoice_number: "INV-MARKER-4321",
        invoice_path: "1/501.pdf",
        started_at: iso(AC_START),
        ended_at: iso(AC_START + 2 * HOUR),
        details: [{ label: "Station ID", value: "MARKER-STN-77" }],
      },
    ],
  });
  fake.autoIds.add("car_view_links");
}

type Hides = { hideLocations: boolean };

// Opens a guest link with these hides, as a browser would, so the actions read as its guest.
async function viewAs(hides: Hides): Promise<void> {
  const made = await views.makeViewLink(asOwner(1, "made-up-owner"), "Dad", "30m", Date.now(), hides);
  if (!("token" in made)) throw new Error(`refused: ${made.refused}`);
  // /v/<token> sets the pending cookie; /v/open's claim (/v/seen) turns it into the viewer cookie.
  const res = await openLink(new Request(`https://app.getuplink.in/v/${made.token}`, { headers: { host: "app.getuplink.in" } }), { params: Promise.resolve({ token: made.token }) });
  const pending = res.headers.getSetCookie().find((c) => c.startsWith(`${VIEW_PENDING_COOKIE}=`) && !c.includes("Max-Age=0"));
  if (!pending) throw new Error("no pending cookie");
  jar.set(VIEW_PENDING_COOKIE, pending.split(";")[0].slice(VIEW_PENDING_COOKIE.length + 1));
  const claimed = await seen(new Request("https://app.getuplink.in/v/seen", { method: "POST", headers: { host: "app.getuplink.in", origin: "https://app.getuplink.in" } }));
  jar.delete(VIEW_PENDING_COOKIE);
  const set = claimed.headers.getSetCookie().find((c) => c.startsWith(`${VIEW_COOKIE}=`) && !c.includes("Max-Age=0"));
  if (!set) throw new Error("no viewer cookie");
  jar.set(VIEW_COOKIE, set.split(";")[0].slice(VIEW_COOKIE.length + 1));
}

const ALL = { period: "all", query: null } as const;
type Who = { owner: true } | Hides;

// Every read a viewer reaches, by name, as what it returns.
async function reads(who: Who): Promise<Record<string, unknown>> {
  let owner;
  if ("owner" in who) {
    owner = asOwner(1, "made-up-owner");
    jar.set(SESSION_COOKIE, await createSession(1));
  } else {
    owner = asViewer(1, "made-up-owner", who.hideLocations ? ["locations"] : []);
    await viewAs(who);
  }
  const now = Date.now();
  const lists = await loadChargingLists(owner, VIN, now);
  const { listed } = listCharges(lists, now);
  const { driving } = await loadWindowStats(owner, VIN, now);
  const streams = await loadStreamSessions(owner);
  const tesla = await loadChargingSessions(owner);
  return {
    // The Charging page's read, and the rows its list sends to the browser.
    chargingLists: lists,
    chargeRows: chargeRows(listed, shownTo(owner)),
    chargeSpots: await loadChargeSpots(owner, VIN, streams, { tesla, invoices: lists.invoices, now }),
    // A charge's page, for the AC charge with its invoice and the Supercharger one Tesla billed.
    chargeDetailAc: await loadChargeDetail(owner, 501, now),
    chargeDetailDc: await loadChargeDetail(owner, 502, now),
    invoices: [...(await invoicesBySession(owner, [501]))],
    sessionInvoice: await sessionInvoice(owner, 501),
    pricedCharges: await loadPricedCharges(owner, now),
    // The Driving page: trip names, places, everywhere it went; a trip's page.
    windowDrives: driving.drives,
    tripPlaces: await loadTripPlaces(owner, VIN, [RECENT, OLD]),
    drivingExtras: await loadDrivingExtrasFor(owner, VIN, [RECENT], [{ from: now - 30 * DAY, to: now }]).then(withGooglePlaces(owner)),
    driveDetail: await loadDriveDetail(owner, OLD.start, now),
    // The Battery page's parked places, and the Car page's last charge.
    parkedPlaces: await loadParkedPlaces(owner, VIN, [RECENT.end]),
    lastCharge: await loadLastCharge(owner, VIN),
    userPlaces: await loadUserPlaces(owner),
    // Every "Show more" a viewer may call.
    moreCharges: await moreCharges(ALL, 0),
    moreTrips: await moreTrips(ALL, 0),
    morePlaces: await morePlaces({ period: "month", query: null }, 0),
    moreParked: await moreParked(ALL, 0),
  };
}

beforeEach(() => {
  jar.clear();
  seed();
});


const shownMarkers = (out: unknown, markers: string[]) => markers.filter((m) => JSON.stringify(out).includes(m));
// The reads with a place to show, where a guest whose link hides locations sees "Hidden".
const PLACE_READS = ["chargeRows", "moreCharges", "moreTrips", "lastCharge"];

describe("a guest link's hides, left out on the server", () => {
  test("the owner's own reads show every marker (so the checks below aren't vacuous)", async () => {
    const out = await reads({ owner: true });
    for (const markers of [LOCATION_MARKERS, COST_MARKERS, INVOICE_MARKERS]) expect(shownMarkers(out, markers)).toEqual(markers);
    // Each location path has something to hide, so each is checked, not just the sum.
    for (const name of ["chargingLists", "chargeRows", "chargeSpots", "chargeDetailAc", "chargeDetailDc", "tripPlaces", "drivingExtras", "driveDetail", "parkedPlaces", "lastCharge", "moreCharges", "moreTrips"]) {
      expect({ name, shown: shownMarkers(out[name], LOCATION_MARKERS).length > 0 }).toEqual({ name, shown: true });
    }
    for (const name of ["chargingLists", "chargeRows", "chargeDetailAc", "invoices", "sessionInvoice", "moreCharges"]) {
      expect({ name, shown: shownMarkers(out[name], INVOICE_MARKERS).length > 0 }).toEqual({ name, shown: true });
    }
    expect(JSON.stringify(out)).not.toContain(`"${HIDDEN_PLACE}"`);
  });

  test("a guest sees places and costs, never an invoice", async () => {
    const out = await reads({ hideLocations: false });
    for (const [name, value] of Object.entries(out)) expect({ name, shown: shownMarkers(value, INVOICE_MARKERS) }).toEqual({ name, shown: [] });
    expect(shownMarkers(out, LOCATION_MARKERS)).toEqual(LOCATION_MARKERS);
    expect(shownMarkers(out, COST_MARKERS)).toEqual(COST_MARKERS);
  });

  test("Hide locations: no place, coordinate, station or site reaches any read, and \"Hidden\" stands where one was; costs still show", async () => {
    const out = await reads({ hideLocations: true });
    for (const [name, value] of Object.entries(out)) expect({ name, shown: shownMarkers(value, [...LOCATION_MARKERS, ...INVOICE_MARKERS]) }).toEqual({ name, shown: [] });
    expect(shownMarkers(out, COST_MARKERS)).toEqual(COST_MARKERS);
    for (const name of PLACE_READS) expect({ name, hidden: JSON.stringify(out[name]).includes(`"${HIDDEN_PLACE}"`) }).toEqual({ name, hidden: true });
    expect(JSON.stringify(out)).not.toContain("Place not known");
    // No location reading was even asked for.
    expect(fake.calls.filter((c) => c.table === "user_telemetry_readings" && c.filters.some((f) => /field in \(.*Location/.test(f)) && !c.filters.some((f) => f.includes("not in")))).toEqual([]);
  });

  test("turning Hide locations on for an open link changes the guest's next read", async () => {
    await viewAs({ hideLocations: false });
    expect(shownMarkers(await moreCharges(ALL, 0), LOCATION_MARKERS).length).toBeGreaterThan(0);
    await views.setViewLinkHideLocations(asOwner(1, "made-up-owner"), 1, true, Date.now());
    const after = await moreCharges(ALL, 0);
    expect(shownMarkers(after, LOCATION_MARKERS)).toEqual([]);
    expect(JSON.stringify(after)).toContain(`"${HIDDEN_PLACE}"`);
  });

  test("a guest whose link hides locations gets no tips box (the AI's tips can name a station or a town)", async () => {
    await viewAs({ hideLocations: true });
    const before = fake.calls.length;
    const box = await loadTipsBox({ surface: { scope: "week" } as never, vehicleId: "11", at: NOW, daily: true, entity: "x", findings: [{ kind: "made-up" }] as never });
    expect(box).toBeNull();
    // Left out before the stored tips are read.
    expect(fake.calls.slice(before).filter((c) => /tip/.test(c.table))).toEqual([]);
  });
});
