import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Header } from "@/components/header";
import { Measure } from "@/components/measure";
import { CarNotices } from "@/components/owner-notices";
import { supplyFigures, Words } from "@/components/stats/charge-supply";
import { type Figure, Figures } from "@/components/stats/figures";
import { Vin } from "@/components/vin";
import { odometerKm } from "@/lib/car";
import { consumptionIn, CONSUMPTION_DAYS } from "@/lib/drive-stats";
import { formatWhPerKm } from "@/lib/seasons";
import type { Drive } from "@/lib/drives";
import { loadWindowStats } from "@/lib/server/driving";
import { loadStreamSessions } from "@/lib/server/stream-charging";
import { rotationLine, tyreRotation } from "@/lib/tyre-rotation";
import { CAR_NOW_FIELDS, type CarNow, carNow, shutSummary, tyreSeen } from "@/lib/car-now";
import { formatClock, formatKm, formatKw, formatKwh, formatPercent, formatRangeKm, formatShortDate } from "@/lib/format";
import { isStaleSync, lastSyncedText, newestTime } from "@/lib/last-synced";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type CarDetails, loadCarDetails } from "@/lib/server/car";
import { type CarState, loadCarState, OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadPrimaryVehicle, loadStream } from "@/lib/server/telemetry";
import { loadTyreArrivals } from "@/lib/server/telemetry-window";
import type { Stream } from "@/lib/telemetry";
import { cn } from "@/lib/utils";
import { currentVersion } from "@/lib/versions";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
// A null id is the primary car (/car), so the header's Car link needs no data.
async function loadCar(id: string | null): Promise<CarDetails | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const carId = id ?? (await loadPrimaryVehicle(owner))?.id ?? null;
  return carId ? loadCarDetails(owner, carId) : null;
}

// The streamed fields the page reads beyond carNow's: the odometer and the version.
const PAGE_FIELDS = [...CAR_NOW_FIELDS, "Odometer", "Version"];

// The car's average consumption, as its own trip meters show it, worked out from the drives Uplink saw.
type Average = { label: string; whPerKm: number; km: number };
type Live = { state: Omit<CarState, "flags">; stream: Stream; now: CarNow | null; notices: string[]; at: number; averages: Average[] };

// The car's state now, in the same private cache as the page: the latest check and newest streamed reading
// the way home reads them (loadCarState, so "Last synced" matches home), the battery with newer streamed
// values laid over it, the latest readings carNow reads, and what Tesla flagged at the latest online check.
// The clock is read here: reading it while rendering blocks prerendering.
async function loadLive(id: string, vin: string | null): Promise<Live> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  const at = Date.now();
  // The flags come with the state's read of the last online check.
  const [{ flags, ...state }, stream, arrivals, window, lastCharges] = await Promise.all([
    loadCarState(owner, { id, vin }, "normal"),
    vin ? loadStream(owner, vin, PAGE_FIELDS) : {},
    vin ? loadTyreArrivals(owner, vin, at) : {},
    loadWindowStats(owner, vin, at),
    vin ? loadStreamSessions(owner, 5) : [],
  ]);
  return { state, stream, now: vin ? carNow(stream, at, flags.tyres, arrivals) : null, notices: flags.notices, at, averages: averages(window.driving.drives, lastCharges.find((c) => c.vin === vin && c.ended_at !== null)?.ended_at ?? null, at) };
}

// Since the last charge, the last 30 days, and since the first drive Uplink saw, each when it has enough
// driving to mean something (see consumptionIn). The 30 days are left out while tracking is younger.
function averages(drives: Drive[], lastChargeEnd: string | null, at: number): Average[] {
  const first = drives.reduce((a, d) => Math.min(a, d.start), Infinity);
  const month = at - CONSUMPTION_DAYS * 86_400_000;
  const spans: [string, number | null][] = [
    ["Since last charge", lastChargeEnd ? Date.parse(lastChargeEnd) : null],
    [`Last ${CONSUMPTION_DAYS} days`, first < month ? month : null],
    [Number.isFinite(first) ? `Since ${formatShortDate(first)}` : "", Number.isFinite(first) ? first : null],
  ];
  return spans.flatMap(([label, from]) => {
    const c = from === null ? null : consumptionIn(drives, { from, to: at });
    return c ? [{ label, ...c }] : [];
  });
}


