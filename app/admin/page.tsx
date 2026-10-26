import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { formatDateTime, formatUsd } from "@/lib/format";
import { type AdminPage, isAdmin, loadAdmin, RECENT_DAYS } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { Measure } from "@/components/measure";
import { Figures } from "@/components/stats/figures";

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
      <Header setup={false} />
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Totals across every owner. {data.simulated ? "Demo mode: every figure here is simulated." : "No VINs or names."}
          </p>
          <p className="text-sm">
            <Link href="/admin/waitlist" prefetch={true} className="underline decoration-border underline-offset-4 hover:decoration-foreground">
              Waitlist
            </Link>
            <span aria-hidden className="mx-1.5 text-faint">
              ·
            </span>
            <Link href="/admin/costs" prefetch={true} className="underline decoration-border underline-offset-4 hover:decoration-foreground">
              Costs
            </Link>
          </p>
        </header>

        {/* The headline counts as tiles, like the figures on every other screen; the lists below stay lists. */}
        <section className="space-y-3">
          <h2 className={heading}>Owners and cars</h2>
          <Figures
            figures={[
              { label: "Owners", value: number.format(data.owners) },
              { label: "Cars", value: number.format(data.cars) },
              { label: "Online at a check", value: number.format(data.onlineRecently), note: `Last ${RECENT_DAYS} days` },
            ]}
          />
        </section>

        <Group
          title="Cars not streaming yet"
          note={
            data.notStreaming === null
              ? "Shown once the car_setup migration is applied."
              : data.sendsConfig
                ? "Uplink sends each car its streaming config once the key is on."
                : "Uplink can't send streaming configs: TESLA_PRIVATE_KEY_PEM or TELEMETRY_CA_PEM isn't set."
          }
        >
          {!data.notStreaming || data.notStreaming.length === 0 ? (
            <Item label={data.notStreaming ? "Every car streams" : "Not known yet"} value="—" muted />
          ) : (
            data.notStreaming.map((car, i) => (
              <Item
                key={`${car.userId}-${i}`}
                label={`User ${car.userId}`}
                value={
                  car.keyPaired === false
                    ? "No key yet"
                    : car.keyPaired === null
                      ? "Key not checked"
                      : car.streaming === "pending"
                        ? "Config sent, car not online yet"
                        : car.streaming === "full"
                          ? "No room for another app"
                          : car.sentAt
                            ? `Config sent ${formatDateTime(car.sentAt)}`
                            : "Waiting for config"
                }
                muted
              />
            ))
          )}
        </Group>

        <Group title="Versions" note={data.noVersion > 0 ? `${data.noVersion} more not seen online yet.` : undefined}>
          {data.versions.length === 0 ? (
            <Item label="No car has reported a version yet" value="—" muted />
          ) : (
            data.versions.map((v) => <Item key={v.version} label={v.version} value={`${number.format(v.cars)} ${v.cars === 1 ? "car" : "cars"}`} />)
          )}
        </Group>

        <section className="space-y-3">
          <h2 className={heading}>{`Checks, last ${RECENT_DAYS} days`}</h2>
          <Figures
            figures={[
              { label: "Checks run", value: number.format(runs.total) },
              { label: "Failed", value: number.format(runs.failed), note: runs.lastFailedAt ? `Last at ${formatDateTime(runs.lastFailedAt)}` : "None" },
            ]}
          />
        </section>

        <Group title={`Health checks, last ${RECENT_DAYS} days`} note="Checks that found the component down, of all checks.">
          {data.health.map((h) => (
            <Item key={h.component} label={h.component} value={h.total ? `${number.format(h.down)} of ${number.format(h.total)}` : "Not checked"} muted={!h.total} />
          ))}
        </Group>

        {/* The month's estimate only; Costs has what it's made of. */}
        <Link
          href="/admin/costs#cost-tesla"
          prefetch={true}
          className="flex items-baseline justify-between gap-4 border-y py-3 text-sm hover:bg-muted/50"
        >
          <span className="text-muted-foreground underline decoration-border underline-offset-4">Tesla API this month</span>
          {api.counted ? (
            <span className="font-mono font-medium tabular-nums">
              <Measure text={formatUsd(api.costUsd)} />
            </span>
          ) : (
            <span className="text-faint">Not counted yet</span>
          )}
        </Link>

        <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
      </div>
    </div>
  );
}
