import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AdminPage as AdminFrame } from "@/components/admin/admin-page";
import { formatDateTime } from "@/lib/format";
import { type AdminPage, isAdmin, loadAdmin, RECENT_DAYS } from "@/lib/server/admin";
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
  const { runs } = data;
  return (
    <AdminFrame tab="overview" description={`Totals across every owner. ${data.simulated ? "Demo: simulated." : "No VINs or names."}`}>
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

      {/* Only when there's something to add: a new model or pack code, e.g. the first Model Y L. */}
      {data.unknownCars && data.unknownCars.length > 0 && (
        <Group title="Cars Uplink can't name yet" note="Add these codes to lib/car.ts so the car page names the model and pack.">
          {data.unknownCars.map((car) => (
            <Item key={car.userId} label={`User ${car.userId}`} value={car.codes.join(", ")} />
          ))}
        </Group>
      )}

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

      <p className="text-xs text-faint">As of {formatDateTime(now)}</p>
    </AdminFrame>
  );
}