const shown = <T,>(rows: [string, T][]) => rows.filter((r): r is [string, NonNullable<T>] => r[1] !== null && r[1] !== undefined && r[1] !== false && r[1] !== "");

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-medium tracking-heading">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// A link that reads as one: muted, an arrow after it, brighter on hover.
function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={true} className="inline-flex shrink-0 items-center gap-0.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground">
      {children}
      <ChevronRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

// Name, model and paint; the odometer, the software (to /updates) and when Uplink last heard from the car.
function CarHeader({ car, odometer, version, syncedAt, at }: { car: CarDetails; odometer: number | null; version: string | null; syncedAt: string | null; at: number }) {
  const battery = car.battery;
  // "2025 Model Y Long Range", without repeating the model when the car is named after it.
  const model = [car.year, car.model !== car.name && car.model, car.pack].filter(Boolean).join(" ");
  const subtitle = [model, car.generation, car.paint].filter(Boolean).join(" · ");
  const stale = isStaleSync(syncedAt, at);
  return (
    <header className="space-y-5 border p-4 sm:p-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem] text-balance break-words">{car.name}</h1>
        {subtitle && <p className="text-sm text-muted-foreground text-pretty">{subtitle}</p>}
      </div>
      {(odometer !== null || version || battery) && (
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          {odometer !== null && (
            <div className="space-y-1">
              <dt className="text-[0.8125rem] leading-5 text-muted-foreground">Odometer</dt>
              <dd className="font-mono text-lg leading-none font-medium tabular-nums">
                <Measure text={formatKm(odometer)} size="tile" />
              </dd>
            </div>
          )}
          {version && (
            <div className="space-y-1">
              <dt className="text-[0.8125rem] leading-5 text-muted-foreground">Software</dt>
              <dd className="text-lg leading-none">
                <Link
                  href="/updates"
                  prefetch={true}
                  translate="no"
                  className="inline-flex items-center gap-0.5 font-mono font-medium tabular-nums underline decoration-border decoration-dotted underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
                >
                  {version}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </dd>
            </div>
          )}
          {/* The latest week's estimate, as on /stats/battery, which it opens. */}
          {battery && (
            <div className="space-y-1">
              <dt className="flex h-5 items-center gap-1 text-[0.8125rem] leading-5 text-muted-foreground">Usable capacity</dt>
              <dd className="text-lg leading-none">
                <Link
                  href="/stats/battery"
                  prefetch={true}
                  // The unit is inline-block, so the dotted underline runs under the number only (a smaller unit
                  // would sit it at another height).
                  className="inline-flex items-center gap-0.5 font-mono font-medium tabular-nums underline decoration-border decoration-dotted underline-offset-4 transition-colors duration-150 hover:decoration-foreground [&_span]:inline-block"
                >
                  <Measure text={formatKwh(battery.kwh)} size="tile" />
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </dd>
            </div>
          )}
        </dl>
      )}
      <p className={cn("text-xs tabular-nums", stale ? "text-foreground" : "text-faint")}>{lastSyncedText(syncedAt, at)}</p>
    </header>
  );
}

// carNow's rows that `shut` (see shutSummary) says in one tile, placed where the first of them was.
const SHUT_ROWS = new Set(["Locked", "Doors", "Windows", "Charge port door"]);

