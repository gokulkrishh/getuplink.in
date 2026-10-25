import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncChargingSessions } from "@/components/background-sync";
import { listSessions } from "@/components/session-row";
import { ChargeHabits } from "@/components/stats/charge-habits";
import { ChargeRange } from "@/components/stats/charge-range";
import { ChargingMap, DcCurves } from "@/components/stats/charging-extras";
import { TopStations } from "@/components/stats/top-stations";
import { topStations } from "@/lib/top-stations";
import { CURVES, heldFrom, loadChargingExtras, PINNED } from "@/lib/server/charging-extra";
import { EnergyAdded, SessionList, Summary } from "@/components/stats/charging-sections";
import { eachFrame } from "@/components/home/frames";
import { customScope } from "@/components/stats/periods";
import { NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { matchSessions } from "@/lib/charge-sessions";
import type { Bill } from "@/lib/charging-figures";
import type { DrivingFigures } from "@/lib/driving-figures";
import { type CustomFrame, periodFrames } from "@/lib/frames";
import { backTo, serials } from "@/lib/kept";
import { customQuery, type CustomQuery, customRange, inSpan, rangeTimeframe, type Span } from "@/lib/periods";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadDrivingFigures } from "@/lib/server/driving";
import { loadRangeDriving } from "@/lib/server/home";
import { invoicesBySession } from "@/lib/server/receipts";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Charging · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Only what this page shows: both session lists. A range picked by date is an argument, so each one gets
// its own entry, with the distance driven in it and the curves and pins of its own charges.
type Invoices = Awaited<ReturnType<typeof invoicesBySession>>;
type Extras = Awaited<ReturnType<typeof loadChargingExtras>>;
type Held = ReturnType<typeof heldFrom>;

async function loadCharging(query: CustomQuery | null): Promise<{
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  invoices: Invoices;
  figures: DrivingFigures;
  extras: Extras;
  held: Held;
  custom: (CustomFrame & { extras: Extras; held: Held }) | null;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  const range = query && customRange("custom", query.from ?? undefined, query.to ?? undefined, now);
  const frame = range && rangeTimeframe(range, now);
  const [sessions, streamSessions, figures, rangeDriving] = await Promise.all([
    loadChargingSessions(),
    loadStreamSessions(),
    loadDrivingFigures(vin, now),
    frame ? loadRangeDriving("normal", vin, frame, now) : null,
  ]);
  const invoices = await invoicesBySession(streamSessions.filter((s) => !s.supercharger).map((s) => s.id));
  const [extras, rangeExtras] = await Promise.all([
    loadChargingExtras(vin, streamSessions),
    frame ? loadChargingExtras(vin, streamSessions.filter((s) => inSpan(Date.parse(s.started_at), frame.span))) : null,
  ]);
  const custom =
    range && frame && rangeExtras
      ? { range, frame, driving: rangeDriving, extras: rangeExtras, held: heldFrom(streamSessions.filter((s) => inSpan(Date.parse(s.started_at), frame.span))) }
      : null;
  return { sessions, streamSessions, invoices, figures, extras, held: heldFrom(streamSessions), custom, now };
}

