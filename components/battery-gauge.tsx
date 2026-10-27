import { Zap } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatDuration, formatKw, formatRangeKm, formatTimeToFull } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";
import { Measure } from "@/components/measure";

// What the car is doing, in one line under the level. Charging: the power and the limit, then how long is
// left ("Charging at 7.2 kW to 80% · Full in 1 h 18 min"). Otherwise what was seen: how long it has been
// parked (`parked`, from the readings; "≥" when it was parked before the first one) and the limit set.
// Nothing is guessed: a car that isn't charging isn't called parked unless the readings say so.
export function batteryState(snapshot: Snapshot, parked: { hours: number; fromFirstReading: boolean } | null): string | null {
  const level = snapshot.battery_level ?? 0;
  const limit = snapshot.charge_limit;
  const charging = snapshot.charging_state === "Charging";
  if (charging) {
    const target = limit ?? 100;
    const power = snapshot.charge_power_kw != null && snapshot.charge_power_kw > 0 ? snapshot.charge_power_kw : null;
    const toFull = snapshot.time_to_full_h != null && snapshot.time_to_full_h > 0 ? snapshot.time_to_full_h : null;
    const line = power !== null ? `Charging at ${formatKw(power)}${level < target ? ` to ${target}%` : ""}` : `Charging to ${target}%`;
    return toFull !== null ? `${line} · ${formatTimeToFull(toFull)}` : line;
  }
  const parts = [parked && `Parked ${parked.fromFirstReading ? "≥ " : ""}${formatDuration(parked.hours * 3600)}`, limit != null && `Limit ${limit}%`];
  const line = parts.filter(Boolean).join(" · ");
  return line || null;
}

// The level and range as the biggest thing on the page, the meter under them, and the state line last.
export function BatteryGauge({ snapshot, parked = null }: { snapshot: Snapshot; parked?: { hours: number; fromFirstReading: boolean } | null }) {
  const level = Math.min(100, Math.max(0, snapshot.battery_level ?? 0));
  const limit = snapshot.charge_limit != null ? Math.min(100, Math.max(0, snapshot.charge_limit)) : null;
  const charging = snapshot.charging_state === "Charging";
  const state = batteryState(snapshot, parked);
  return (
    <div className="space-y-3">
      {/* Streamed power and level move while charging, so the page keeps itself fresh. */}
      {charging && <AutoRefresh />}
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[2.25rem] font-medium tracking-tight tabular-nums">
          <Measure text={`${level}%`} size="headline" />
        </span>
        {snapshot.battery_range_km != null && (
          // Tesla's estimate, so "about".
          <span className="text-base text-muted-foreground tabular-nums">about {formatRangeKm(snapshot.battery_range_km)}</span>
        )}
      </p>
      <div
        role="meter"
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Battery ${level}%${limit != null ? `, limit ${limit}%` : ""}`}
        className="relative h-0.5 max-w-60 bg-border"
      >
        <div className="relative h-full overflow-hidden bg-foreground" style={{ width: `${level}%` }}>
          {charging && (
            <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
          )}
        </div>
        {limit != null && (
          <span aria-hidden="true" className="absolute -top-1 h-2.5 w-px bg-muted-foreground" style={{ left: `${limit}%` }} />
        )}
      </div>
      {state && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
          {charging && <Zap className="size-3.5" aria-hidden="true" />}
          {state}
        </p>
      )}
    </div>
  );
}
