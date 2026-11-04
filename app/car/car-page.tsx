import { ChevronRight } from "lucide-react";
import { CarTabs } from "@/components/car-tabs";
import { SentryMark } from "@/components/sentry-mark";
import Image from "next/image";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Loading, Ph, SkFigures, SkSection } from "@/components/skeleton";
import { Header, PhoneNav } from "@/components/header";
import { Measure } from "@/components/measure";
import { CarNotices } from "@/components/owner-notices";
import { Words } from "@/components/stats/charge-supply";
import { type Figure, Figures } from "@/components/stats/figures";
import { Vin } from "@/components/vin";
import { carPicture, odometerKm } from "@/lib/car";
import { rotationLine, tyreRotation } from "@/lib/tyre-rotation";
import { CAR_NOW_FIELDS, type CarNow, carNow, shutSummary, tyreSeen } from "@/lib/car-now";
import { formatClock, formatKm, formatKwh, formatShortDate } from "@/lib/format";
import { isStaleSync, lastSyncedText, newestTime } from "@/lib/last-synced";
import { requireReader } from "@/lib/server/auth";
import { type CarDetails, loadCarDetails } from "@/lib/server/car";
import { type CarState, loadCarState, OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadPrimaryVehicle, loadStream } from "@/lib/server/telemetry";
import { loadTyreArrivals } from "@/lib/server/telemetry-window";
import type { Stream } from "@/lib/telemetry";
import { cn } from "@/lib/utils";
import { currentVersion } from "@/lib/versions";

// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadCar(id: string): Promise<CarDetails | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  return loadCarDetails(owner, id);
}

// The primary car's id and VIN (/car has no id, so the header's Car link needs no data): one small read,
// after which the car's details and its state are read at once.
async function loadPrimary(): Promise<{ id: string; vin: string } | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  return loadPrimaryVehicle(owner);
}

// The streamed fields the page reads beyond carNow's: the odometer and the version.
const PAGE_FIELDS = [...CAR_NOW_FIELDS, "Odometer", "Version"];

type Live = { state: Omit<CarState, "flags">; stream: Stream; now: CarNow | null; notices: string[]; at: number };

// The car's state now, in the same private cache as the page: the latest check and newest streamed reading
// the way home reads them (loadCarState, so "Last synced" matches home), the battery with newer streamed
// values laid over it, the latest readings carNow reads, and what Tesla flagged at the latest online check.
// The clock is read here: reading it while rendering blocks prerendering.
async function loadLive(id: string, vin: string | null): Promise<Live> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  const at = Date.now();
  // The flags come with the state's read of the last online check.
  const [{ flags, ...state }, stream, arrivals] = await Promise.all([
    loadCarState(owner, { id, vin }, "normal"),
    vin ? loadStream(owner, vin, PAGE_FIELDS) : {},
    vin ? loadTyreArrivals(owner, vin, at) : {},
  ]);
  return { state, stream, now: vin ? carNow(stream, at, flags.tyres, arrivals) : null, notices: flags.notices, at };
}

const shown = <T,>(rows: [string, T][]) => rows.filter((r): r is [string, NonNullable<T>] => r[1] !== null && r[1] !== undefined && r[1] !== false && r[1] !== "");

// The car's state is "now" when it reported within this long.
const FRESH_MS = 10 * 60_000;

function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium tracking-heading">{title}</h2>
          {action}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// Name, model and paint; the odometer, the software (to /updates) and when Uplink last heard from the car.
