import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncChargingSessions } from "@/components/background-sync";
import { AiNotesSkeleton } from "@/components/home/week-tips";
import { TipsBox } from "@/components/tips-box";
import { CHARGING_TIPS, chargingFindings, pricedCharges } from "@/lib/charge-tips";
import { istDay, istDayStart } from "@/lib/telemetry-derive";
import { ChargeHabits } from "@/components/stats/charge-habits";
import { ChargeRange } from "@/components/stats/charge-range";
import { ChargingMap, DcCurves } from "@/components/stats/charging-extras";
import { moreCharges } from "./actions";
import { CURVES, heldFrom, loadChargingExtras, PINNED } from "@/lib/server/charging-extra";
import { type ChargingLists, listCharges, loadChargingLists, startedIn, withGoogleNames } from "@/lib/server/charging-lists";
import { EnergyAdded, PaidFor, SessionList, Summary } from "@/components/stats/charging-sections";
import { eachFrame } from "@/components/home/frames";
import { customScope } from "@/components/stats/periods";
import { ChargingSkeleton } from "@/components/stats/skeletons";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { chargingBills, chargingTime, firstStartedAt } from "@/lib/charging-figures";
import type { DrivingFigures } from "@/lib/driving-figures";
import { type CustomFrame, fromSince, periodFrames } from "@/lib/frames";
import { backTo, serials } from "@/lib/kept";
import { customQuery, type CustomQuery, customRange, inSpan, rangeTimeframe, type Span } from "@/lib/periods";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import type { ChargingSession } from "@/lib/server/charging";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadDrivingFigures } from "@/lib/server/driving";
import { loadRangeDriving } from "@/lib/server/home";
import type { StreamChargeSession } from "@/lib/server/stream-charging";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Charging" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Only what this page shows: both session lists. A range picked by date is an argument, so each one gets
// its own entry, with the distance driven in it and the curves and pins of its own charges.
type Extras = Awaited<ReturnType<typeof loadChargingExtras>>;
type Held = ReturnType<typeof heldFrom>;

async function loadCharging(query: CustomQuery | null): Promise<{
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  invoices: ChargingLists["invoices"];
  figures: DrivingFigures;
  extras: Extras;
  held: Held;
  custom: (CustomFrame & { extras: Extras; held: Held }) | null;
  vehicleId: string | null;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const car = await loadPrimaryVehicle(owner);
  const vin = car?.vin ?? null;
  const range = query && customRange("custom", query.from ?? undefined, query.to ?? undefined, now);
  const frame = range && rangeTimeframe(range, now);
  const [{ sessions, streamSessions, invoices, extras }, figures, rangeDriving] = await Promise.all([
    loadChargingLists(owner, vin, now),
    loadDrivingFigures(owner, vin, now),
    frame ? loadRangeDriving(owner, "normal", vin, frame, now) : null,
  ]);
  const rangeExtras = frame
    ? await loadChargingExtras(owner, vin, streamSessions.filter(startedIn(frame.span)), { tesla: sessions, invoices, now }).then(withGoogleNames)
    : null;
  const custom =
    range && frame && rangeExtras
      ? { range, frame, driving: rangeDriving, extras: rangeExtras, held: heldFrom(streamSessions.filter(startedIn(frame.span))) }
      : null;
  return { sessions, streamSessions, invoices, figures, extras, held: heldFrom(streamSessions), custom, vehicleId: car?.id ?? null, now };
}

