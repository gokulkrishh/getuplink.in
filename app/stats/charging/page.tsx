import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncChargingSessions } from "@/components/background-sync";
import { listSessions } from "@/components/session-row";
import { EnergyAdded, SessionList, Summary } from "@/components/stats/charging-sections";
import { parsePeriod } from "@/components/stats/periods";
import { eachPeriod, NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { matchSessions } from "@/lib/charge-sessions";
import { type ChargingRates, pricedSessions } from "@/lib/charging-rates";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";
import { loadChargingRates } from "@/lib/server/charging-rates";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";

export const metadata: Metadata = { title: "Charging · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Only what this page shows: both session lists and the owner's rates.
async function loadCharging(): Promise<{ sessions: ChargingSession[]; streamSessions: StreamChargeSession[]; rates: ChargingRates; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const [sessions, streamSessions, rates] = await Promise.all([loadChargingSessions(), loadStreamSessions(), loadChargingRates()]);
  return { sessions, streamSessions, rates, now };
}

async function Charging({ searchParams }: Pick<PageProps<"/stats/charging">, "searchParams">) {
  // Read outside the cache: the period only picks what's shown first, and switches in the browser.
  const period = parsePeriod((await searchParams).period);
  const { sessions, streamSessions, rates, now } = await loadCharging();
  const { pairs, streamOnly } = matchSessions(sessions, streamSessions, now);
  const priced = pricedSessions(streamOnly, rates);
  const listed = listSessions(pairs, streamOnly);

  return (
    <StatsFrame view="charging" period={period} periodSwitch={listed.length > 0}>
      {listed.length === 0 ? (
        <NotYet title="No charging sessions yet">Your charges will show up here, wherever you plug in.</NotYet>
      ) : (
        <div className="space-y-12">
          {(sessions.length > 0 || priced.length > 0) && eachPeriod((p) => <Summary sessions={sessions} priced={priced} now={now} period={p} />)}
          {streamSessions.length > 0 && eachPeriod((p) => <EnergyAdded sessions={sessions} streamOnly={streamOnly} now={now} period={p} />)}
          <SessionList sessions={listed} rates={rates} />
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
