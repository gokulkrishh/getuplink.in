import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { DEMO } from "@/lib/demo";
import { formatDate, formatSeen } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { db } from "@/lib/server/supabase";
import { accountInfo, type AccountInfo } from "@/lib/server/tesla";
import { DeleteMyData, DisconnectTesla } from "./confirm-actions";
import { signOutEverywhere } from "./actions";
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
async function loadSettings(): Promise<{ account: AccountInfo; lastCheck: string | null; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (DEMO) return { account: { connected: true, connectedSince: new Date(Date.now() - 86_400_000).toISOString() }, lastCheck: new Date().toISOString(), now: Date.now() };
  const [account, run] = await Promise.all([
    accountInfo(),
    db().from("poll_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return { account, lastCheck: run.data?.started_at ?? null, now: Date.now() };
}

async function Settings() {
  const { account, lastCheck, now } = await loadSettings();
  const connectedDescription = account.connectedSince ? `Connected since ${formatDate(account.connectedSince)}` : "Connected";

  return (
    <>
      <Group title="General">
        <Row title="Theme" description="Saved in this browser." control={<ThemePicker />} />
        <Row
          title="Automatic checks"
          description="Every 6 hours. Uplink never wakes the car."
          control={
            <p className="text-right text-xs text-muted-foreground">
                {lastCheck ? (
                  <>
                    Last checked
                    <span className="block text-sm text-foreground tabular-nums">{formatSeen(lastCheck, now)}</span>
                  </>
                ) : (
                  "No checks yet"
                )}
              </p>
          }
        />
      </Group>

      <Group title="Account">
        {account.connected ? (
          <DisconnectTesla description={connectedDescription} />
        ) : (
          <Row title="Tesla account" description="Not connected" />
        )}
        <Row
          title="Sign out everywhere"
          description="Ends every session on every device, including this one."
          control={
            <form action={signOutEverywhere}>
              <Button type="submit" variant="outline" className="h-9 px-4">
                Sign out everywhere
              </Button>
            </form>
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
      <header className="mb-12 flex items-center justify-between gap-4 text-sm">
        <Link href="/" prefetch={true} className="flex items-center gap-2.5 font-medium">
          <Logo className="size-5" />
          Uplink
        </Link>
        <Link href="/" prefetch={true} className="text-muted-foreground hover:text-foreground">
          Back to dashboard
        </Link>
      </header>
      <h1 className="mb-8 text-base font-medium tracking-[-0.01em]">Settings</h1>
      <Suspense fallback={<div className="h-64 bg-muted motion-safe:animate-pulse" aria-busy="true" aria-label="Loading settings" />}>
        <Settings />
      </Suspense>
      <footer className="mt-16 flex gap-4 border-t pt-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground transition-colors duration-150">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground transition-colors duration-150">
          Terms
        </Link>
      </footer>
    </div>
  );
}
