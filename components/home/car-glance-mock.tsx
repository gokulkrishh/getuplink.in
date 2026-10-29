// A static copy of what Uplink keeps about a car: the latest check, battery health, loss while parked
// and monthly distance. The values are illustrative, for an Indian Model Y.
const BATTERY = { level: 72, rangeKm: 361, limit: 80 };

const STATS = [
  { label: "Battery health", value: "94%", unit: "of new" },
  { label: "Lost while parked", value: "0.6%", unit: "a day" },
  { label: "Odometer", value: "24,082", unit: "km" },
];

const MONTHS = [
  { label: "May", km: 1180 },
  { label: "Jun", km: 1420 },
  { label: "Jul", km: 1260 },
  { label: "Aug", km: 1610 },
  { label: "Sept", km: 1390 },
  { label: "Oct", km: 1444 },
];

export function CarGlanceMock() {
  const max = Math.max(...MONTHS.map((m) => m.km));
  return (
    <div aria-hidden="true" className="border bg-background p-6 text-sm select-none">
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 truncate">
          <span className="font-medium">Ghost</span>
          <span className="ml-2 text-faint">Model Y · Stealth Grey</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-faint">
          <span className="size-1.5 rounded-full bg-positive" />
          Awake
        </span>
      </div>

      <div className="mt-8 flex items-baseline justify-between text-xs text-faint">
        <span className="tracking-wide uppercase">Battery</span>
        <span className="font-mono tabular-nums">Limit {BATTERY.limit}%</span>
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-3xl font-medium tracking-tight tabular-nums">{BATTERY.level}%</span>
        <span className="text-muted-foreground tabular-nums">
          {BATTERY.rangeKm}
          <span className="ml-0.5 text-xs">km</span>
        </span>
      </div>
      <div className="relative mt-3 h-2 bg-muted">
        <div className="h-full bg-foreground" style={{ width: `${BATTERY.level}%` }} />
        <div className="absolute -inset-y-1 w-px bg-muted-foreground" style={{ left: `${BATTERY.limit}%` }} />
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        {STATS.map((s) => (
          <div key={s.label} className="min-w-0 border-t pt-2.5">
            <dt className="text-xs text-faint">{s.label}</dt>
            <dd className="mt-1 font-mono text-[13px] whitespace-nowrap tabular-nums sm:text-sm">
              {s.value}
              <span className="ml-0.5 font-sans text-xs text-muted-foreground">{s.unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex items-baseline justify-between text-xs text-faint">
        <span className="tracking-wide uppercase">Distance</span>
        <span className="font-mono tabular-nums">8,304 km</span>
      </div>
      <ol className="mt-3 grid h-20 grid-cols-6 items-end gap-3 bg-muted px-4 pt-3 pb-2">
        {MONTHS.map((m, i) => (
          <li key={m.label} className="flex h-full flex-col justify-end gap-1.5">
            <div
              className={i === MONTHS.length - 1 ? "bg-foreground" : "bg-muted-foreground/40"}
              style={{ height: `${(m.km / max) * 100}%` }}
            />
            <span className="text-center text-xs text-faint">{m.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
