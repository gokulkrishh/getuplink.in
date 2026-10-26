import "server-only";
import { generateDemo } from "@/lib/server/demo/generate";
import { encrypt } from "@/lib/server/crypto";
import { OWNER_VIN, sandboxAccount } from "./accounts";
import { FakeDb, type Row } from "./fake-db";

// The sandbox's database: the tests' FakeDb (./fake-db.ts), with the column defaults and database functions
// the app relies on, in memory. lib/server/supabase.ts hands it out as db() while the sandbox is on, so the
// data layer runs unchanged. It lives on globalThis, so every route, page and action in the dev server
// shares one copy across module reloads. A restart or Reset (the banner) seeds it afresh.
//
// Seeded with one account: the owner (user 1, approved, admin) with a Model Y ending SBX001, connected,
// with the last five weeks of the demo generator's history moved onto that VIN, so the dashboard has something to
// draw. Everyone else arrives through sign-in.

const DAY = 86_400_000;
// How much of the generated history to keep: enough for the dashboard's periods, small enough to scan.
const KEEP_DAYS = 35;

type BoundReading = { field: string; at: string | null; value: unknown; created_at: string | null };

class SandboxDb extends FakeDb {
  constructor(tables: Record<string, Row[]>) {
    super(tables);
    for (const table of ["users", "invites", "poll_runs", "snapshots", "version_history", "stream_charge_sessions", "charge_receipts", "user_places"]) this.autoIds.add(table);
    const now = () => new Date().toISOString();
    this.defaults = {
      users: () => ({ role: "user", sessions_valid_after: "-infinity", approved_at: null, created_at: now(), updated_at: now() }),
      vehicles: () => ({ created_at: now(), readings_from: now(), readings_until: null, missing_since: null }),
      user_tokens: () => ({ created_at: now(), updated_at: now(), refreshing_until: null }),
      poll_runs: () => ({ started_at: now(), finished_at: null, ok: null, error: null }),
      invites: () => ({ used_at: null, used_by: null, joined_label: null, revoked_at: null }),
      version_history: () => ({ source: "tracked" }),
    };
  }

  // The database functions the app calls, as the migrations define them (enough of each for one machine).
  protected override callRpc(fn: string, args: Record<string, unknown>): unknown {
    switch (fn) {
      case "counter_values_at":
        return this.counterValuesAt(Number(args.p_user_id), String(args.p_vin), args.p_fields as string[], args.p_at as string[]);
      case "snapshot_odometer_at":
        return this.odometerAt(Number(args.p_user_id), args.p_at as string[]);
      case "increment_api_usage": {
        const month = new Date().toISOString().slice(0, 8) + "01";
        const key = { month, user_id: Number(args.p_user_id), kind: String(args.p_kind) };
        const row = this.rows("api_usage").find((r) => r.month === key.month && r.user_id === key.user_id && r.kind === key.kind);
        if (row) row.count = Number(row.count) + Number(args.p_n ?? 1);
        else this.rows("api_usage").push({ ...key, count: Number(args.p_n ?? 1) });
        return null;
      }
      case "claim_check_now":
      case "claim_scheduled_check": {
        const user = this.rows("users").find((u) => u.id === Number(args.p_user_id));
        if (user) Object.assign(user, { check_lock_until: args.p_lock_until, next_check_at: args.p_next_at, check_now_at: args.p_now });
        return Boolean(user);
      }
      case "health_daily":
        return [];
      case "count_telemetry_signals":
        return 0;
      case "fold_api_usage":
      case "fold_signal_days":
      case "increment_google_usage":
        return null;
      case "forget_unseen_readings":
      case "prune_unseen_readings":
        return super.callRpc(fn, args);
      default:
        console.warn(`Sandbox: database function ${fn} isn't modelled; answering with no rows.`);
        return [];
    }
  }

  // The user's car link's window on a VIN's readings (vehicles.readings_from .. readings_until).
  private link(userId: number, vin: string): { from: number; until: number } | null {
    const car = this.rows("vehicles").find((v) => v.user_id === userId && v.vin === vin);
    if (!car) return null;
    const from = car.readings_from ? Date.parse(car.readings_from as string) : -Infinity;
    const until = car.readings_until ? Date.parse(car.readings_until as string) : Infinity;
    return { from: Number.isNaN(from) ? -Infinity : from, until };
  }

  // counter_values_at: each field's last reading before each instant ("infinity": the latest), then each
  // field's first reading, all inside the user's window.
  private counterValuesAt(userId: number, vin: string, fields: string[], bounds: string[]): BoundReading[] {
    const window = this.link(userId, vin);
    if (!window) return [];
    const byField = new Map<string, Row[]>(fields.map((f) => [f, []]));
    for (const r of this.rows("telemetry_readings")) {
      if (r.vin !== vin || !byField.has(r.field as string)) continue;
      const at = Date.parse(r.created_at as string);
      if (at >= window.from && at < window.until) byField.get(r.field as string)!.push(r);
    }
    for (const list of byField.values()) list.sort((a, b) => Date.parse(a.created_at as string) - Date.parse(b.created_at as string));
    const out: BoundReading[] = [];
    for (const field of fields) {
      const list = byField.get(field)!;
      for (const bound of bounds) {
        const limit = bound === "infinity" ? Infinity : Date.parse(bound);
        const last = list.findLast((r) => Date.parse(r.created_at as string) < limit);
        out.push({ field, at: bound, value: last?.value ?? null, created_at: (last?.created_at as string | undefined) ?? null });
      }
    }
    for (const field of fields) {
      const first = byField.get(field)![0];
      out.push({ field, at: null, value: first?.value ?? null, created_at: (first?.created_at as string | undefined) ?? null });
    }
    return out;
  }

