import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminPage as AdminFrame } from "@/components/admin/admin-page";
import { accessAnchor, outcomeLine } from "@/lib/failed-checks";
import { formatDateTime, formatSeen } from "@/lib/format";
import { STATUS_URL } from "@/lib/site";
import { STATUS_WORD } from "@/lib/status";
import { cn } from "@/lib/utils";
import { type AdminPage, type ComponentHealthSummary, isAdmin, loadAdmin, RECENT_DAYS } from "@/lib/server/admin";
import { hasCurrentSession, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { Measure } from "@/components/measure";
import { Figures } from "@/components/stats/figures";

export const metadata: Metadata = { title: "Admin" };

// The admin check runs before anything streams, so a non-admin gets a real 404 status rather than a 200 with
// the not-found page in it. That means the page waits for the check instead of showing a skeleton first.
export const instant = false;

const heading = "text-lg font-medium tracking-heading";
const number = new Intl.NumberFormat("en-IN");

async function loadAdminPage(): Promise<{ data: AdminPage; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  // 5 minutes or more lets the page come along with a link's prefetch, so the tabs switch at once (Next's
  // instant-navigation guide); saves still refresh it at once (updateTag).
  cacheLife({ stale: 300 });
  if (!(await hasCurrentSession())) redirect(SIGNED_OUT_PATH);
  if (!(await isAdmin())) notFound();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  return { data: await loadAdmin(now), now };
}

function Group({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className={heading}>{title}</h2>
      <dl className="divide-y border-t">{children}</dl>
      {note && <p className="pt-1 text-xs text-faint">{note}</p>}
    </section>
  );
}

// A row with no value is an empty state: its label alone.
function Item({ label, value, muted }: { label: React.ReactNode; value?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      {value !== undefined && <dd className={muted ? "text-faint" : "font-mono font-medium tabular-nums"}>{muted ? value : <Measure text={value} />}</dd>}
    </div>
  );
}

// An account named as Admin > Access names it, linking to its row there.
function AccountName({ id, account }: { id: number; account: { name: string; vin: string | null } }) {
  return (
    <>
      <Link href={`/admin/waitlist#${accessAnchor(id)}`} className="underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground">
        {account.name}
      </Link>
      {account.vin && <span className="font-mono text-xs text-faint"> · VIN …{account.vin}</span>}
    </>
  );
}

const DOT = { operational: "bg-positive", degraded: "bg-muted-foreground", down: "bg-destructive" } as const;

const times = (n: number) => (n === 1 ? "once" : `${number.format(n)} times`);

// A part's latest check as a coloured dot and word, and under it any problems this week.
function HealthRow({ h, now }: { h: ComponentHealthSummary; now: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{h.component}</dt>
      <dd className="text-right">
        {h.status ? (
          <span className={cn("inline-flex items-center gap-2 font-medium", h.status === "down" && "text-destructive")}>
            <span aria-hidden className={cn("size-2 rounded-full", DOT[h.status])} />
            {STATUS_WORD[h.status]}
          </span>
        ) : (
          <span className="text-faint">Not checked</span>
        )}
        {h.down > 0 && h.lastProblemAt && (
          <span className="block text-xs text-muted-foreground">
            Not working {times(h.down)}, last {formatSeen(h.lastProblemAt, now)}
          </span>
        )}
      </dd>
    </div>
  );
}

export default async function Page() {
  const { data, now } = await loadAdminPage();
  const { runs } = data;
  const lastChecked = data.health.map((h) => h.checkedAt).filter(Boolean).sort().at(-1);
  return (
    <AdminFrame description={`Totals across every owner. ${data.simulated ? "Demo: simulated." : "No VINs or names."}`}>
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
          <Item label={data.notStreaming ? "Every car streams" : "Not known yet"} />
        ) : (
          data.notStreaming.map((car, i) => (
            <Item
              key={`${car.userId}-${i}`}
              label={<AccountName id={car.userId} account={car.account} />}
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

      {/* Only when there's something to add: a new model or pack code, e.g. the first Model Y L. */}
      {data.unknownCars && data.unknownCars.length > 0 && (
        <Group title="Cars Uplink can't name yet" note="Add these codes to lib/car.ts so the car page names the model and pack.">
          {data.unknownCars.map((car) => (
            <Item key={car.userId} label={<AccountName id={car.userId} account={car.account} />} value={car.codes.join(", ")} />
          ))}
        </Group>
      )}

      <Group title="Versions" note={data.noVersion > 0 ? `${data.noVersion} more not seen online yet.` : undefined}>
        {data.versions.length === 0 ? (
          <Item label="No car has reported a version yet" />
        ) : (
          data.versions.map((v) => <Item key={v.version} label={v.version} value={`${number.format(v.cars)} ${v.cars === 1 ? "car" : "cars"}`} />)
        )}
      </Group>

      <section className="space-y-3">
        <h2 className={heading}>{`Car checks, last ${RECENT_DAYS} days`}</h2>
        <Figures
          figures={[
            { label: "Checks run", value: number.format(runs.total) },
            { label: "Failed", value: number.format(runs.failed) },
          ]}
        />
        {runs.failures.length > 0 && (
          <dl className="divide-y border-y">
            {runs.failures.map((f, i) => (
              <div key={`${f.at}-${i}`} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <dt className="min-w-0">
                  <span className="text-muted-foreground">{f.reason}</span>
                  {f.account && f.userId !== null && (
                    <span className="block">
                      <AccountName id={f.userId} account={f.account} />
                    </span>
                  )}
                </dt>
                <dd className="shrink-0 text-right">
                  <span className="block text-faint">{formatSeen(f.at, now)}</span>
                  {f.outcome && (
                    <span className={cn("block text-xs", f.outcome.state === "open" ? "text-destructive" : "text-muted-foreground")}>
                      {outcomeLine(f.outcome, (at) => formatSeen(at, now))}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <Group
        title="Health"
        note={
          <>
            {lastChecked ? `Checked hourly, last at ${formatSeen(lastChecked, now)}. Problems from the last ${RECENT_DAYS} days. ` : `Problems from the last ${RECENT_DAYS} days. `}
            <a href={STATUS_URL} target="_blank" rel="noreferrer" className="underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground">
              Status page
            </a>
          </>
        }
      >
        {data.health.map((h) => (
          <HealthRow key={h.component} h={h} now={now} />
        ))}
      </Group>

      <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
    </AdminFrame>
  );
}