// The charge and range from the latest online check, newer streamed values laid over it, then carNow's
// rows, with locks, doors, windows and the charge port door as one tile. Temperatures are measures; the
// rest are words.
function nowFigures(state: Omit<CarState, "flags">, now: CarNow | null, shut: string | null): Figure[] {
  const s = state.lastOnline;
  const figures: Figure[] = [];
  if (s?.battery_level != null) {
    const charging = s.charging_state === "Charging";
    const power = charging && s.charge_power_kw != null && s.charge_power_kw > 0 ? s.charge_power_kw : null;
    const note = charging
      ? power !== null
        ? `Charging at ${formatKw(power)}`
        : `Charging${s.charge_limit != null ? ` to ${s.charge_limit}%` : ""}`
      : s.charge_limit != null
        ? `Limit ${s.charge_limit}%`
        : undefined;
    figures.push({ label: "Charge", value: formatPercent(s.battery_level), note });
  }
  if (s?.battery_range_km != null) figures.push({ label: "Range", value: formatRangeKm(s.battery_range_km) });
  let shutShown = false;
  for (const [label, value] of now?.rows ?? []) {
    if (SHUT_ROWS.has(label)) {
      if (shut && !shutShown) figures.push({ label: "Locks and doors", value: <Words>{shut}</Words> });
      shutShown = true;
      continue;
    }
    figures.push({ label, value: /^-?\d/.test(value) ? value : <Words>{value}</Words> });
  }
  return figures;
}

