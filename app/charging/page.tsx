import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { formatDateTime, formatKwh, formatMoney, formatMonth } from "@/lib/format";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargingSession, loadChargingSessions } from "@/lib/server/charging";

export const metadata: Metadata = { title: "Charging · Uplink" };

function Header() {
  return (
    <header className="mb-16 flex items-center justify-between gap-4 text-sm">
      <Link href="/" className="flex items-center gap-2.5 font-medium">
        <Logo className="size-5" />
        Uplink
      </Link>
      <nav className="flex items-baseline gap-4 text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Dashboard
        </Link>
        <Link href="/settings" className="hover:text-foreground">
          Settings
        </Link>
      </nav>
    </header>
  );
}

function Summary({ sessions }: { sessions: ChargingSession[] }) {
  const month = formatMonth(new Date());
  const thisMonth = sessions.filter((s) => formatMonth(s.started_at) === month);
  const energy = thisMonth.reduce((sum, s) => sum + (s.energy_kwh ?? 0), 0);
  const cost = thisMonth.reduce((sum, s) => sum + (s.cost_total ?? 0), 0);
  const currency = thisMonth.find((s) => s.currency)?.currency ?? "INR";
  return (
    <dl className="grid gap-8 sm:grid-cols-2">
      <div className="space-y-1">
        <dt className="text-xs tracking-wide text-faint uppercase">Energy this month</dt>
        <dd className="text-2xl font-medium">{formatKwh(energy)}</dd>
      </div>
      <div className="space-y-1">
        <dt className="text-xs tracking-wide text-faint uppercase">Cost this month</dt>
        <dd className="text-2xl font-medium">{formatMoney(cost, currency)}</dd>
      </div>
    </dl>
  );
}

function SessionRow({ session: s }: { session: ChargingSession }) {
  const invoice = s.invoices.find((i) => i.contentId);
  return (
    <li className="flex items-start justify-between gap-4 py-3 text-sm">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate font-medium">{s.site_name ?? "Supercharger"}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(s.started_at)}</p>
      </div>
      <div className="shrink-0 space-y-0.5 text-right">
        <p>{s.energy_kwh === null ? "—" : formatKwh(s.energy_kwh)}</p>
        <p className="text-muted-foreground">{s.cost_total === null ? "—" : formatMoney(s.cost_total, s.currency ?? "INR")}</p>
        {invoice?.contentId && (
          <a
            href={`/api/charging/invoice/${encodeURIComponent(invoice.contentId)}`}
            className="inline-block text-xs text-faint hover:text-foreground"
          >
            Invoice
          </a>
        )}
      </div>
    </li>
  );
}

function SessionList({ sessions }: { sessions: ChargingSession[] }) {
  // Sessions arrive newest first, so each month's group is in order too.
  const groups = new Map<string, ChargingSession[]>();
  for (const s of sessions) {
    const month = formatMonth(s.started_at);
    groups.set(month, [...(groups.get(month) ?? []), s]);
  }
  return (
    <div className="space-y-10">
      {[...groups].map(([month, rows]) => (
        <section key={month} className="space-y-2">
          <h2 className="text-xs font-medium tracking-wide text-faint uppercase">{month}</h2>
          <ul className="divide-y border-t">
            {rows.map((s) => (
              <SessionRow key={s.session_id} session={s} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function Sessions() {
  await connection();
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  const sessions = await loadChargingSessions();

  if (sessions.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-base font-medium tracking-[-0.01em]">No Supercharger sessions yet</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Turn on Vehicle Charging Management in the Tesla developer app, set TESLA_CHARGING=1, then sign in with Tesla again.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-12">
      <Summary sessions={sessions} />
      <SessionList sessions={sessions} />
    </div>
  );
}

function SessionsSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading charging sessions" className="space-y-12">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className={`h-10 w-40 ${block}`} />
        <div className={`h-10 w-40 ${block}`} />
      </div>
      <div className={`h-20 w-full ${block}`} />
    </div>
  );
}

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-20">
      <Header />
      <h1 className="text-2xl font-medium tracking-[-0.01em]">Charging</h1>
      <p className="mt-2 mb-12 text-sm text-muted-foreground">Tesla Supercharger sessions. Other networks come later.</p>
      <Suspense fallback={<SessionsSkeleton />}>
        <Sessions />
      </Suspense>
    </div>
  );
}
