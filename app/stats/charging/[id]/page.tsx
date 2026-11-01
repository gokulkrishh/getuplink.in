import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ChargeSkeleton } from "@/components/stats/skeletons";
import { loadTipsBox } from "@/components/tips-box";
import { CHARGE_TIPS, chargeFindings, type PricedCharge } from "@/lib/charge-tips";
import { loadPricedCharges } from "@/lib/server/charge-tips";
import { loadPrimaryVehicle } from "@/lib/server/telemetry";
import { Header } from "@/components/header";
import { BackLink } from "@/components/stats/back-link";
import { rate, streamName } from "@/components/session-row";
import { chargeType, googleMapsUrl, nameAction } from "@/lib/charge-names";
import { GoogleMapsCredit } from "@/components/google-maps-credit";
import { NamePlace } from "@/components/name-place";
import { ChargeCurve } from "@/components/stats/charge-curve";
import { ChargeFees } from "@/components/stats/charge-fees";
import { ChargeSupply } from "@/components/stats/charge-supply";
import { InvoiceSection } from "@/components/stats/invoice-lines";
import { Figures } from "@/components/stats/figures";
import { splitSite } from "@/lib/charge-sessions";
import { formatClock, formatDate, formatDurationExact, formatKw, formatKwh, formatLevels, formatMoney, formatTempRange, withDayWord } from "@/lib/format";
import { requireReader } from "@/lib/server/auth";
import { showsInvoices, shownTo } from "@/lib/server/data/owner";
import { HIDDEN_PLACE, type Shown } from "@/lib/view-links";
import { type ChargeDetail, loadChargeDetail } from "@/lib/server/charge-curve";
import { OWNER_DATA_TAG } from "@/lib/server/dashboard";
import { isChargeId } from "@/lib/stats-paths";

export const metadata: Metadata = { title: "Charge" };


// Session check plus data in one browser-only private cache, like the other pages (see app/page.tsx).
// With the owner's billed charges and car, for the tips.
// guest: someone the owner sent a guest link, who gets no owner controls and never an invoice.
type DetailShown = Shown & { invoices: boolean; guest: boolean };

async function loadDetail(id: number): Promise<{ detail: ChargeDetail | null; priced: PricedCharge[]; vehicleId: string | null; shown: DetailShown; now: number }> {
  "use cache: private";
  cacheTag(OWNER_DATA_TAG);
  cacheLife({ stale: 60 });
  const { owner } = await requireReader();
  // The clock is read inside the cache; reading it while rendering blocks prerendering.
  const now = Date.now();
  const [detail, priced, car] = await Promise.all([loadChargeDetail(owner, id, now), loadPricedCharges(owner, now), loadPrimaryVehicle(owner)]);
  return { detail, priced, vehicleId: car?.id ?? null, shown: { ...shownTo(owner), invoices: showsInvoices(owner), guest: owner.viewOnly === true }, now };
}

// This charge against the owner's others (lib/charge-tips.ts).
function chargeTips(detail: ChargeDetail, priced: PricedCharge[]) {
  const id = detail.tesla ? `t${detail.tesla.session_id}` : `s${detail.session.id}`;
  return chargeFindings({ charge: priced.find((c) => c.id === id) ?? null, others: priced.filter((c) => c.id !== id), kind: detail.session.kind, taper: detail.taper });
}

// Tesla's bill for a Supercharger, an attached invoice for anything else (₹/kWh on the kWh billed, as
// charged). A finished session with neither says so instead of guessing.
function cost(tesla: ChargeDetail["tesla"], invoice: ChargeDetail["invoice"], energy: number | null, currency: string, s: ChargeDetail["session"]): string | null {
  if (tesla && tesla.cost_total !== null) return [formatMoney(tesla.cost_total, currency), energy && rate(tesla.cost_total, energy, currency)].filter(Boolean).join(" · ");
  if (invoice) return [formatMoney(invoice.amountTotal, "INR"), rate(invoice.amountTotal, invoice.kwhBilled ?? energy ?? 0, "INR")].filter(Boolean).join(" · ");
  return !s.supercharger && s.ended_at ? "Not available" : null;
}

