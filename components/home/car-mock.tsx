// A static copy of the dashboard's update status, battery and car details for the home page.
// The values are illustrative.
const STEPS = ["Available", "Downloading", "Scheduled", "Installing"];
const CURRENT_STEP = 1;

const BATTERY = { level: 72, rangeKm: 361, limit: 80 };

const DETAILS = [
  ["Model", "Model Y Long Range"],
  ["Drive", "Dual Motor AWD"],
  ["Built in", "Shanghai"],
  ["Paint", "Diamond Black"],
  ["Wheels", "19″ Crossflow"],
];

export function CarMock() {
  return (
    <div aria-hidden="true" className="border bg-background p-6 text-sm select-none">
      <div className="flex items-baseline justify-between text-xs text-faint">
        <span className="tracking-wide uppercase">Update</span>
        <span className="font-mono tabular-nums">2026.38.5.1</span>
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1.5">
        {STEPS.map((step, i) => (
          <li key={step} className="flex flex-col gap-2">
            <div className={i <= CURRENT_STEP ? "h-1 bg-foreground" : "h-1 bg-border"} />
            <span className={i === CURRENT_STEP ? "text-xs" : "text-xs text-faint"}>{step}</span>
          </li>
        ))}
      </ol>

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
        {/* Charge limit marker */}
        <div className="absolute -inset-y-1 w-px bg-muted-foreground" style={{ left: `${BATTERY.limit}%` }} />
      </div>

      <dl className="mt-8">
        {DETAILS.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-t py-2.5">
            <dt className="text-faint">{label}</dt>
            <dd className="truncate text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