function CarHeader({ car, odometer, version, syncedAt, at }: { car: CarDetails; odometer: number | null; version: string | null; syncedAt: string | null; at: number }) {
  const battery = car.battery;
  // "2025 Model Y Long Range", without repeating the model when the car is named after it.
  const model = [car.year, car.model !== car.name && car.model, car.pack].filter(Boolean).join(" ");
  const subtitle = [model, car.paint].filter(Boolean).join(" · ");
  const stale = isStaleSync(syncedAt, at);
  const picture = carPicture(car.model, car.paint);
  return (
    <header className="flex flex-col gap-5 rounded-lg border p-4 sm:flex-row-reverse sm:items-center sm:gap-6 sm:p-6">
      {/* The owner's car in its paint, beside the figures (above them on a phone). The name says what it is. */}
      {picture && <CarPicture src={picture} />}
      <div className="min-w-0 flex-1 space-y-5">
        <div className="min-w-0 space-y-1">
          <h2 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem] text-balance break-words">{car.name}</h2>
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
                    className="tap-target inline-flex items-center gap-0.5 font-mono font-medium tabular-nums underline decoration-muted-foreground/60 decoration-dotted underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
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
                    className="tap-target inline-flex items-center gap-0.5 font-mono font-medium tabular-nums underline decoration-muted-foreground/60 decoration-dotted underline-offset-4 transition-colors duration-150 hover:decoration-foreground [&_span]:inline-block"
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
      </div>
    </header>
  );
}

// The pictures are 1200 by 514 (public/cars/); the box keeps that shape, so the card doesn't move as it loads.
const PICTURE_BOX = "aspect-[1200/514] w-full max-w-[26rem] self-center sm:w-[40%] sm:max-w-none sm:shrink-0";

function CarPicture({ src }: { src: string }) {
  return (
    <div className={cn("relative", PICTURE_BOX)}>
      <Image src={src} alt="" fill preload sizes="(min-width: 640px) 320px, min(26rem, 100vw)" className="object-contain" />
    </div>
  );
}

// carNow's rows that `shut` (see shutSummary) says in one tile, placed where the first of them was.
const SHUT_ROWS = new Set(["Locked", "Doors", "Windows", "Charge port door"]);

// carNow's rows, with locks, doors, windows and the charge port door as one tile. Temperatures are measures;
// the rest are words. The charge and range are Home's, so they aren't repeated here.
function nowFigures(state: Omit<CarState, "flags">, now: CarNow | null, shut: string | null): Figure[] {
  const figures: Figure[] = [];
  const rows = new Map(now?.rows ?? []);
  let shutShown = false;
  for (const [label, value] of now?.rows ?? []) {
    if (SHUT_ROWS.has(label)) {
      if (shut && !shutShown) figures.push({ label: "Locks and doors", value: <Words>{shut}</Words> });
      shutShown = true;
      continue;
    }
    // On or off, as the car's own switch says. The car's states (Armed, Aware, Idle) are all on.
    if (label === "Sentry Mode") {
      const on = value === "Off" ? "Off" : "On";
      figures.push({
        label,
        value: state.sentry ? (
          <Words>
            <span className="inline-flex items-center gap-2">
              <SentryMark />
              {on}
            </span>
          </Words>
        ) : (
          <Words>{on}</Words>
        ),
      });
      continue;
    }
    // Inside and outside in one tile, inside first: the cabin is what the owner steps into.
    if (label === "Inside") {
      const outside = rows.get("Outside");
      figures.push({ label: "Temperature inside", value, note: outside ? `Outside ${outside}` : undefined });
      continue;
    }
    if (label === "Outside" && rows.has("Inside")) continue;
    // The climate, with whichever of the two modes that run it while parked is on, in one tile.
    if (label === "Climate") {
      const modes = [keeperWords(rows.get("Climate keeper")), overheatWords(rows.get("Cabin overheat protection"))].filter(Boolean).join(" · ");
      figures.push({ label, value: <Words>{value}</Words>, note: modes || undefined });
      continue;
    }
    if ((label === "Climate keeper" || label === "Cabin overheat protection") && rows.has("Climate")) continue;
    figures.push({ label, value: /^-?\d/.test(value) ? value : <Words>{value}</Words> });
  }
  return figures;
}