function Charge({ detail, now, tips, shown: reader }: { detail: ChargeDetail; now: number; tips: ReactNode; shown: DetailShown }) {
  const { session: s, tesla, invoice, curve } = detail;
  // Tesla's site for a Supercharger it billed, with its city under it; otherwise the best name known, or
  // the kind of charge when there's no name.
  // The owner's own name for the spot comes first, over Tesla's site name too: typed, or the Google place
  // they picked (live, credited beside it).
  const tag = detail.target?.tag?.name ?? null;
  const google = detail.google;
  const named = tesla ? (tag ? { text: tag, source: "tag" as const } : null) : streamName(s, invoice, detail.place, tag);
  const site = tesla ? splitSite(tesla.site_name) : null;
  const best = google ?? named?.text ?? null;
  // A guest whose link hides locations: the kind of charge as the title, and "Hidden" where its place goes.
  const { place, city } = !reader.locations
    ? { place: chargeType(s), city: HIDDEN_PLACE }
    : site
      ? { place: best ?? site.place, city: site.city }
      : { place: best ?? chargeType(s), city: null };
  // A tagged spot gets the pencil; otherwise "Name this place" unless Tesla's site already names it.
  // Never for a guest: naming a place is the owner's.
  const action = !detail.target || reader.guest ? null : tesla && !detail.target.tag ? null : nameAction({ name: named, target: detail.target });
  // Where it was: the car's own location when it started, else a search for Tesla's site name.
  const mapsHref = detail.spot
    ? googleMapsUrl(detail.spot)
    : tesla?.site_name
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Tesla Supercharger ${tesla.site_name}`)}`
      : null;
  const stoppedAt = tesla?.stopped_at ?? s.ended_at;
  // Under the title only the day and the times, as on a drive page; how long it took is a figure below.
  const span = stoppedAt ? `${formatClock(s.started_at)} to ${formatClock(stoppedAt)}` : `From ${formatClock(s.started_at)}, still charging`;
  // The charge's start and end are seen to the second, so its length is too.
  const took = stoppedAt ? formatDurationExact((Date.parse(stoppedAt) - Date.parse(s.started_at)) / 1000) : null;
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
        ["Time charging", took],
        ["Peak power", peak ? formatKw(peak) : null],
        ["Average power", curve.avgKw ? formatKw(curve.avgKw) : null],
      ],
    },
    // An attached invoice has its own section below, with everything it printed.
    // An attached invoice has its own section below, for the owner; a viewer sees what it came to here.
    { title: "Bill", rows: [["Cost", invoice && reader.invoices ? null : cost(tesla, invoice, energy, currency, s)]] },
  ];
  const sections = groups
    .map((g) => ({ title: g.title, rows: g.rows.filter((r): r is [string, string] => r[1] !== null) }))
    .filter((g) => g.rows.length > 0);
  const shown = sections.flatMap((g) => g.rows);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">
          {/* The name opens the spot in Google Maps, dotted like the other links beside it. */}
          {mapsHref ? (
            <a href={mapsHref} target="_blank" rel="noopener" title="Open in Google Maps" className="tap-target underline decoration-dotted decoration-muted-foreground underline-offset-4 transition-colors hover:decoration-foreground">
              {place}
            </a>
          ) : (
            place
          )}
        </h1>
        {google && <GoogleMapsCredit />}
        {detail.target && action && <NamePlace target={detail.target} compact={action === "rename"} />}
      </div>
      <p className="mt-2 mb-12 text-sm text-muted-foreground tabular-nums">
        {[city, withDayWord(formatDate(s.started_at), s.started_at, now), span].filter(Boolean).join(" · ")}
      </p>
      <div className="space-y-12">
        {tips}
        {curve.points.length >= 2 && <ChargeCurve points={curve.points} />}
        {shown.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-lg font-medium tracking-heading">Details</h2>
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
        {invoice && reader.invoices && <InvoiceSection invoice={invoice} href={invoice.hasFile ? `/api/charging/receipt/${s.id}` : undefined} received={energy} />}
        <ChargeFees fees={detail.fees} currency={currency} />
        <ChargeSupply session={s} />
      </div>
    </>
  );
}

async function ChargeLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isChargeId(id)) notFound();
  const { detail, priced, vehicleId, shown, now } = await loadDetail(Number(id));
  if (!detail) notFound();
  const tips = chargeTips(detail, priced);
  const at = Date.parse(detail.session.started_at);
  return (
    <Charge
      detail={detail}
      now={now}
      shown={shown}
      tips={await loadTipsBox({ surface: CHARGE_TIPS, vehicleId, at, daily: false, entity: String(detail.session.id), findings: tips })}
    />
  );
}

export default function Page({ params }: PageProps<"/stats/charging/[id]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-12 sm:pt-8 sm:pb-20">
      <Header current="charging" />
      <BackLink list="/stats/charging" label="Back to Charging" />
      <Suspense fallback={<ChargeSkeleton />}>
        <ChargeLoader params={params} />
      </Suspense>
    </div>
  );
}
