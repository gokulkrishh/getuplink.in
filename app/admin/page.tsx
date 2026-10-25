import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { formatDateTime } from "@/lib/format";
import { type AdminPage, isAdmin, loadAdmin, RECENT_DAYS, USAGE_DAYS } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { Measure } from "@/components/measure";

export const metadata: Metadata = { title: "Admin · Uplink" };

// The admin check runs before anything streams, so a non-admin gets a real 404 status rather than a 200 with
// the not-found page in it. That means the page waits for the check instead of showing a skeleton first.
export const instant = false;

const heading = "text-lg font-medium tracking-heading";
const number = new Intl.NumberFormat("en-IN");

async function loadAdminPage(): Promise<{ data: AdminPage; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (!(await isAdmin())) notFound();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  return { data: await loadAdmin(now), now };
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className={heading}>{title}</h2>
      <dl className="divide-y border-t">{children}</dl>
      {note && <p className="pt-1 text-xs text-faint">{note}</p>}
    </section>
  );
}

function Item({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={muted ? "text-faint" : "font-mono font-medium tabular-nums"}>{muted ? value : <Measure text={value} />}</dd>
    </div>
  );
}

export default async function Page() {
  const { data, now } = await loadAdminPage();
  const { runs, api } = data;
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-base font-medium tracking-heading">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Totals across every owner. {data.simulated ? "Demo mode: every figure here is simulated." : "No VINs or names."}
          </p>
        </header>

        <Group title="Owners and cars">
          <Item label="Owners" value={number.format(data.owners)} />
          <Item label="Cars" value={number.format(data.cars)} />
          <Item label={`Online at a check, last ${RECENT_DAYS} days`} value={number.format(data.onlineRecently)} />
        </Group>

        <Group title="Versions" note={data.noVersion > 0 ? `${data.noVersion} more not seen online yet, so no version.` : undefined}>
          {data.versions.length === 0 ? (
            <Item label="No car has reported a version yet" value="—" muted />
          ) : (
            data.versions.map((v) => <Item key={v.version} label={v.version} value={`${number.format(v.cars)} ${v.cars === 1 ? "car" : "cars"}`} />)
          )}
        </Group>

        <Group title={`Checks, last ${RECENT_DAYS} days`}>
          <Item label="Checks run" value={number.format(runs.total)} />
          <Item label="Failed" value={number.format(runs.failed)} />
          {runs.lastFailedAt && <Item label="Last failure" value={formatDateTime(runs.lastFailedAt)} />}
        </Group>

        <Group title={`Health checks, last ${RECENT_DAYS} days`} note="Checks that found the component down, of all checks.">
          {data.health.map((h) => (
            <Item key={h.component} label={h.component} value={h.total ? `${number.format(h.down)} of ${number.format(h.total)}` : "Not checked"} muted={!h.total} />
          ))}
        </Group>

        {api.kind === "simulated" ? (
          <Group title={`Tesla API, last ${USAGE_DAYS} days`} note="Simulated for the demo.">
            <Item label="Requests" value={number.format(api.requests)} />
            <Item label="Cost" value={`$${api.costUsd.toFixed(2)}`} />
          </Group>
        ) : (
          <Group
            title={`Tesla API, last ${USAGE_DAYS} days`}
            note="Fleet API requests aren't counted yet. Each check makes a few requests, so the number of checks is a lower bound, not a request count."
          >
            <Item label="Requests" value="Not tracked yet" muted />
            <Item label="Cost" value="Not tracked yet" muted />
            <Item label="Checks run (proxy)" value={number.format(api.checks)} />
          </Group>
        )}

        <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
      </div>
    </div>
  );
}