function Car({ car, live }: { car: CarDetails; live: Live }) {
  const { state, stream, now, notices, at } = live;
  const reading = (field: string) => stream[field];
  const odometer = odometerKm(car.polledOdometer, reading("Odometer") && { miles: reading("Odometer").value, at: reading("Odometer").at });
  const version = currentVersion(car.rowVersion, car.checkedVersion, reading("Version") && { version: reading("Version").value, at: reading("Version").at });
  const syncedAt = newestTime([state.latest?.polled_at, state.streamAt]);
  const rhd = car.steering === "Right-hand drive" ? true : car.steering === "Left-hand drive" ? false : null;
  const figures = nowFigures(state, now, shutSummary(stream, rhd));
  const tyres = now?.tyres ?? [];
  const seen = tyreSeen(tyres, at);
  const rotation = tyreRotation(odometer);

  const specs = shown<ReactNode>([
    ["Drive", car.drive],
    ["Battery", car.pack],
    [
      "Chemistry",
      car.likelyLfp && "LFP",
    ],
    [
      "Motor",
      car.motor && (
        <>
          {car.motor}
          {car.rearDriveUnit && (
            <span translate="no" className="block font-mono text-xs text-muted-foreground">
              {car.rearDriveUnit}
            </span>
          )}
        </>
      ),
    ],
    ["Built in", car.factory],
    ["Wheels", car.wheels],
    ["Roof", car.roof],
    ["Interior", car.interior],
    ["Exterior trim", car.exteriorTrim],
    ["Driver assistance", car.hardware],
    ["Charge port", car.chargePort],
    ["Steering", car.steering],
    // Shown under the tyres instead, when they're shown.
    ["Recommended tyre pressure", tyres.length === 0 && car.tyrePressure],
    ["VIN", car.vin && <Vin vin={car.vin} label={false} />],
  ]);

  const ac = car.lastAcCharge;

  return (
    <div className="flex flex-col gap-12">
      <div className="space-y-4">
        <CarHeader car={car} odometer={odometer} version={version} syncedAt={syncedAt} at={at} />
        <CarNotices notices={notices} />
      </div>

      {figures.length > 0 && (
        <Section title="Car now">
          {/* The charge tile's note gives the power in kW while charging. */}
          <Figures
            figures={figures}
            label="Car now"
          />
        </Section>
      )}

      {live.averages.length > 0 && (
        <Section title="Average consumption">
          {/* Like the car's trip meters: energy per km over the driving in each span. */}
          <Figures figures={live.averages.map((a) => ({ label: a.label, value: formatWhPerKm(a.whPerKm), note: `Over ${formatKm(a.km)}` }))} label="Average consumption" />
        </Section>
      )}

      {(tyres.length > 0 || rotation) && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium tracking-heading">Tyres</h2>
          {/* When to rotate them, counted from new on Tesla's every 10,000 km (lib/tyre-rotation.ts). */}
          {rotation && <p className="text-sm text-muted-foreground">{rotationLine(rotation)}</p>}
          {/* Laid out like the car: fronts on top, left on the left, two by two at every width. */}
          {tyres.length > 0 && <Figures
            className="sm:grid-cols-2"
            figures={tyres.map((t, k) => ({
              label: t.name,
              value: t.pressure,
              // Its own time only when it differs from the line under the tyres (see tyreSeen).
              note:
                seen.each[k] || t.alert ? (
                  <>
                    {seen.each[k]}
                    {t.alert && <span className="block text-destructive">{t.alert}</span>}
                  </>
                ) : undefined,
            }))}
            label="Tyres"
          />}
          {(seen.shared || car.tyrePressure) && (
            <p className="text-xs text-muted-foreground">
              {[seen.shared, car.tyrePressure && `Recommended ${car.tyrePressure}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {/* A warning not shown on a tile: one that doesn't say which tyre, or a tyre with no reading. */}
          {now?.tyreWarning && !tyres.some((t) => t.alert) && <p className="text-sm text-destructive">{now.tyreWarning}</p>}
        </section>
      )}

      {specs.length > 0 && (
        <Section title="Specs">
          {/* Two columns from sm up, one on a phone; each row is the label and its value side by side. */}
          <dl className="grid border-t text-sm sm:grid-cols-2 sm:gap-x-8">
            {specs.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b py-2">
                <dt className="shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 text-right break-words tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {ac && (
        <Section title="Last AC charge" action={<MoreLink href={`/stats/charging/${ac.id}`}>See charge</MoreLink>}>
          <Figures
            figures={[
              ac.kw !== null && { label: "Power", value: formatKw(ac.kw), note: "Typical draw" },
              ...(ac.supply ? supplyFigures(ac.supply) : []),
            ]}
            label="Last AC charge"
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            Ended {formatShortDate(ac.endedAt)}, {formatClock(ac.endedAt)}
          </p>
        </Section>
      )}

      {!car.checkedAt && (
        <p className="text-sm text-muted-foreground">
          Details fill in once the car is awake. Open the Tesla app to wake it.
        </p>
      )}
    </div>
  );
}

async function CarContent({ id }: { id: Promise<string | null> }) {
  const carId = await id;
  const car = await loadCar(carId);
  if (!car && carId === null) return <p className="text-sm text-muted-foreground">No car on your Tesla account yet.</p>;
  if (!car) notFound();
  return <Car car={car} live={await loadLive(car.id, car.vin)} />;
}

// Faint blocks in the shape of the header card, the tiles and the specs.
function CarSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-12">
      <span className="sr-only">Loading…</span>
      <div className="space-y-5 border p-4 sm:p-6">
        <div className={`h-8 w-40 ${block}`} />
        <div className={`h-4 w-56 ${block}`} />
        <div className={`h-9 w-48 ${block}`} />
        <div className={`h-3 w-44 ${block}`} />
      </div>
      <div className="grid grid-cols-2 gap-px border bg-border bg-clip-padding dark:border-transparent dark:bg-background sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="space-y-2 bg-background p-3 sm:p-4 dark:bg-card">
            <div className={`h-3 w-16 ${block}`} />
            <div className={`h-6 w-20 ${block}`} />
          </div>
        ))}
      </div>
      <div className={`h-40 w-full ${block}`} />
    </div>
  );
}

// /car/[id] and /car (the primary car, id null) render this.
export function CarPage({ id }: { id: Promise<string | null> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="car" />
      <Suspense fallback={<CarSkeleton />}>
        <CarContent id={id} />
      </Suspense>
    </div>
  );
}
