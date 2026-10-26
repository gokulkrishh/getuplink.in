import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { OsmCredit, rate, streamName } from "@/components/session-row";
import { chargeType, needsName } from "@/lib/charge-names";
import { NamePlace } from "@/components/name-place";
import { ChargeCurve } from "@/components/stats/charge-curve";
import { ChargeFees } from "@/components/stats/charge-fees";
import { ChargeSupply } from "@/components/stats/charge-supply";
import { Figures } from "@/components/stats/figures";
import { splitSite } from "@/lib/charge-sessions";
import { formatClock, formatDate, formatDuration, formatKw, formatKwh, formatLevels, formatMoney, formatTempRange } from "@/lib/format";
import { currentOwner, SIGNED_OUT_PATH } from "@/lib/server/auth";
import { type ChargeDetail, loadChargeDetail } from "@/lib/server/charge-curve";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { InfoButton } from "@/components/info-button";

export const metadata: Metadata = { title: "Charge · Uplink" };


// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
async function loadDetail(id: number): Promise<ChargeDetail | null> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const owner = await currentOwner();
  if (!owner) redirect(SIGNED_OUT_PATH);
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  return loadChargeDetail(owner, id, Date.now());
}

// Tesla's bill for a Supercharger, an attached invoice for anything else (₹/kWh on the kWh billed, as
// charged). A finished session with neither says so instead of guessing.
function cost(tesla: ChargeDetail["tesla"], invoice: ChargeDetail["invoice"], energy: number | null, currency: string, s: ChargeDetail["session"]): string | null {
  if (tesla && tesla.cost_total !== null) return [formatMoney(tesla.cost_total, currency), energy && rate(tesla.cost_total, energy, currency)].filter(Boolean).join(" · ");
  if (invoice) return [formatMoney(invoice.amountTotal, "INR"), rate(invoice.amountTotal, invoice.kwhBilled ?? energy ?? 0, "INR")].filter(Boolean).join(" · ");
  return !s.supercharger && s.ended_at ? "Not available" : null;
}

function Charge({ detail }: { detail: ChargeDetail }) {
  const { session: s, tesla, invoice, curve } = detail;
  // Tesla's site for a Supercharger it billed; otherwise the best name known, with the kind of charge
  // under it, or the kind alone.
  // The owner's own name for the spot comes first, over Tesla's site name too.
  const tag = detail.target?.tag?.name ?? null;
  const named = tesla ? (tag ? { text: tag, source: "tag" as const } : null) : streamName(s, invoice, detail.place, tag);
  const site = tesla ? splitSite(tesla.site_name) : null;
  const { place, city } = site ? { place: named?.text ?? site.place, city: site.city } : { place: named?.text ?? chargeType(s), city: named ? chargeType(s) : null };
  const stoppedAt = tesla?.stopped_at ?? s.ended_at;
  const span = stoppedAt
    ? `${formatClock(s.started_at)} to ${formatClock(stoppedAt)} · ${formatDuration((Date.parse(stoppedAt) - Date.parse(s.started_at)) / 1000)}`
    : `From ${formatClock(s.started_at)} · In progress`;
  const peak = s.peak_power_kw ?? curve.peakKw;
  const energy = tesla?.energy_kwh ?? s.energy_added_kwh;
  const currency = tesla?.currency ?? "INR";
  // The stored temperatures can carry over from long before an AC charge, so only DC falls back to them.
  const tempLow = curve.tempMinC ?? (s.kind === "dc" ? s.temp_start_c : null);
  const tempHigh = curve.tempMaxC ?? (s.kind === "dc" ? s.temp_max_c : null);
  // Related figures sit together: what the battery did, how fast it charged, and what it cost.
  const groups: { title: string; rows: [string, string | null][] }[] = [
    {
      title: "Battery",
      rows: [
        ["Charge level", s.start_level !== null && s.end_level !== null ? formatLevels(s.start_level, s.end_level) : null],
        ["Energy added", energy !== null ? formatKwh(energy) : null],
        ["Battery temperature", tempLow !== null && tempHigh !== null ? formatTempRange(tempLow, tempHigh) : null],
      ],
    },
    {
      title: "Power",
      rows: [
        ["Peak power", peak ? formatKw(peak) : null],
        ["Average power", curve.avgKw ? formatKw(curve.avgKw) : null],
      ],
    },
    {
      title: "Bill",
      rows: [
        ["Cost", cost(tesla, invoice, energy, currency, s)],
        ["Energy billed", invoice?.kwhBilled ? formatKwh(invoice.kwhBilled) : null],
        ["GST", invoice?.gst ? formatMoney(invoice.gst, "INR") : null],
      ],
    },
  ];
  const sections = groups
    .map((g) => ({ title: g.title, rows: g.rows.filter((r): r is [string, string] => r[1] !== null) }))
    .filter((g) => g.rows.length > 0);
  const shown = sections.flatMap((g) => g.rows);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">{place}</h1>
        {detail.target && (!tesla && needsName(named) ? <NamePlace target={detail.target} /> : detail.target.tag && <NamePlace target={detail.target} compact />)}
      </div>
      <p className="mt-2 mb-12 text-sm text-muted-foreground tabular-nums">{[city, formatDate(s.started_at), span].filter(Boolean).join(" · ")}</p>
      <div className="space-y-12">
        {curve.points.length >= 2 && <ChargeCurve points={curve.points} />}
        {shown.length > 0 && (
          <section className="space-y-6">
            {/* The units the tiles use, in plain words, and what kind of charge this was. The chart above
                already explains kW when it shows. */}
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-medium tracking-heading">Session</h2>
              <InfoButton
                label="this session"
                terms={[
                  curve.points.length < 2 && shown.some(([label]) => label.endsWith("power")) ? "kW" : undefined,
                  shown.some(([label]) => label.startsWith("Energy")) ? "kWh" : undefined,
                  shown.some(([, value]) => value.includes("/kWh")) ? "₹/kWh" : undefined,
                  s.kind === "dc" ? "DC" : "AC",
                ]}
              />
            </div>
            {sections.map((g) => (
              <div key={g.title} className="space-y-3">
                <h3 className="text-base font-medium tracking-heading">{g.title}</h3>
                {/* "₹450 · ₹18/kWh" shows the amount as the figure and the rate under it. */}
                <Figures
                  figures={g.rows.map(([label, value]) => {
                    const [main, ...rest] = value.split(" · ");
                    return { label, value: main, note: rest.join(" · ") || undefined };
                  })}
                />
              </div>
            ))}
          </section>
        )}
        <ChargeFees fees={detail.fees} currency={currency} />
        <ChargeSupply session={s} />
      </div>
      {invoice?.hasFile && (
        <a href={`/api/charging/receipt/${s.id}`} target="_blank" rel="noopener" className="mt-6 inline-block text-sm text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline">
          {invoice.network} invoice
        </a>
      )}
      {(named?.source === "station" || named?.source === "place") && <OsmCredit className="mt-8" />}
    </>
  );
}

async function ChargeLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  const detail = await loadDetail(Number(id));
  if (!detail) notFound();
  return <Charge detail={detail} />;
}

function ChargeSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div role="status" className="space-y-12">
      <span className="sr-only">Loading…</span>
      <div className={`h-8 w-48 ${block}`} />
      <div className={`h-44 w-full ${block}`} />
      <div className={`h-40 w-full ${block}`} />
    </div>
  );
}

export default function Page({ params }: PageProps<"/stats/charging/[id]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header />
      <Suspense fallback={<ChargeSkeleton />}>
        <ChargeLoader params={params} />
      </Suspense>
    </div>
  );
}
