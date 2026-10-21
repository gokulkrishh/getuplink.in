// A static copy of the dashboard's Versions table and Stats bars for the home page. Real Tesla
// versions and India Supercharger pricing (₹24/kWh); the dates and amounts are illustrative.
const ROWS = [
  { version: "2026.38.3.1", received: "14 Oct", installed: "15 Oct", km: "24,082" },
  { version: "2026.32.3", received: "5 Sept", installed: "7 Sept", km: "22,638" },
  { version: "2026.26.6", received: "30 Jul", installed: "2 Aug", km: "21,270" },
  { version: "2026.20.6.10", received: "24 Jun", installed: "25 Jun", km: "19,826" },
];

const MONTHS = [
  { label: "May", amount: 1206 },
  { label: "Jun", amount: 1872 },
  { label: "Jul", amount: 1450 },
  { label: "Aug", amount: 2290 },
  { label: "Sept", amount: 2109 },
  { label: "Oct", amount: 2438 },
];

export function HistoryMock() {
  const max = Math.max(...MONTHS.map((m) => m.amount));
  return (
    <div aria-hidden="true" className="border bg-background p-6 text-sm select-none">
      <div className="flex items-baseline gap-4 pb-2 text-xs text-faint">
        <span className="flex-1">Version</span>
        <span className="hidden w-16 text-right sm:block">Received</span>
        <span className="w-16 text-right">Installed</span>
        <span className="w-20 text-right">Odometer</span>
      </div>
      <ol>
        {ROWS.map((r) => (
          <li key={r.version} className="flex items-baseline gap-4 border-t py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono">{r.version}</span>
            <span className="hidden w-16 text-right text-faint tabular-nums sm:block">{r.received}</span>
            <span className="w-16 text-right text-muted-foreground tabular-nums">{r.installed}</span>
            <span className="w-20 text-right text-faint tabular-nums">
              {r.km}
              <span className="ml-0.5 text-xs">km</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex items-baseline justify-between text-xs text-faint">
        <span className="tracking-wide uppercase">Supercharging spend</span>
        <span className="font-mono tabular-nums">₹24/kWh</span>
      </div>
      <ol className="mt-3 grid h-28 grid-cols-6 items-end gap-3 bg-muted px-4 pt-4 pb-3">
        {MONTHS.map((m, i) => (
          <li key={m.label} className="flex h-full flex-col justify-end gap-2">
            <div
              className={i === MONTHS.length - 1 ? "bg-foreground" : "bg-muted-foreground/40"}
              style={{ height: `${(m.amount / max) * 100}%` }}
            />
            <span className="text-center text-xs text-faint">{m.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
