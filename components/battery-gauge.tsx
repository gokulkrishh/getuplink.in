import { Zap } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatKm, formatTimeToFull } from "@/lib/format";
import type { Snapshot } from "@/lib/server/dashboard";

const kw = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function BatteryGauge({ snapshot }: { snapshot: Snapshot }) {
  const level = Math.min(100, Math.max(0, snapshot.battery_level ?? 0));
  const limit = snapshot.charge_limit != null ? Math.min(100, Math.max(0, snapshot.charge_limit)) : null;
  const charging = snapshot.charging_state === "Charging";
  const power = charging && snapshot.charge_power_kw != null && snapshot.charge_power_kw > 0 ? snapshot.charge_power_kw : null;
  const toFull = charging && snapshot.time_to_full_h != null && snapshot.time_to_full_h > 0 ? snapshot.time_to_full_h : null;
  const target = limit ?? 100;
  return (
    <div className="space-y-2">
      {/* Streamed power and level move while charging, so the page keeps itself fresh. */}
      {charging && <AutoRefresh />}
      <p className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-medium tracking-tight tabular-nums">{level}%</span>
        {snapshot.battery_range_km != null && (
          <span className="text-sm text-muted-foreground tabular-nums">{formatKm(snapshot.battery_range_km)}</span>
        )}
      </p>
      <div
        role="meter"
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Battery ${level}%${limit != null ? `, limit ${limit}%` : ""}`}
        className="relative h-1 max-w-sm bg-border"
      >
        <div className="relative h-full overflow-hidden bg-foreground" style={{ width: `${level}%` }}>
          {charging && (
            <span className="absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-background/50 to-transparent motion-safe:animate-shimmer" />
          )}
        </div>
        {limit != null && (
          <span aria-hidden="true" className="absolute -top-1 h-3 w-px bg-muted-foreground" style={{ left: `${limit}%` }} />
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {charging && <Zap className="size-3" aria-hidden="true" />}
        {charging
          ? power !== null
            ? `Charging at ${kw.format(power)} kW${level < target ? ` to ${target}%` : ""}`
            : `Charging to ${target}%`
          : limit != null
            ? `Limit ${limit}%`
            : null}
      </p>
      {toFull !== null && <p className="text-xs text-muted-foreground tabular-nums">{formatTimeToFull(toFull)}</p>}
    </div>
  );
}
