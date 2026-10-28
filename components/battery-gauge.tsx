import { Zap } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatDuration, formatKw, formatRangeKm, formatTimeToFull } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";
import { cn } from "@/lib/utils";

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
// `align="end"` lines it up on the right from sm up (Home's car row); it stays left on a phone.
export function BatteryGauge({ snapshot, parked = null, align = "start" }: { snapshot: Snapshot; parked?: { hours: number; fromFirstReading: boolean } | null; align?: "start" | "end" }) {
  const end = align === "end";
  const level = Math.min(100, Math.max(0, snapshot.battery_level ?? 0));
  const limit = snapshot.charge_limit != null ? Math.min(100, Math.max(0, snapshot.charge_limit)) : null;
  const charging = snapshot.charging_state === "Charging";
  const state = batteryState(snapshot, parked);
  // Three rows of one text line each (the level, the meter, the state), so on Home they line up with the
  // name, version and sync lines beside them. The level is one step larger than the text around it.
  return (
    <div className={cn("space-y-1", end && "sm:w-60 sm:shrink-0")}>
      {/* Streamed power and level move while charging, so the page keeps itself fresh. */}
      {charging && <AutoRefresh />}
      <p className={cn("flex h-5 items-baseline gap-x-2 leading-5", end && "sm:justify-end")}>
        <span className="font-mono text-base font-medium tabular-nums">{level}%</span>
        {snapshot.battery_range_km != null && (
          // Tesla's estimate, so "about".
          <span className="text-sm text-muted-foreground tabular-nums">about {formatRangeKm(snapshot.battery_range_km)}</span>
        )}
      </p>
      <div className="flex h-5 items-center">
        <div
          role="meter"
          aria-valuenow={level}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Battery ${level}%${limit != null ? `, limit ${limit}%` : ""}`}
          className="relative h-0.5 w-full max-w-60 bg-border"
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
      </div>
      {state && (
        // Inline, not a flex row: a wrapping line in a right-aligned flex row leaves the bolt on the
        // left and the words on the right. Filled, the bolt stays one shape at this size.
        <p className={cn("text-sm tabular-nums", charging ? "text-charge" : "text-faint", end && "sm:text-right")}>
          {charging && <Zap className="mr-1.5 inline-block size-3.5 fill-current align-[-0.15em]" aria-hidden="true" />}
          {state}
        </p>
      )}
    </div>
  );
}
