import { Bar, FigureStage, SATELLITE, SURFACE } from "@/components/home/figure";

// "Your car at a glance": the car's charge, range and limit, with distance by month below, and battery
// health across the card's edge. The values are illustrative, for an Indian Model Y.
const BATTERY = { level: 72, rangeKm: 361, limit: 80 };
const MONTHS = [1180, 1420, 1260, 1610, 1390, 1444];

export function CarGlanceMock() {
  const max = Math.max(...MONTHS);
  return (
    <FigureStage className="h-[380px] sm:h-[420px]">
      <div className={`absolute top-5 right-5 left-5 h-[460px] rounded-xl p-5 text-sm sm:top-8 sm:right-8 sm:left-[104px] sm:p-6 ${SURFACE}`}>
        <p className="truncate">
          <span className="font-medium">Ghost</span>
          <span className="ml-2 text-faint">Model Y · Stealth Grey</span>
        </p>

        <div className="mt-6 flex items-baseline gap-3">
          <span className="font-mono text-4xl font-medium tracking-tight tabular-nums">{BATTERY.level}%</span>
          <span className="text-muted-foreground tabular-nums">
            {BATTERY.rangeKm}
            <span className="ml-0.5 text-xs">km</span>
          </span>
        </div>
        <div className="relative mt-4 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-foreground" style={{ width: `${BATTERY.level}%` }} />
          <div className="absolute -inset-y-1 w-px bg-muted-foreground" style={{ left: `${BATTERY.limit}%` }} />
        </div>
        <p className="mt-2 text-right text-xs text-faint tabular-nums" style={{ paddingRight: `${100 - BATTERY.limit}%` }}>
          <span className="translate-x-1/2">Limit {BATTERY.limit}%</span>
        </p>

        {/* Distance by month, as filler: this month in full ink. */}
        <div className="mt-6 border-t pt-5">
          <Bar className="w-20" />
          <ol className="mt-4 grid h-36 grid-cols-6 items-end gap-2.5 sm:gap-3">
            {MONTHS.map((km, i) => (
              <li
                key={i}
                className={`rounded-sm ${i === MONTHS.length - 1 ? "bg-foreground" : "bg-muted-foreground/25"}`}
                style={{ height: `${(km / max) * 100}%` }}
              />
            ))}
          </ol>
        </div>
      </div>

      {/* Battery health, across the card's edge. */}
      <div className={`absolute right-8 bottom-6 w-[152px] rounded-xl p-4 text-sm sm:top-[196px] sm:right-auto sm:bottom-auto sm:left-6 ${SATELLITE}`}>
        <p className="text-xs text-faint">Battery health</p>
        <p className="mt-2 font-mono text-2xl tracking-tight tabular-nums">
          94%
          <span className="ml-1 font-sans text-xs tracking-normal text-muted-foreground">of new</span>
        </p>
      </div>
    </FigureStage>
  );
}
