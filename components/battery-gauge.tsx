import { Zap } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { SentryMark } from "@/components/sentry-mark";
import { formatClock, formatDayLabel, formatKw, formatKwh, formatRangeKm, formatTimeToFull } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";
import { cn } from "@/lib/utils";

type Parked = { start: number; fromFirstReading: boolean };

// When the car parked: "7:15 PM" today, "yesterday, 7:15 PM", or "26 Oct, 7:15 PM" (IST).
function parkedAt(start: number, now: number): string {
  const day = formatDayLabel(start, now);
  return day === "Today" ? formatClock(start) : `${day === "Yesterday" ? "yesterday" : day}, ${formatClock(start)}`;
}

// What the car is doing, under the meter. Charging: the power and the limit, then how long is left and the
// energy added so far ("Charging at 7.2 kW to 80% · Full in 1 h 18 min · 3.2 kWh added"); the gauge sets
// the first part on one line and the rest on a second. Otherwise what was
// seen: when it parked (`parked`, from the readings; "since before" when it was parked before the first
// one). The limit otherwise stands at the meter's end. Nothing is guessed: a car that isn't charging isn't
// called parked unless the readings say so.
export function batteryState(snapshot: Snapshot, parked: Parked | null, now: number): string | null {
  const level = snapshot.battery_level ?? 0;
  const limit = snapshot.charge_limit;
  const charging = snapshot.charging_state === "Charging";
  if (charging) {
    const target = limit ?? 100;
    const power = snapshot.charge_power_kw != null && snapshot.charge_power_kw > 0 ? snapshot.charge_power_kw : null;
    const toFull = snapshot.time_to_full_h != null && snapshot.time_to_full_h > 0 ? snapshot.time_to_full_h : null;
    // Under 0.05 kWh it would read "0 kWh added": the charge's first minute, with nothing to say yet.
    const added = snapshot.charge_energy_kwh != null && snapshot.charge_energy_kwh >= 0.05 ? snapshot.charge_energy_kwh : null;
    const line = power !== null ? `Charging at ${formatKw(power)}${level < target ? ` to ${target}%` : ""}` : `Charging to ${target}%`;
    return [line, toFull !== null ? formatTimeToFull(toFull) : null, added !== null ? `${formatKwh(added)} added` : null].filter(Boolean).join(" · ");
  }
  return parked && `Parked since ${parked.fromFirstReading ? "before " : ""}${parkedAt(parked.start, now)}`;
}

// The level and range as the biggest thing on the page, the meter under them, and the state line last.
// `align="end"` lines it up on the right from sm up (Home's car row); it stays left on a phone.
// `sentry` marks Sentry Mode watching, on the state line.
// `parked="pending"`: when it parked is still loading (Home streams it in), so a faint line holds its place.
// `holdRow`: that line was shown, so the row keeps its height once loaded even with nothing to say.
export function BatteryGauge({
  snapshot,
  parked = null,
  now,
  align = "start",
  sentry = false,
  holdRow = false,
}: {
  snapshot: Snapshot;
  parked?: Parked | null | "pending";
  now: number;
  align?: "start" | "end";
  sentry?: boolean;
  holdRow?: boolean;
}) {
  const end = align === "end";
  const level = Math.min(100, Math.max(0, snapshot.battery_level ?? 0));
  const limit = snapshot.charge_limit != null ? Math.min(100, Math.max(0, snapshot.charge_limit)) : null;
  const charging = snapshot.charging_state === "Charging";
  const pending = parked === "pending" && !charging;
  const state = batteryState(snapshot, parked === "pending" ? null : parked, now);
  // Sentry Mode's mark leads the parked line. A charge's line has the bolt instead.
  const watching = sentry && !charging;
  // Three rows of one text line each (the level, the meter, the state), so on Home they line up with the
  // name, version and sync lines beside them. The level is one step larger than the text around it.
  return (
    <div className={cn("space-y-1", end && "sm:w-60 sm:shrink-0")}>
      {/* Streamed power and level move while charging, so the page keeps itself fresh. */}
      {charging && <AutoRefresh />}
      <p className={cn("flex h-5 items-baseline gap-x-2 leading-5", end && "sm:justify-end")}>
        <span className="font-mono text-base font-medium tabular-nums">{level}%</span>
        {snapshot.battery_range_km != null && (
          // Tesla's estimate, so "About".
          <span className="text-sm text-muted-foreground tabular-nums">About {formatRangeKm(snapshot.battery_range_km)}</span>
        )}
      </p>
      <div className="flex h-5 items-center gap-2">
        <div
          role="meter"
          aria-valuenow={level}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Battery ${level}%${limit != null ? `, limit ${limit}%` : ""}`}
          className="relative h-0.5 w-full max-w-60 min-w-0 flex-1 bg-border"
        >
          <div className={cn("relative h-full overflow-hidden", charging ? "bg-charge" : "bg-foreground")} style={{ width: `${level}%` }}>
            {charging && (
              <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/80 to-transparent motion-safe:animate-shimmer" />
            )}
          </div>
          {limit != null && (
            <span aria-hidden="true" className="absolute -top-1 h-2.5 w-px bg-muted-foreground" style={{ left: `${limit}%` }} />
          )}
        </div>
        {/* The limit by the meter's end, where its tick is. Charging says it in words instead. */}
        {limit != null && !charging && <span className="shrink-0 text-xs leading-none text-faint tabular-nums">Limit {limit}%</span>}
      </div>
      {pending ? (
        // The skeleton's own line (app/page.tsx), so nothing moves while it loads.
        <p className={cn("text-sm", end && "sm:text-right")} aria-hidden="true">
          <span className="rounded-sm bg-muted text-transparent motion-safe:animate-pulse">Parked since 3:30 PM</span>
        </p>
      ) : !state && !watching ? (
        holdRow && <p className="h-5" aria-hidden="true" />
      ) : (
        // Inline, not a flex row: a wrapping line in a right-aligned flex row leaves the bolt on the
        // left and the words on the right. Filled, the bolt stays one shape at this size.
        <p className={cn("text-sm tabular-nums", charging ? "text-charge" : "text-faint", end && "sm:text-right")}>
          {charging && <Zap className="mr-1.5 inline-block size-3.5 fill-current align-[-0.15em]" aria-hidden="true" />}
          {/* Two lines: what the car is doing first (green while charging), then the time left and the
              energy added, quiet. Sentry Mode's mark leads the first, centred on it. */}
          {watching ? (
            <span className="inline-flex items-center gap-1.5">
              <SentryMark align={end ? "end" : "start"} />
              {state ?? "Sentry Mode on"}
            </span>
          ) : (
            state && <StateLines state={state} />
          )}
        </p>
      )}
    </div>
  );
}

// The state's first part, then the rest on a second, quiet line.
function StateLines({ state }: { state: string }) {
  const [first, ...rest] = state.split(" · ");
  return (
    <>
      <span>{first}</span>
      {rest.length > 0 && <span className="block text-faint">{rest.join(" · ")}</span>}
    </>
  );
}
