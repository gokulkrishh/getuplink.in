import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncChargingSessions } from "@/components/background-sync";
import { listSessions } from "@/components/session-row";
import { EnergyAdded, SessionList, Summary } from "@/components/stats/charging-sections";
import { eachPeriod, NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { matchSessions } from "@/lib/charge-sessions";
import type { Bill } from "@/lib/charging-figures";
import type { Period } from "@/lib/periods";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadDrivingFigures } from "@/lib/server/driving";
import { invoicesBySession } from "@/lib/server/receipts";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";

export const metadata: Metadata = { title: "Charging · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Only what this page shows: both session lists.
type Invoices = Awaited<ReturnType<typeof invoicesBySession>>;

async function loadCharging(): Promise<{
  sessions: ChargingSession[];
  streamSessions: StreamChargeSession[];
  invoices: Invoices;
  km: Record<Period, number | null>;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const vin = (await loadPrimaryVehicle())?.vin ?? null;
  const [sessions, streamSessions, figures] = await Promise.all([loadChargingSessions(), loadStreamSessions(), loadDrivingFigures(vin, now)]);
  const invoices = await invoicesBySession(streamSessions.filter((s) => !s.supercharger).map((s) => s.id));
  const km = Object.fromEntries(Object.entries(figures.periods).map(([p, f]) => [p, f.current.km])) as Record<Period, number | null>;
  return { sessions, streamSessions, invoices, km, now };
}

async function Charging() {
  const { sessions, streamSessions, invoices, km, now } = await loadCharging();
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

  return (
    <StatsFrame view="charging" periodSwitch={listed.length > 0}>
      {listed.length === 0 ? (
        <NotYet title="No charging sessions yet">Your charges will show up here, wherever you plug in.</NotYet>
      ) : (
        <div className="space-y-12">
          {(bills.length > 0 || unbilled.length > 0) &&
            eachPeriod((p) => <Summary bills={bills} unbilled={unbilled} km={km[p]} now={now} period={p} />, { steady: true })}
          {streamSessions.length > 0 && eachPeriod((p) => <EnergyAdded sessions={sessions} streamOnly={streamOnly} now={now} period={p} />, { steady: true })}
          <SessionList sessions={listed} />
        </div>
      )}
    </StatsFrame>
  );
}

export default function Page() {
  return (
    <StatsPage description="What charging cost, the energy it added, and every session.">
      <Suspense fallback={<StatsSkeleton />}>
        <Charging />
      </Suspense>
      <Suspense>
        <SyncChargingSessions />
      </Suspense>
    </StatsPage>
  );
}