async function Charging({ searchParams }: Pick<PageProps<"/stats/charging">, "searchParams">) {
  const { sessions, streamSessions, invoices, figures, extras, held, custom, now } = await loadCharging(customQuery(await searchParams));
  const { pairs, streamOnly } = matchSessions(sessions, streamSessions, now);
  const listed = listSessions(pairs, streamOnly);
  // Real bills: Tesla's for Superchargers, attached invoices for the rest. A finished charge with
  // neither is counted as unbilled, never priced.
  const bills: Bill[] = [
    ...sessions.flatMap((s) => (s.cost_total === null ? [] : [{ started_at: s.started_at, cost: s.cost_total, kwh: s.energy_kwh, kind: "dc" as const }])),
    ...streamOnly.flatMap((s) => {
      const invoice = invoices.get(s.id);
      return invoice ? [{ started_at: s.started_at, cost: invoice.amount, kwh: invoice.kwhBilled ?? s.energy_added_kwh, kind: s.kind }] : [];
    }),
  ];
  const unbilled = streamOnly.filter((s) => s.ended_at !== null && !invoices.has(s.id));
  // Each period, and the range picked by date; only the distance driven in each is read here.
  const frames = periodFrames(figures, custom, [], now);
  const startedIn = (span: Span) => (s: { started_at: string }) => inSpan(Date.parse(s.started_at), span);
  // One number per charge, counted from the oldest, so a charge has the same number in every list here.
  const serial = serials(listed, (l) => l.key);
  const streamSerial = new Map(listed.flatMap((l) => (l.stream ? [[l.stream.id, serial.get(l.key) ?? 0] as const] : [])));
  const stations = (span: Span) =>
    topStations([
      ...sessions.filter(startedIn(span)).map((s) => ({ name: s.site_name, kwh: s.energy_kwh, cost: s.cost_total })),
      ...streamOnly
        .filter((s) => s.ended_at !== null && startedIn(span)(s))
        .map((s) => ({ name: s.station_name, kwh: s.energy_added_kwh, cost: invoices.get(s.id)?.amount ?? null })),
    ]);
  const starts = (span: Span) => [...sessions, ...streamOnly].filter(startedIn(span)).map((s) => Date.parse(s.started_at));
  // The curves and pins are of the latest charges only (the range's own, for a range): each frame draws
  // those in its span, and says how far back they go when its span starts earlier.
  const extrasFor = (key: string) => (key === "custom" && custom ? { ...custom.extras, held: custom.held } : { ...extras, held });

  return (
    <StatsFrame view="charging" custom={customScope(custom?.range ?? null, now)} periodSwitch={listed.length > 0}>
      {listed.length === 0 ? (
        <NotYet title="No charging sessions yet">Your charges will show up here, wherever you plug in.</NotYet>
      ) : (
        <div className="space-y-12">
          {(bills.length > 0 || unbilled.length > 0) &&
            eachFrame(frames, ({ frame, driving }) => <Summary bills={bills} unbilled={unbilled} km={driving?.current.km ?? null} frame={frame} />, { steady: true })}
          {streamSessions.length > 0 && eachFrame(frames, ({ frame }) => <EnergyAdded sessions={sessions} streamOnly={streamOnly} frame={frame} />, { steady: true })}
          {eachFrame(frames, ({ frame }) => <ChargeHabits starts={starts(frame.span)} title={frame.title} words={frame.words} />, { steady: true })}
          {streamSessions.length > 0 &&
            eachFrame(frames, ({ frame }) => (
              <ChargeRange sessions={streamSessions.filter(startedIn(frame.span))} frame={frame} serialOf={(s) => streamSerial.get(s.id)} />
            ))}
          {(extras.curves.length > 0 || (custom?.extras.curves.length ?? 0) > 0) &&
            eachFrame(frames, ({ key, frame }) => {
              const { curves, held: from } = extrasFor(key);
              const shown = curves.filter((c) => startedIn(frame.span)({ started_at: c.date })).map((c) => ({ ...c, serial: streamSerial.get(c.id) }));
              return <DcCurves curves={shown} frame={frame} note={backTo(frame.span, from.curves, `Curves are kept for the latest ${CURVES} DC charges, which`)} />;
            })}
          {eachFrame(frames, ({ frame }) => (
            <TopStations rows={stations(frame.span)} title={frame.title} words={frame.words} />
          ))}
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
          {eachFrame(frames, ({ frame }) => {
            const shown = listed.filter(startedIn(frame.span));
            return shown.length > 0 ? (
              <SessionList sessions={shown} all={listed} />
            ) : (
              <section className="space-y-2">
                <h2 className="text-lg font-medium tracking-heading">Charging sessions</h2>
                <p className="text-sm text-muted-foreground">No charging sessions {frame.words}.</p>
              </section>
            );
          })}
        </div>
      )}
    </StatsFrame>
  );
}

export default function Page({ searchParams }: PageProps<"/stats/charging">) {
  return (
    <StatsPage description="What charging cost, the energy it added, and every session.">
      <Suspense fallback={<StatsSkeleton />}>
        <Charging searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <SyncChargingSessions />
      </Suspense>
    </StatsPage>
  );
}