async function Charging({ searchParams }: Pick<PageProps<"/stats/charging">, "searchParams">) {
  const query = customQuery(await searchParams);
  const { sessions, streamSessions, invoices, figures, extras, held, custom, vehicleId, now } = await loadCharging(query);
  const { listed, streamOnly } = listCharges({ sessions, streamSessions, invoices, extras }, now);
  // Real bills: Tesla's for Superchargers, attached invoices for the rest. A finished charge with
  // neither is counted as unbilled, never priced.
  const bills = chargingBills(sessions, streamOnly, invoices);
  const unbilled = streamOnly.filter((s) => s.ended_at !== null && !invoices.has(s.id));
  // Each period, and the range picked by date; only the distance driven in each is read here.
  const frames = periodFrames(figures, custom, [], now);
  // The charging charts start at the first charge's day (see fromSince).
  const chargingSince = firstStartedAt(sessions, streamSessions);
  // Each charge's number in a period's session list, top row 1, so the charts in that period use the same.
  const streamSerial = (span: Span) => {
    const serial = serials(listed.filter(startedIn(span)), (l) => l.key);
    return new Map(listed.flatMap((l) => (l.stream && serial.has(l.key) ? [[l.stream.id, serial.get(l.key) ?? 0] as const] : [])));
  };
  const starts = (span: Span) => [...sessions, ...streamOnly].filter(startedIn(span)).map((s) => Date.parse(s.started_at));
  // The curves and pins are of the latest charges only (the range's own, for a range): each frame draws
  // those in its span, and says how far back they go when its span starts earlier.
  // The tips (lib/charge-tips.ts), over every charge: the period switch below doesn't change them.
  const tips = chargingFindings({
    priced: pricedCharges(sessions, streamOnly, invoices),
    energy: {
      ac: streamOnly.filter((s) => s.kind === "ac").reduce((sum, s) => sum + (s.energy_added_kwh ?? 0), 0),
      dc: sessions.reduce((sum, s) => sum + (s.energy_kwh ?? 0), 0) + streamOnly.filter((s) => s.kind === "dc").reduce((sum, s) => sum + (s.energy_added_kwh ?? 0), 0),
    },
    dcWithCurves: extras.curves.length,
    tapered: extras.curves.flatMap((c) => (c.taper ? [{ at: Date.parse(c.date), taper: c.taper }] : [])),
  });
  const today = istDayStart(istDay(now));
  const extrasFor = (key: string) => (key === "custom" && custom ? { ...custom.extras, held: custom.held } : { ...extras, held });

  return (
    <StatsFrame custom={customScope(custom?.range ?? null, now)} periodSwitch={listed.length > 0}>
      {listed.length === 0 ? (
        <NotYet title="No charges yet">Your charges will show up here, wherever you plug in.</NotYet>
      ) : (
        <div className="space-y-12">
          {vehicleId && tips.length > 0 && (
            <Suspense fallback={<AiNotesSkeleton />}>
              <TipsBox surface={CHARGING_TIPS} vehicleId={vehicleId} at={today} daily entity={String(today)} findings={tips} />
            </Suspense>
          )}
          {(bills.length > 0 || unbilled.length > 0 || sessions.length > 0) &&
            eachFrame(frames, (f) => {
              const { frame, driving } = fromSince(f, chargingSince, now);
              return <Summary bills={bills} unbilled={unbilled} charged={chargingTime(sessions, streamOnly, frame.span)} km={driving?.current.km ?? null} frame={frame} chargingSince={chargingSince} />;
            })}
          {streamSessions.length > 0 &&
            eachFrame(frames, (f) => <EnergyAdded sessions={sessions} streamOnly={streamOnly} frame={fromSince(f, chargingSince, now).frame} chargingSince={chargingSince} />)}
          {eachFrame(frames, ({ key, frame }) => {
            const shown = listed.filter(startedIn(frame.span));
            return shown.length > 0 ? (
              <SessionList sessions={shown} more={moreCharges.bind(null, { period: key, query })} />
            ) : (
              <section className="space-y-2">
                <h2 className="text-lg font-medium tracking-heading">Charging sessions</h2>
                <p className="text-sm text-muted-foreground">No charges.</p>
              </section>
            );
          })}
          {bills.some((b) => b.parts) && eachFrame(frames, (f) => <PaidFor bills={bills} frame={fromSince(f, chargingSince, now).frame} />)}
          {streamSessions.length > 0 &&
            eachFrame(frames, ({ frame }) => (
              <ChargeRange sessions={streamSessions.filter(startedIn(frame.span))} frame={frame} serialOf={(s) => streamSerial(frame.span).get(s.id)} />
            ))}
          {eachFrame(frames, ({ frame }) => <ChargeHabits starts={starts(frame.span)} />)}
          {(extras.curves.length > 0 || (custom?.extras.curves.length ?? 0) > 0) &&
            eachFrame(frames, ({ key, frame }) => {
              const { curves, held: from } = extrasFor(key);
              const shown = curves.filter((c) => startedIn(frame.span)({ started_at: c.date })).map((c) => ({ ...c, serial: streamSerial(frame.span).get(c.id) }));
              return <DcCurves curves={shown} frame={frame} note={backTo(frame.span, from.curves, `Curves are kept for the latest ${CURVES} DC charges, which`)} />;
            })}
          {(extras.pins.length > 0 || (custom?.extras.pins.length ?? 0) > 0) &&
            eachFrame(frames, ({ key, frame }) => {
              const { pins, held: from } = extrasFor(key);
              return (
                <ChargingMap
                  pins={pins.filter((p) => inSpan(p.t, frame.span))}
                  frame={frame}
                  note={backTo(frame.span, from.pins, `Pins are kept for the latest ${PINNED} charges, which`)}
                />
              );
            })}
        </div>
      )}
    </StatsFrame>
  );
}

export default function Page({ searchParams }: PageProps<"/stats/charging">) {
  return (
    <StatsPage view="charging" description="Every charge, and what it really cost you.">
      <Suspense fallback={<StatsSkeleton><ChargingSkeleton /></StatsSkeleton>}>
        <Charging searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncChargingSessions />
      </Suspense>
    </StatsPage>
  );
}