  // snapshot_odometer_at: the online checks' odometer (raw vehicle_state) before each instant, then the first.
  private odometerAt(userId: number, bounds: string[]) {
    const online = this.rows("snapshots")
      .filter((s) => s.user_id === userId && s.state === "online" && (s.raw as { vehicle_state?: { odometer?: unknown } } | undefined)?.vehicle_state?.odometer != null)
      .sort((a, b) => Date.parse(a.polled_at as string) - Date.parse(b.polled_at as string));
    const row = (s: Row | undefined, at: string | null) => ({
      at,
      odometer: s ? String((s.raw as { vehicle_state: { odometer: unknown } }).vehicle_state.odometer) : null,
      polled_at: (s?.polled_at as string | undefined) ?? null,
    });
    return [...bounds.map((b) => row(online.findLast((s) => Date.parse(s.polled_at as string) < Date.parse(b)), b)), row(online[0], null)];
  }
}

// ---- The seed ----

function seed(now: number): Record<string, Row[]> {
  const owner = sandboxAccount("owner")!;
  const car = owner.cars[0];
  const demo = generateDemo(now);
  const iso = (t: number) => new Date(t).toISOString();
  const joined = iso(now - 120 * DAY);
  const keepFrom = now - KEEP_DAYS * DAY;
  // Each field's first reading (the counters' baseline) and the last KEEP_DAYS days, moved onto the owner's VIN.
  const readings: Row[] = [];
  let id = 0;
  for (const [field, list] of Object.entries(demo.readings)) {
    list.forEach((r, i) => {
      if (i === 0 || Date.parse(r.at) >= keepFrom) readings.push({ id: ++id, vin: OWNER_VIN, field, value: r.value, created_at: r.at });
    });
  }
  const vehicle = { ...demo.vehicle, id: car.id, vin: OWNER_VIN, display_name: car.name };
  const raw = { vehicle_state: { ...demo.vehicleState, odometer: demo.odometerMiles }, vehicle_config: demo.config, in_service: false };
  return {
    users: [
      { id: 1, tesla_sub: owner.sub, status: "approved", role: "admin", sessions_valid_after: "-infinity", created_at: joined, approved_at: joined, updated_at: joined },
    ],
    user_tokens: [
      {
        user_id: 1,
        access_token_enc: encrypt("sbx.owner.0"),
        refresh_token_enc: encrypt("sbx-r.owner.0"),
        expires_at: iso(now + 8 * 60 * 60 * 1000),
        scope: "openid offline_access user_data vehicle_device_data vehicle_location vehicle_charging_cmds",
        refreshing_until: null,
        created_at: joined,
        updated_at: iso(now - DAY),
      },
    ],
    vehicles: [{ ...vehicle, user_id: 1, created_at: joined, readings_from: "2000-01-01T00:00:00.000Z", readings_until: null, missing_since: null, home_state: "KA" }],
    snapshots: [{ id: 1, user_id: 1, vehicle_id: car.id, ...demo.snapshot, raw }],
    version_history: demo.history.map((h, i) => ({ id: i + 1, user_id: 1, vehicle_id: car.id, source: "tracked", ...h })),
    release_notes: Object.entries(demo.notes).map(([version, notes]) => ({ version, notes, raw: null, fetched_at: iso(now) })),
    charging_sessions: demo.teslaSessions.map((s) => ({ ...s, user_id: 1, vehicle_vin: OWNER_VIN, fetched_at: iso(now) })),
    poll_runs: [{ id: 1, user_id: 1, started_at: demo.lastRun.started_at, finished_at: demo.lastRun.started_at, ok: true, error: null, vehicles_seen: 1 }],
    telemetry_readings: readings,
    invites: [],
    api_usage: [],
  };
}

const g = globalThis as typeof globalThis & { __uplinkSandboxDb?: SandboxDb };

// The one sandbox database, seeded on first use.
export function sandboxStore(): FakeDb {
  return (g.__uplinkSandboxDb ??= new SandboxDb(seed(Date.now())));
}

// The client db() hands out: FakeDb's subset of supabase-js.
export function sandboxClient() {
  return sandboxStore().client();
}

// Reset in the banner: everything back to the seed. Sessions of accounts that no longer exist stop working.
export function resetSandboxStore(): void {
  g.__uplinkSandboxDb = new SandboxDb(seed(Date.now()));
}
