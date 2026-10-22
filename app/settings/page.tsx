import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { logout } from "@/app/actions";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ThemePicker } from "@/components/theme-picker";
import { DEMO } from "@/lib/demo";
import { formatAgo, formatDate, formatSeen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChargingRates } from "@/lib/charging-rates";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { loadChargingRates } from "@/lib/server/charging-rates";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { demoData } from "@/lib/server/demo";
import { countImported } from "@/lib/server/import-updates";
import { db } from "@/lib/server/supabase";
import { lastReadingAt } from "@/lib/server/telemetry";
import { accountInfo, type AccountInfo } from "@/lib/server/tesla";
import { ChargingRatesForm } from "./charging-rates";
import { DeleteMyData, DisconnectTesla, SignOutEverywhere } from "./confirm-actions";
import { ImportUpdates, UndoImport } from "./import-updates";
import { Row } from "./row";

export const metadata: Metadata = { title: "Settings · Uplink" };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="mb-2 text-xs font-medium tracking-wide text-faint uppercase">{title}</h2>
      <div className="divide-y border-t">{children}</div>
    </section>
  );
}

// Session check plus data in one browser-only private cache, so header links can prefetch it (see app/page.tsx).
async function loadSettings(): Promise<{
  account: AccountInfo;
  lastCheck: string | null;
  lastReading: string | null;
  rates: ChargingRates;
  imported: number;
  now: number;
}> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const [account, run, lastReading, rates, imported] = await Promise.all([
    accountInfo(),
    DEMO
      ? { data: demoData().lastRun }
      : db().from("poll_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    lastReadingAt(),
    loadChargingRates(),
    countImported(),
  ]);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { account, lastCheck: run.data?.started_at ?? null, lastReading, rates, imported, now: Date.now() };
}

async function Settings() {
  const { account, lastCheck, lastReading, rates, imported, now } = await loadSettings();
  const connectedDescription = account.connectedSince ? `Connected since ${formatDate(account.connectedSince)}` : "Connected";

  return (
    <>
      <Group title="General">
        <Row title="Theme" description="Saved in this browser." control={<ThemePicker />} />
        <Row
          title="Live data"
          description={
            <>
              <p>Your car sends updates while it&apos;s awake. Uplink never wakes it.</p>
              <p className="text-faint">
                {lastCheck ? `Full check every 6 hours, last at ${formatSeen(lastCheck, now)}` : "Full check every 6 hours"}
              </p>
            </>
          }
          control={<LiveStatus lastReading={lastReading} now={now} />}
        />
      </Group>

      <Group title="Charging rates">
        <ChargingRatesForm rates={rates} />
      </Group>

      <Group title="Version history">
        <ImportUpdates />
        <UndoImport count={imported} />
      </Group>

      <Group title="Account">
        {account.connected ? (
          <DisconnectTesla description={connectedDescription} />
        ) : (
          <Row title="Tesla account" description="Not connected" />
        )}
        <Row
          title="Sign out"
          description="On this device."
          control={
            <form action={logout}>
              <Button type="submit" variant="outline" size="lg">
                Sign out
              </Button>
            </form>
          }
        />
        <Row
          title="Sign out everywhere"
          description="Ends every session on every device, including this one."
          control={
            <SignOutEverywhere />
          }
        />
      </Group>

      <Group title="Your data">
        <DeleteMyData />
      </Group>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header current="settings" />
      <h1 className="mb-8 text-base font-medium tracking-heading">Settings</h1>
      <Suspense fallback={<div role="status" aria-busy="true" className="h-64 bg-muted motion-safe:animate-pulse"><span className="sr-only">Loading…</span></div>}>
        <Settings />
      </Suspense>
      <footer className="mt-16 flex justify-end gap-4 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground transition-colors duration-150">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground transition-colors duration-150">
          Terms
        </Link>
        <Link href="/status" prefetch={false} className="hover:text-foreground transition-colors duration-150">
          Status
        </Link>
      </footer>
    </div>
  );
}

// Within 10 minutes of a reading the car is awake and streaming; otherwise when it last sent anything.
function LiveStatus({ lastReading, now }: { lastReading: string | null; now: number }) {
  if (!lastReading) return <p className="text-xs text-muted-foreground">No readings yet</p>;
  const live = now - Date.parse(lastReading) < 10 * 60_000;
  return (
    <p className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <span className={cn("size-1.5 rounded-full", live ? "bg-positive" : "bg-faint")} aria-hidden="true" />
      <span>
        {live ? "Live" : "Asleep"}
        <span className="text-muted-foreground"> · {formatAgo(lastReading, now)}</span>
      </span>
    </p>
  );
}
