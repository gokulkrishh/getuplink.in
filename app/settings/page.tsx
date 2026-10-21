import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { DEMO } from "@/lib/demo";
import { formatDate, formatDateTime } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { accountInfo, type AccountInfo } from "@/lib/server/tesla";
import { DeleteMyData, DisconnectTesla } from "./confirm-actions";
import { signOutEverywhere } from "./actions";

export const metadata: Metadata = { title: "Settings · Uplink" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t py-8 sm:grid-cols-[12rem_1fr] sm:gap-8">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 text-sm">{children}</div>
    </section>
  );
}

async function loadSettings(): Promise<{ account: AccountInfo; lastCheck: string | null }> {
  if (DEMO) return { account: { connected: true, connectedSince: new Date(Date.now() - 86_400_000).toISOString() }, lastCheck: new Date().toISOString() };
  const [account, run] = await Promise.all([
    accountInfo(),
    db().from("poll_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { account, lastCheck: run.data?.started_at ?? null };
}

async function Settings() {
  await connection();
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const { account, lastCheck } = await loadSettings();

  return (
    <>
      <Section title="Appearance">
        <ThemePicker />
      </Section>

      <Section title="Checks">
        <p>Uplink checks your car every 6 hours. It never wakes the car.</p>
        <p className="text-muted-foreground flex gap-1 items-center">{lastCheck ? `Last checked ${formatDateTime(lastCheck)}` : "No checks yet."}</p>
      </Section>

      <Section title="Account">
        <p>
          {account.connected ? "Tesla account connected" : "Tesla account not connected"}
          {account.connected && account.connectedSince && (
            <span className="text-muted-foreground"> since {formatDate(account.connectedSince)}</span>
          )}
        </p>

        <div className="space-y-2">
          <form action={signOutEverywhere}>
            <Button type="submit" variant="outline" className="h-9 px-4">
              Sign out everywhere
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">Ends every session on every device, including this one.</p>
        </div>

        {account.connected && (
          <div className="space-y-2">
            <DisconnectTesla />
          </div>
        )}
      </Section>

      <Section title="Your data" description="Vehicles, version history, check logs and your Tesla connection.">
        <DeleteMyData />
      </Section>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <header className="mb-12 flex items-center justify-between gap-4 text-sm">
        <Link href="/" className="flex items-center gap-2.5 font-medium">
          <Logo className="size-5" />
          Uplink
        </Link>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Back to dashboard
        </Link>
      </header>
      <h1 className="mb-8 text-2xl font-medium tracking-tight">Settings</h1>
      <Suspense fallback={<div className="h-64 bg-muted motion-safe:animate-pulse" aria-busy="true" aria-label="Loading settings" />}>
        <Settings />
      </Suspense>
    </div>
  );
}
