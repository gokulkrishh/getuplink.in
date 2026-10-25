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
import { loadChargingExtras } from "@/lib/server/charging-extra";
import { EnergyAdded, SessionList, Summary } from "@/components/stats/charging-sections";
import { eachFrame } from "@/components/home/frames";
import { customScope } from "@/components/stats/periods";
import { byRange, NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { matchSessions } from "@/lib/charge-sessions";
import type { Bill } from "@/lib/charging-figures";
import type { DrivingFigures } from "@/lib/driving-figures";
import { type CustomFrame, periodFrames } from "@/lib/frames";
import { customQuery, type CustomQuery, customRange, inSpan, rangeTimeframe } from "@/lib/periods";
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

async function loadCharging(query: CustomQuery | null): Promise<{
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  invoices: Invoices;
  figures: DrivingFigures;
  extras: Extras;
  custom: (CustomFrame & { extras: Extras }) | null;
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
  const custom = range && frame && rangeExtras ? { range, frame, driving: rangeDriving, extras: rangeExtras } : null;
  return { sessions, streamSessions, invoices, figures, extras, custom, now };
}

async function Charging({ searchParams }: Pick<PageProps<"/stats/charging">, "searchParams">) {
  const { sessions, streamSessions, invoices, figures, extras, custom, now } = await loadCharging(customQuery(await searchParams));
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
  const range = frames.find((f) => f.key === "custom");
  const started = (s: { started_at: string }) => !range || inSpan(Date.parse(s.started_at), range.frame.span);
  const stations = (inRange: boolean) =>
    topStations([
      ...sessions.filter((s) => !inRange || started(s)).map((s) => ({ name: s.site_name, kwh: s.energy_kwh, cost: s.cost_total })),
      ...streamOnly
        .filter((s) => s.ended_at !== null && (!inRange || started(s)))
        .map((s) => ({ name: s.station_name, kwh: s.energy_added_kwh, cost: invoices.get(s.id)?.amount ?? null })),
    ]);
  const starts = (inRange: boolean) =>
    [...sessions, ...streamOnly].filter((s) => !inRange || started(s)).map((s) => Date.parse(s.started_at));

  return (
    <StatsFrame view="charging" custom={customScope(custom?.range ?? null, now)} periodSwitch={listed.length > 0}>
      {listed.length === 0 ? (
        <NotYet title="No charging sessions yet">Your charges will show up here, wherever you plug in.</NotYet>
      ) : (
        <div className="space-y-12">
          {(bills.length > 0 || unbilled.length > 0) &&
            eachFrame(frames, ({ frame, driving }) => <Summary bills={bills} unbilled={unbilled} km={driving?.current.km ?? null} frame={frame} />, { steady: true })}
          {streamSessions.length > 0 && eachFrame(frames, ({ frame }) => <EnergyAdded sessions={sessions} streamOnly={streamOnly} frame={frame} />, { steady: true })}
          {byRange(range, <ChargeHabits starts={starts(false)} />, ({ frame }) => (
            <ChargeHabits starts={starts(true)} title={frame.title} />
          ))}
          {byRange(range, <ChargeRange sessions={streamSessions} />, ({ frame }) => (
            <ChargeRange sessions={streamSessions.filter(started)} title={frame.title} />
          ))}
          {byRange(range, <DcCurves curves={extras.curves} />, ({ frame }) => (
            <DcCurves curves={custom?.extras.curves ?? []} title={frame.title} />
          ))}
          {byRange(range, <TopStations rows={stations(false)} />, ({ frame }) => (
            <TopStations rows={stations(true)} title={frame.title} />
          ))}
          {byRange(range, <ChargingMap pins={extras.pins} />, ({ frame }) => (
            <ChargingMap pins={custom?.extras.pins ?? []} title={frame.title} />
          ))}
          {byRange(range, <SessionList sessions={listed} />, ({ frame }) => {
            const shown = listed.filter(started);
            return shown.length > 0 ? <SessionList sessions={shown} all={listed} /> : <p className="text-sm text-muted-foreground">No charging sessions {frame.words}.</p>;
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
