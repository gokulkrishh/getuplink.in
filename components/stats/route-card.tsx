import type { ReactNode } from "react";
import { GoogleMapsCredit } from "@/components/google-maps-credit";
import { Ph } from "@/components/skeleton";
import type { ShownName } from "@/lib/charge-names";
import { cn } from "@/lib/utils";

// The start and end marks, drawn as the map draws its A and B pins, so the card and the map read as one.
const MARK = "flex size-4 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[9px] font-semibold leading-none";

// What the card says for each end's place:
// - `{ from, to }`: the names a row shows (a Google pick with "Google Maps" beside it, see RouteNames).
// - "pending": still streaming in; the row keeps its height with nothing in it.
// - "unknown": the car sent where, but no name was found.
// - "hidden": the place isn't shown (a view link that hides locations, or no location from the car), so
//   each row says only Start or End.
export type RouteCardPlaces = { from: ShownName; to: ShownName } | "pending" | "unknown" | "hidden";

// A drive's or trip's start and end at the top of its page, like a ride's receipt: the day, then A with where
// and when it began, a dotted line with how far and how long, B with where and when it ended, and the
// battery and energy under a line when known. Each place is one line, cut when long, so the card is the same
// height whatever it holds and nothing moves when the names stream in. Server-safe: no hooks.
// `skeleton`: every part drawn as a placeholder, for the page's loading screen.
export function RouteCard({
  day,
  start,
  end,
  between,
  places,
  figures,
  skeleton = false,
}: {
  // "Today, 2 Nov 2026"
  day: string;
  // "8:18 AM", "8:50 AM"
  start: string;
  end: string;
  // "14.0 km · 33 min", with the stops when there were some.
  between: string;
  places: RouteCardPlaces;
  // Battery and energy used, when known; none leaves out the line and the row under it.
  figures: { label: string; value: string }[];
  skeleton?: boolean;
}) {
  const ph = (node: ReactNode) => (skeleton ? <Ph>{node}</Ph> : node);
  const named = typeof places === "object";
  const place = (side: "from" | "to") => {
    if (named) {
      const n = places[side];
      return (
        <>
          <span className="min-w-0 truncate">{n.text}</span>
          {n.google && <GoogleMapsCredit className="shrink-0" />}
        </>
      );
    }
    if (places === "pending") return null;
    if (places === "unknown") return <span className="text-muted-foreground">Place not known</span>;
    return <span className="text-muted-foreground">{side === "from" ? "Start" : "End"}</span>;
  };
  // One row per end: its mark, then the place on one line (cut when long, the credit never), and the time at
  // the right from sm up. On a phone the time sits under the place, so a long name keeps the width. Each row is
  // a fixed height at each width, so the card never changes size.
  const row = (side: "from" | "to", time: string, mark: ReactNode) => (
    <div className="flex h-11 items-start gap-3 sm:h-6 sm:items-center">
      <span className="flex h-6 shrink-0 items-center">{mark}</span>
      <span className="sr-only">{side === "from" ? "From" : "To"}</span>
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <p className="flex min-w-0 flex-1 items-baseline gap-x-1.5 text-base leading-6 whitespace-nowrap">{skeleton ? <Ph>{side === "from" ? "Koramangala" : "Whitefield"}</Ph> : place(side)}</p>
        <p className="shrink-0 text-sm leading-5 text-muted-foreground tabular-nums">{ph(time)}</p>
      </div>
    </div>
  );
  return (
    <div className="mt-4 mb-12 overflow-hidden rounded-xl border bg-card" aria-hidden={skeleton || undefined}>
      <div className="px-4 pt-4 pb-3">
        <p className="mb-3 text-sm text-muted-foreground tabular-nums">{ph(day)}</p>
        {row("from", start, <span aria-hidden="true" className={cn(MARK, "border-map-route bg-background text-map-route")}>A</span>)}
        <div className="flex items-center gap-3 py-1.5">
          {/* The dotted line between the marks, centred under A. */}
          <span className="flex w-4 shrink-0 justify-center self-stretch" aria-hidden="true">
            <span className="w-0.5 bg-[repeating-linear-gradient(var(--color-faint)_0_4px,transparent_4px_8px)]" />
          </span>
          <p className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground tabular-nums">{ph(between)}</p>
        </div>
        {row("to", end, <span aria-hidden="true" className={cn(MARK, "border-white bg-map-route text-white")}>B</span>)}
      </div>
      {figures.length > 0 && (
        // Half the width each, a line between them; one figure alone takes the whole row.
        <dl className={cn("grid divide-x border-t tabular-nums", figures.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {figures.map((f) => (
            <div key={f.label} className="min-w-0 px-4 py-3">
              <dt className="text-xs text-faint">{ph(f.label)}</dt>
              <dd className="text-xl font-medium">{ph(f.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
