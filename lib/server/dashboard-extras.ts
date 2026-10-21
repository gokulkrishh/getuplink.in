import "server-only";
import type { Listed } from "@/components/session-row";
import { matchSessions, splitSite } from "@/lib/charge-sessions";
import {
  ACTIVITY_DAYS,
  type ActivityEvent,
  buildActivity,
  type ChargeItem,
  type LevelPoint,
  levelSeries,
  type WeekSummary,
  weekSummary,
} from "@/lib/dashboard-summary";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { loadBatteryHealth } from "./car";
import { loadChargingSessions } from "./charging";
import type { VersionChange } from "./dashboard";
import { loadStreamSessions } from "./stream-charging";
import { loadReadingBefore, loadReadings } from "./telemetry";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// What the dashboard shows under the version, for one car. Every part is empty when its data is.
export type VehicleExtras = {
  week: WeekSummary | null;
  battery: { day: LevelPoint[]; week: LevelPoint[]; healthKwh: number | null };
  lastCharge: Listed | null;
  activity: ActivityEvent[];
};

// Sessions per source to read: the 14-day window plus the last charge, whatever its age.
const SESSION_LIMIT = 40;

// All the dashboard's extra reads at once, in narrow windows (14 days of the odometer and energy counters,
// 7 days of battery level). Never throws: the dashboard works without any of this.
export async function loadVehicleExtras(vin: string, history: Promise<VersionChange[]>, now: number): Promise<VehicleExtras | null> {
  try {
    const from = new Date(istDayStart(istDay(now) - ACTIVITY_DAYS + 1)).toISOString();
    const levelFrom = now - 7 * DAY;
    const [odometer, odometerBefore, used, usedBefore, level, health, teslaSessions, streamSessions, versions] = await Promise.all([
      loadReadings(vin, "Odometer", from),
      loadReadingBefore(vin, "Odometer", from),
      loadReadings(vin, "LifetimeEnergyUsed", from),
      loadReadingBefore(vin, "LifetimeEnergyUsed", from),
      loadReadings(vin, "BatteryLevel", new Date(levelFrom).toISOString()),
      loadBatteryHealth(vin).catch(() => null),
      loadChargingSessions(SESSION_LIMIT),
      loadStreamSessions(SESSION_LIMIT),
      history,
    ]);

    // Tesla and streamed sessions of this car, each charge once.
    const { pairs, streamOnly } = matchSessions(
      teslaSessions.filter((s) => s.vehicle_vin === vin),
      streamSessions.filter((s) => s.vin === vin),
      now,
    );
    const listed: Listed[] = [
      ...pairs.map((p) => ({ key: p.tesla.session_id, started_at: p.tesla.started_at, tesla: p.tesla, stream: p.stream })),
      ...streamOnly.map((s) => ({ key: `stream-${s.id}`, started_at: s.started_at, tesla: null, stream: s })),
    ].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    const charges: ChargeItem[] = listed.map(({ tesla, stream, started_at }) => ({
      started_at,
      energyKwh: tesla ? (tesla.energy_kwh ?? stream?.energy_added_kwh ?? null) : (stream?.energy_added_kwh ?? null),
      place: tesla ? splitSite(tesla.site_name).place : null,
      cost: tesla?.cost_total ?? null,
      currency: tesla?.currency ?? null,
      startLevel: stream?.start_level ?? null,
      endLevel: stream?.end_level ?? null,
    }));

    const odometerReadings = odometer ?? [];
    const usedReadings = used ?? [];
    const week = weekSummary(odometerReadings, odometerBefore, usedReadings, usedBefore, charges, now);
    const activity = buildActivity({
      odometer: odometerReadings,
      odometerBefore,
      used: usedReadings,
      usedBefore,
      charges,
      updates: versions.filter((v) => v.previous_version),
      now,
    });
    const levels = level ?? [];
    return {
      week: Object.values(week).some((v) => v !== null) ? week : null,
      battery: {
        day: levelSeries(levels, now - DAY, 10 * 60_000),
        week: levelSeries(levels, levelFrom, HOUR),
        healthKwh: health?.packKwh ?? null,
      },
      lastCharge: listed[0] ?? null,
      activity,
    };
  } catch (err) {
    console.warn("Dashboard extras unavailable:", (err as Error).message);
    return null;
  }
}
