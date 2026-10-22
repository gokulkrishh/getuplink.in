import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SyncChargingSessions } from "@/components/background-sync";
import { listSessions } from "@/components/session-row";
import { EnergyAdded, SessionList, Summary } from "@/components/stats/charging-sections";
import { eachPeriod, NotYet, StatsFrame, StatsPage, StatsSkeleton } from "@/components/stats/stats-frame";
import { matchSessions } from "@/lib/charge-sessions";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { loadStreamSessions, type StreamChargeSession } from "@/lib/server/stream-charging";

export const metadata: Metadata = { title: "Charging · Uplink" };

// Session check plus data in one browser-only private cache, so links can prefetch it (see app/page.tsx).
// Only what this page shows: both session lists.
async function loadCharging(): Promise<{ sessions: ChargingSession[]; streamSessions: StreamChargeSession[]; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const [sessions, streamSessions] = await Promise.all([loadChargingSessions(), loadStreamSessions()]);
  return { sessions, streamSessions, now };
}

async function Charging() {
  const { sessions, streamSessions, now } = await loadCharging();
  const { pairs, streamOnly } = matchSessions(sessions, streamSessions, now);
  const listed = listSessions(pairs, streamOnly);

  return (
    <StatsFrame view="charging" periodSwitch={listed.length > 0}>
      {listed.length === 0 ? (
        <NotYet title="No charging sessions yet">Your charges will show up here, wherever you plug in.</NotYet>
      ) : (
        <div className="space-y-12">
          {sessions.length > 0 && eachPeriod((p) => <Summary sessions={sessions} now={now} period={p} />, { steady: true })}
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
