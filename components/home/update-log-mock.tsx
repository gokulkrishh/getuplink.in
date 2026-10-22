// A static copy of one update's journey as Uplink records it, for the home page. The times are illustrative.
const EVENTS = [
  { time: "14 Oct, 09:12", label: "Available", detail: "2026.38.3.1 reached your car" },
  { time: "14 Oct, 21:40", label: "Downloaded", detail: "Over home Wi-Fi" },
  { time: "15 Oct, 02:00", label: "Scheduled", detail: "Set for 2:00 am" },
  { time: "15 Oct, 02:24", label: "Installed", detail: "Release notes ready to read" },
];

export function UpdateLogMock() {
  return (
    <div aria-hidden="true" className="border bg-background p-6 text-sm select-none">
      <div className="flex items-baseline justify-between text-xs text-faint">
        <span className="tracking-wide uppercase">Update log</span>
        <span className="font-mono tabular-nums">2026.38.3.1</span>
      </div>
      <ol className="mt-4">
        {EVENTS.map((e, i) => (
          <li key={e.label} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Rail between the dots; the last event has none below it. */}
            {i < EVENTS.length - 1 && <span className="absolute top-3 bottom-0 left-[3px] w-px bg-border" />}
            <span
              className={
                i === EVENTS.length - 1
                  ? "mt-1.5 size-[7px] shrink-0 rounded-full bg-foreground"
                  : "mt-1.5 size-[7px] shrink-0 rounded-full bg-muted-foreground/50"
              }
            />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
              <p>
                <span className="font-medium">{e.label}</span>
                <span className="block text-muted-foreground">{e.detail}</span>
              </p>
              <span className="shrink-0 text-xs text-faint tabular-nums">{e.time}</span>
            </div>
          </li>
        ))}
      </ol>
  </div>
);
}