// Climate Keeper's mode when it's on, as the car names it: "Keep Climate on", "Dog Mode on", "Camp Mode on".
function keeperWords(mode: string | undefined): string | null {
  if (!mode || mode === "Off") return null;
  const name = { On: "Keep Climate", Keep: "Keep Climate", Dog: "Dog Mode", Party: "Camp Mode", Camp: "Camp Mode" }[mode];
  return `${name ?? "Climate Keeper"} on`;
}

// Cabin Overheat Protection when it's on: "Overheat protection on", "fan only" or "no AC".
function overheatWords(mode: string | undefined): string | null {
  if (!mode || mode === "Off") return null;
  return `Overheat protection ${mode === "No Ac" ? "no AC" : mode.toLowerCase()}`;
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
      car.chemistry,
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
    ["Window trim", car.exteriorTrim],
    ["Driver assistance", car.hardware],
    ["Charge port", car.chargePort],
    ["Steering", car.steering],
    // Shown under the tyres instead, when they're shown.
    ["Recommended tyre pressure", tyres.length === 0 && car.tyrePressure],
    ["VIN", car.vin && <Vin vin={car.vin} label={false} />],
  ]);

  return (
    <div className="flex flex-col gap-12">
      <div className="space-y-4">
        <CarHeader car={car} odometer={odometer} version={version} syncedAt={syncedAt} at={at} />
        <CarNotices notices={notices} />
      </div>

      {figures.length > 0 && (
        // "Now" only while the car is sending: asleep, these are what it last reported, so they say when.
        <Section
          title={syncedAt && at - Date.parse(syncedAt) <= FRESH_MS ? "Car now" : "Last known"}
          description={syncedAt && at - Date.parse(syncedAt) > FRESH_MS ? `As of ${formatShortDate(syncedAt)}, ${formatClock(syncedAt)}, when the car last reported.` : undefined}
        >
          {/* Two by two when the count is even, so no cell is left empty; Figures fills out an odd count itself. */}
          <Figures figures={figures} className={figures.length % 2 === 0 ? "sm:grid-cols-2" : undefined} label="The car's latest state" />
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

      {!car.checkedAt && (
        <p className="text-sm text-muted-foreground">
          Details fill in once the car is awake. Open the Tesla app to wake it.
        </p>
      )}
    </div>
  );
}

// The primary car's ids are known before its details, so its state is read alongside them; a car picked by
// id has its VIN only with its details.
async function CarContent({ id }: { id: Promise<string | null> }) {
  const carId = await id;
  if (carId === null) {
    const primary = await loadPrimary();
    const [car, live] = primary ? await Promise.all([loadCar(primary.id), loadLive(primary.id, primary.vin)]) : [null, null];
    if (!car || !live) return <p className="text-sm text-muted-foreground">No car on your Tesla account yet.</p>;
    return <Car car={car} live={live} />;
  }
  const car = await loadCar(carId);
  if (!car) notFound();
  return <Car car={car} live={await loadLive(car.id, car.vin)} />;
}

// Faint blocks in the shape of the page, section by section, in the same layout classes: the header card,
// then the tiles, the tyres and the specs in the usual state (a car that is awake).
function CarSkeleton() {
  const section = (title: string, children: ReactNode) => (
    <SkSection gap={3}>
      <p className="text-lg font-medium tracking-heading" aria-hidden="true">
        <Ph>{title}</Ph>
      </p>
      {children}
    </SkSection>
  );
  const spec = ([label, value, extra]: string[]) => (
    <div key={label} className="flex items-baseline justify-between gap-4 border-b py-2">
      <dt className="shrink-0">
        <Ph>{label}</Ph>
      </dt>
      <dd className="min-w-0 text-right">
        <Ph>{value}</Ph>
        {extra === "VIN" ? (
          <span className="ml-2 inline-block h-6 align-middle text-xs max-sm:ml-0 max-sm:block max-sm:h-auto">
            <Ph>Show full VIN</Ph>
          </span>
        ) : (
          extra && (
            <span className="block font-mono text-xs">
              <Ph>{extra}</Ph>
            </span>
          )
        )}
      </dd>
    </div>
  );
  return (
    <Loading className="flex flex-col gap-12">
      <div className="space-y-4" aria-hidden="true">
        {/* The picture's box: nearly every car in India has one (see carPicture). */}
        <div className="flex flex-col gap-5 rounded-lg border p-4 sm:flex-row-reverse sm:items-center sm:gap-6 sm:p-6">
          <div className={cn("rounded-md bg-muted/60", PICTURE_BOX)} />
          <div className="min-w-0 flex-1 space-y-5">
            <div className="min-w-0 space-y-1">
              <p className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">
                <Ph>Demo car</Ph>
              </p>
              <p className="text-sm">
                <Ph>2026 Model Y Standard Range · Diamond Black</Ph>
              </p>
            </div>
            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              {[
                ["Odometer", "9,000 km"],
                ["Software", "2026.38.5.1"],
                ["Usable capacity", "64.0 kWh"],
              ].map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <dt className="text-[0.8125rem] leading-5">
                    <Ph>{label}</Ph>
                  </dt>
                  <dd className="font-mono text-lg leading-none font-medium">
                    <Ph>{value}</Ph>
                    {label === "Software" && <span className="inline-block size-4 align-middle" />}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs">
              <Ph>Last synced 27 Oct, 4:50 PM</Ph>
            </p>
          </div>
        </div>
      </div>
      {section(
        "Car now",
        <SkFigures
          className="sm:grid-cols-2"
          tiles={[
            { label: "Locks and doors", value: "Locked, charge port open", words: true },
            { label: "Sentry Mode", value: "Off", words: true },
            { label: "Temperature inside", value: "36.3 °C", note: "Outside 32.2 °C" },
            { label: "Climate", value: "Off", words: true, note: "Overheat protection fan only" },
          ]}
        />,
      )}
      {section(
        "Tyres",
        <>
          <p className="text-sm" aria-hidden="true">
            <Ph>Rotate the tyres at 10,000 km, 1,000 km from now.</Ph>
          </p>
          <SkFigures
            className="sm:grid-cols-2"
            tiles={[
              { label: "Front left", value: "42 psi" },
              { label: "Front right", value: "42 psi" },
              { label: "Rear left", value: "41 psi" },
              { label: "Rear right", value: "40 psi" },
            ]}
          />
          <p className="text-xs" aria-hidden="true">
            <Ph>Updated 3 minutes ago · Recommended 42 psi front, 42 psi rear</Ph>
          </p>
        </>,
      )}
      {section(
        "Specs",
        <dl className="grid border-t text-sm sm:grid-cols-2 sm:gap-x-8" aria-hidden="true">
          {[
            ["Drive", "Rear-wheel drive"],
            ["Battery", "Standard Range"],
            ["Chemistry", "LFP"],
            ["Motor", "Single rear motor", "PM216MOSFET"],
            ["Built in", "Shanghai, China"],
            ["Wheels", "19″ Crossflow · aero covers"],
            ["Roof", "Glass"],
            ["Interior", "Black"],
            ["Window trim", "Black"],
            ["Driver assistance", "Hardware 4"],
            ["Charge port", "CCS · motorised door"],
            ["Steering", "Right-hand drive"],
            ["VIN", "••••0001", "VIN"],
          ].map(spec)}
        </dl>,
      )}
    </Loading>
  );
}

// /car/[id] and /car (the primary car, id null) render this.
export function CarPage({ id }: { id: Promise<string | null> }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="car" />
      <CarTabs value="car" />
      <Suspense fallback={<CarSkeleton />}>
        <CarContent id={id} />
      </Suspense>
      <PhoneNav current="car" />
    </div>
  );
}
