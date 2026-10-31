import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loading, Ph, SkBigLabel, SkBlock, SkChart, SkChartCaptioned, SkFigures, SkHead, SkHeadline, SkLine, SkSection, SkShowMore, SkTable, SkTripRows } from "@/components/skeleton";
import { CHARGING_PREVIEW } from "@/components/stats/charging-sections";
import { PARKED_COLUMNS, PARKED_TABLE, TABLE_FRAME, TABLE_HEAD, TABLE_HEAD_ROW } from "@/lib/table-frame";
import { Skeleton } from "@/components/ui/skeleton";

// What each Stats topic shows while its data loads: its sections in order, each built from the section's own
// layout classes (see components/skeleton.tsx), at the size of the page's default period (Week). Rows and
// tiles are the usual count; a section that only some data shows (a long span's, a quiet week's) is left out.

export function DrivingSkeleton() {
  return (
    <>
      <SkSection>
        <p className="text-lg font-medium tracking-heading">
          <Ph>Drive stats</Ph>
        </p>
        <SkFigures
          tiles={[
            { label: "Trips", value: "11", note: "11 drives" },
            { label: "Typical drive", value: "16.8 km", note: "Half your drives are longer" },
            { label: "Longest drive", value: "47.4 km" },
            { label: "Time driving", value: "9 h 57 min" },
          ]}
        />
      </SkSection>
      <SkSection>
        <SkHead title="Distance" />
        <SkHeadline value="279.4 km" line="Driven, 43.7 km more than the 7 days before." />
        <SkChartCaptioned caption="32.6 kWh used, 5.5 kWh won back while slowing, 117 Wh/km, the same as the 7 days before." />
      </SkSection>
      <SkSection>
        {/* The sentence in the description's place, then the closed row the bars sit behind (ChartCard's `shut`). */}
        <SkHead title="Efficiency" description="In the last 7 days, your car used 116 to 120 Wh/km, whatever the AC setting or outside temperature." />
        <div className="flex items-center justify-between gap-4 border-y py-2 text-sm" aria-hidden="true">
          <span className="min-w-0">
            <Ph>By AC setting and outside temperature</Ph>
          </span>
          <span className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "pointer-events-none")}>
            <Ph>Show</Ph>
          </span>
        </div>
      </SkSection>
      <SkSection gap={6}>
        <SkHead title="Trips" description="11 trips · 11 drives" note="Open a trip to see its map, speed and battery use." />
        <SkTripRows />
        <SkShowMore />
      </SkSection>
      <SkSection gap={6}>
        <SkHead title="Places" description="Where you went and parked." gap={2} />
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-96 rounded-lg" />
          <p className="text-xs">
            <Ph>A place it parked. Bigger pins had more visits.</Ph>
          </p>
        </div>
        <SkTable head={["#", "Place", "Visits", "Time parked", "Last visit"]} rows={5} cell="py-3.25" />
        <SkShowMore />
        <p className="text-sm" aria-hidden="true">
          <Ph>Names you give come first, then OpenStreetMap&apos;s. Places named from Google Maps show their area on the map. Home, Work and Favourite are the ones set in your car.</Ph>
        </p>
      </SkSection>
      {/* The speed and season sections show on the long spans only, but each leaves its (empty) slot in the stack. */}
      <div aria-hidden="true" />
    </>
  );
}


const panel = (h: string, phone: string) => `${h} ${phone}`;

export function ChargingSkeleton() {
  return (
    <>
      <SkSection gap={8}>
        <SkSection>
          <SkHead title="Spend" />
          <SkHeadline value="₹417.84" line="Spent on charging, ₹281.28 more than the 7 days before." />
          <SkChart />
        </SkSection>
        <SkFigures
          tiles={[
            { label: "Energy billed", value: "39.8 kWh" },
            { label: "Bills", value: "2" },
            { label: "DC rate", value: "₹24.00/kWh" },
            { label: "Time on AC", value: "2 h 36 min" },
            { label: "Time on DC", value: "15 min" },
          ]}
        />
        <SkLine>2 charges have no bill yet, so they aren&apos;t counted.</SkLine>
      </SkSection>
      <SkSection gap={8}>
        <SkSection>
          <SkHead title="Energy added" description="Energy into the battery, by charger type." />
          <SkHeadline value="39.8 kWh" line="Added, 16.0 kWh more than the 7 days before." />
          <SkChartCaptioned caption="Wed to Tue" />
        </SkSection>
        <SkLine>AC charging efficiency 92%</SkLine>
      </SkSection>
      <SkSection gap={6}>
        <SkHead title="Charging sessions" description="9 sessions · 39.8 kWh" note="Open a charge to see where, how much and what it cost." />
        <SkSessions />
      </SkSection>
      <SkSection gap={3}>
        <SkHead title="What you paid for" description="Your spend, line by line from the bills." />
        <div className="divide-y rounded-lg border text-sm" aria-hidden="true">
          {["Charging", "Total"].map((label) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <Ph>{label}</Ph>
              <Ph className="font-mono">₹417.84</Ph>
            </div>
          ))}
        </div>
      </SkSection>
      <SkSection>
        <SkHead title="Charge range" description="Where charges started and stopped." />
        <div className="space-y-2" aria-hidden="true">
          <p className="font-mono text-4xl font-medium tracking-tight">
            <Ph>60% to 80%</Ph>
          </p>
          <p className="text-sm">
            <Ph>Typical start and end, from 3 charges</Ph>
          </p>
        </div>
        <div className="space-y-2" aria-hidden="true">
          <div>
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b pb-2 text-xs">
              <Ph>#</Ph>
              <Ph>Charge</Ph>
            </div>
            <ul className="divide-y">
              {[0, 1, 2].map((k) => (
                <li key={k} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline py-3">
                  <span className="text-xs">
                    <Ph>1</Ph>
                  </span>
                  <div className="space-y-1">
                    <p className="flex justify-between gap-3 text-sm">
                      <Ph>25 Oct · Home AC</Ph>
                      <Ph className="font-mono">60% to 80%</Ph>
                    </p>
                    <Skeleton className="h-2 rounded-full" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <SkLine>Latest 3 charges, newest first</SkLine>
        </div>
      </SkSection>
      <SkSection>
        <SkHead title="When you charge" description="When charges started, India time." />
        <SkLine>Most often Tue, 3 PM to 6 PM, 1 charge.</SkLine>
        <div className="space-y-1.5 rounded-lg bg-muted p-3 dark:bg-card" aria-hidden="true">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="grid grid-cols-[2.5rem_repeat(8,minmax(0,1fr))] items-center gap-1.5">
              <span className="text-xs">
                <Ph>{day}</Ph>
              </span>
              {Array.from({ length: 8 }, (_, k) => (
                <span key={k} className="h-6 rounded-sm bg-background max-sm:h-7" />
              ))}
            </div>
          ))}
          <div className="grid grid-cols-[2.5rem_repeat(8,minmax(0,1fr))] gap-1.5 text-xs">
            <span />
            {["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"].map((label, k) => (
              <span key={label} className={k % 2 === 1 ? "whitespace-nowrap max-sm:invisible" : "whitespace-nowrap"}>
                <Ph>{label}</Ph>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-x-3 pt-1 text-xs">
            <Ph>None 1 charge</Ph>
          </div>
        </div>
      </SkSection>
      <SkSection gap={6}>
        <SkSection>
          <SkHead title="DC charging speed" description="Charging power by battery level, from 1 DC charge. It drops as the battery fills." />
          <SkBlock className={panel("h-[208px]", "max-sm:h-[247px]")} />
        </SkSection>
        {/* The table DcCurves draws: its fixed columns, the charger's name left-aligned (it wraps on a phone). */}
        <div className={TABLE_FRAME} aria-hidden="true">
          <table className="w-full min-w-[32rem] table-fixed text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-24" />
              <col />
              <col className="w-20" />
              <col className="w-20" />
            </colgroup>
            <thead>
              <tr className={`border-b text-left text-xs ${TABLE_HEAD_ROW}`}>
                {["#", "Date", "Charger", "Peak", "Average"].map((h, k) => (
                  <th key={h} className={`font-normal ${k > 2 ? "text-right" : ""} ${k < 4 ? "pr-3" : ""}`}>
                    <Ph>{h}</Ph>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3 pr-3 text-xs">
                  <Ph>4</Ph>
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  <Ph>25 Oct</Ph>
                </td>
                <td className="py-3 pr-3">
                  <Ph>Supercharger</Ph>
                </td>
                <td className="py-3 pr-3 text-right">
                  <Ph>134.7 kW</Ph>
                </td>
                <td className="py-3 text-right">
                  <Ph>108.3 kW</Ph>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SkSection>
      <SkSection>
        <SkHead title="Charging map" description="Last 7 days. Bigger pins added more energy." gap={2} />
        <SkMap legend="A charge. Bigger pins added more energy." />
      </SkSection>
    </>
  );
}

// The map and the line under it, as TripMap draws them (a 192px map, a legend, 12px apart).
function SkMap({ legend }: { legend: string }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-48 rounded-lg max-sm:h-36" />
      <p className="text-xs">
        <Ph>{legend}</Ph>
      </p>
    </div>
  );
}

// The sessions, month by month: the columns' header, then rows of two lines (SessionRow's own grid classes),
// as wide on a phone as the table there, which scrolls sideways.
function SkSessions() {
  return (
    <div aria-hidden="true">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          <Ph>October 2026</Ph>
        </p>
        <div className="overflow-hidden rounded-lg border pb-2">
          <div className="max-sm:min-w-xl">
            <div className={`grid grid-cols-charge-serial-cost gap-x-4 px-4 text-xs ${TABLE_HEAD}`}>
              {["#", "Date", "Charge", "Energy", "Cost", ""].map((h, k) => (
                <span key={k} className={k > 2 ? "text-right" : undefined}>
                  <Ph>{h}</Ph>
                </span>
              ))}
            </div>
            <ul className="divide-y border-t">
              {Array.from({ length: CHARGING_PREVIEW }, (_, k) => (
                <li key={k} className="grid grid-cols-charge-serial-cost items-start gap-x-4 px-4 py-4 text-sm">
                  <p className="pt-0.5 font-mono text-xs">
                    <Ph>1</Ph>
                  </p>
                  <div className="space-y-1">
                    <p>
                      <Ph>27 Oct</Ph>
                    </p>
                    <p className="text-xs">
                      <Ph>4:08 PM</Ph>
                    </p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      <Ph>Home charger</Ph>
                    </p>
                    <p className="text-xs">
                      <Ph>AC · 60% to 80% · 2 h</Ph>
                    </p>
                  </div>
                  <p className="text-right font-mono font-medium">
                    <Ph>9.2 kWh</Ph>
                  </p>
                  <div className="space-y-1 text-right">
                    <p className="font-mono font-medium">
                      <Ph>₹120.00</Ph>
                    </p>
                    <p className="text-xs">
                      <Ph>₹13/kWh</Ph>
                    </p>
                  </div>
                  <span />
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="pt-1 text-right text-xs">
          <Ph>9 charges, ₹417.84 billed</Ph>
        </p>
      </div>
      <SkShowMore />
    </div>
  );
}

export function BatterySkeleton() {
  return (
    <>
      <SkSection>
        <SkHead title="Battery health" description="What the battery holds now, against its best week." />
        <SkFigures
          tiles={[
            { label: "Usable capacity now", value: "64.1 kWh", note: "Latest week, 0.8% below the best week, 64.6 kWh" },
            { label: "Real range at 100%", value: "About 537 km", note: "At your 119 Wh/km, from 1,096.4 km driven in the last 30 days" },
          ]}
        />
      </SkSection>
      <SkSection gap={8}>
        <div className="space-y-2">
          <SkHead title="Parked drain" description="Battery lost while parked. Lower is better." />
          <SkBigLabel value="12" unit="W" label="average while parked" />
          <SkLine>0.4% a day · about 2 km a day</SkLine>
        </div>
        <SkParkedList />
      </SkSection>
      <SkSection>
        <SkHead title="Charge level" description="Battery level over time, with charging marked." />
        <SkBigLabel value="68" unit="%" label="seen 27 Oct, 4:38 PM" />
        <div className="space-y-3" aria-hidden="true">
          <SkBlock className="h-48 max-sm:h-[228px]" />
          <p className="text-xs">
            <Ph>Battery level Charging</Ph>
          </p>
        </div>
      </SkSection>
      <SkSection>
        <SkHead title="Usable capacity by week" description="Usable capacity week by week. Latest week 64.1 kWh." />
        <SkBlock className="h-44 max-sm:h-[209px]" />
      </SkSection>
      <SkSection>
        <SkHead title="Full pack by week, per Tesla" description="Full-pack energy, as the car reports it." />
        <SkLine>Week of 26 Oct: 62.1 kWh. The line appears after two weeks.</SkLine>
      </SkSection>
      <SkSection>
        <SkHead title="Capacity by distance" description="Usable capacity each week, against the odometer." />
        <SkBlock className="h-44 max-sm:h-[209px]" />
      </SkSection>
      <SkSection>
        <SkHead title="Cell balance" description="Gap between the highest and lowest cell. Lower is better." />
        <SkFigures
          tiles={[
            { label: "Gap now", value: "3 mV", note: "Latest, 27 Oct, 3:39 PM" },
            { label: "Widest", value: "6 mV", note: "21 Oct, 12:39 PM" },
          ]}
        />
        <SkBlock className="h-44 max-sm:h-[209px]" />
      </SkSection>
      <SkSection>
        <SkHead title="Temperatures" description="Battery, cabin and outside temperatures." />
        <div className="space-y-2" aria-hidden="true">
          <SkFigures tiles={[{ label: "Battery", value: "33.7 °C" }, { label: "Inside", value: "35.7 °C" }, { label: "Outside", value: "32 °C" }]} />
          <SkLine className="text-xs">Seen 27 Oct, 3:39 PM</SkLine>
        </div>
        <div className="space-y-2" aria-hidden="true">
          <SkBlock className="h-44 max-sm:h-[209px]" />
          <SkLine className="text-xs">Battery Inside Outside</SkLine>
        </div>
      </SkSection>
    </>
  );
}

// The stretches parked as ParkedRows draws them: a table of three rows, as wide on a phone as the real one,
// and the button for the rest.
function SkParkedList() {
  return (
    <div aria-hidden="true">
      <div className={TABLE_FRAME}>
        <table className={PARKED_TABLE}>
          <colgroup>
            {PARKED_COLUMNS.map((c) => (
              <col key={c.label} className={c.width} />
            ))}
          </colgroup>
          <thead>
            <tr className={`border-b text-left text-xs ${TABLE_HEAD_ROW}`}>
              {PARKED_COLUMNS.map((c, k) => (
                <th key={c.label} className={`font-normal ${c.right ? "text-right" : ""} ${k < PARKED_COLUMNS.length - 1 ? "pr-3" : ""}`}>
                  <Ph>{c.label}</Ph>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {[true, true, false].map((place, r) => (
              <tr key={r} className="align-top">
                <td className="py-2.5 pr-3 font-mono text-xs">
                  <Ph>1</Ph>
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  <Ph>26 Oct, 8:06 PM</Ph>
                  {place && (
                    <span className="flex text-xs">
                      <Ph>Orchard Lane</Ph>
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  <Ph>12 h 12 min</Ph>
                </td>
                {["0.2%", "1 km", "0.2 kWh", "16 W"].map((v) => (
                  <td key={v} className="py-2.5 pr-3 text-right font-mono whitespace-nowrap">
                    <Ph>{v}</Ph>
                  </td>
                ))}
                <td className="py-2.5 text-right font-mono whitespace-nowrap">
                  <Ph>0 min</Ph>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SkShowMore />
    </div>
  );
}

// A chart's section under a drive: its head, the peaks when it has them, the plot (176px, taller on a phone,
// as the trace is) and the line naming its series.
function SkTrace({ title, description, peaks, legend }: { title: string; description: string; peaks?: { label: string; value: string; note: string }[]; legend: string }) {
  return (
    <SkSection>
      <SkHead title={title} description={description} />
      {peaks && <SkFigures tiles={peaks} />}
      <div className="space-y-2" aria-hidden="true">
        <SkBlock className="h-44 max-sm:h-[209px]" />
        {legend && (
          <p className="text-xs">
            <Ph>{legend}</Ph>
          </p>
        )}
      </div>
    </SkSection>
  );
}

// A drive's page, in its order: the heading and times, how it went, the map with its facts, every number,
// then the traces. A drive with stops has a timeline and legs too; a drive without climate or battery
// readings lacks those traces. This is the usual drive.
export function DriveSkeleton() {
  return (
    <Loading>
      <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]" aria-hidden="true">
        <Ph>Drive</Ph>
      </h1>
      {/* The route line (RouteLine): two lines on a phone, one from sm up. */}
      <p className="mt-2 flex h-12 flex-col text-base leading-6 sm:h-6 sm:flex-row sm:gap-x-1.5" aria-hidden="true">
        <Ph>Koramangala</Ph>
        <Ph>to Whitefield</Ph>
      </p>
      <p className="mt-1 mb-12 text-sm" aria-hidden="true">
        <Ph>Today, 27 Oct 2026 · 8:18 AM to 8:52 AM</Ph>
      </p>
      <div className="space-y-12">
        <SkSection gap={3}>
          <p className="text-lg font-medium tracking-heading" aria-hidden="true">
            <Ph>How this drive went</Ph>
          </p>
          <SkFigures
            tiles={[
              { label: "Energy use", value: "134 Wh/km", note: "11% more than your usual 120 Wh/km" },
              { label: "Hard moments", value: "3", note: "3 brakes · your usual 3" },
            ]}
          />
        </SkSection>
        <SkSection>
          <p className="text-lg font-medium tracking-heading" aria-hidden="true">
            <Ph>Map</Ph>
          </p>
          <div className="space-y-3" aria-hidden="true">
            <div>
              <SkBlock className="h-96 rounded-lg max-sm:h-[342px]" />
              <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 dark:border-transparent dark:bg-background">
                {[
                  ["From", "Whitefield, Bengaluru", false],
                  ["To", "Koramangala, Bengaluru", true],
                  ["Distance", "14.8 km", false],
                  ["Took", "34 min", false],
                  ["Battery", "65% to 62%", false],
                ].map(([label, value, extra], k) => (
                  <div key={String(label)} className={k === 4 ? "min-w-0 bg-background px-3 py-2 max-sm:col-span-2 sm:col-span-2 dark:bg-card" : "min-w-0 bg-background px-3 py-2 dark:bg-card"}>
                    <dt className="text-xs">
                      <Ph>{String(label)}</Ph>
                    </dt>
                    <dd className="text-sm text-balance">
                      <span className="flex flex-wrap items-center gap-x-1.5">
                        <Ph>{String(value)}</Ph>
                        {extra && (
                          <span className="text-xs max-sm:inline-block max-sm:py-[5px]">
                            <Ph>Name this place</Ph>
                          </span>
                        )}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              {["Start 8:18 AM", "End 8:52 AM", "Route, fainter at the start"].map((text) => (
                <li key={text} className="flex items-center gap-1.5">
                  <span className="size-4 rounded-sm bg-muted" />
                  <Ph>{text}</Ph>
                </li>
              ))}
            </ul>
          </div>
        </SkSection>
        <SkFigures
          tiles={[
            { label: "Distance", value: "14.8 km" },
            { label: "Took", value: "34 min" },
            { label: "Energy used", value: "2.0 kWh" },
            { label: "Battery", value: "65% to 62%", bar: true },
            { label: "Range used", value: "12 km" },
            { label: "Average speed", value: "26 km/h" },
            { label: "Top speed", value: "51 km/h" },
            { label: "Outside", value: "26.1 °C" },
          ]}
        />
        <div className="space-y-12">
          <SkTrace title="Speed" description="Top 51 km/h, mostly 31 to 46 km/h." legend="" />
          <SkTrace
            title="Power"
            description="About 3.2 kWh drawn, 0.4 kWh won back while slowing (12%)."
            peaks={[
              { label: "Most power", value: "49.8 kW", note: "At 8:24 AM" },
              { label: "Most won back", value: "47.1 kW", note: "At 8:19 AM" },
            ]}
            legend="Drawing Won back"
          />
          <SkTrace title="Climate" description="AC off. Outside 25.9 to 26.2 °C." legend="Inside Outside AC off" />
          <SkTrace
            title="Acceleration"
            description="2 hard brakes, at 8:19 AM and 8:37 AM."
            peaks={[
              { label: "Hardest acceleration", value: "8.7 km/h", note: "Gained in one second, at 8:50 AM" },
              { label: "Hardest braking", value: "12.0 km/h", note: "Lost in one second, at 8:51 AM" },
            ]}
            legend="Speeding up Braking Hard"
          />
          <SkTrace title="Road grade" description="One climb at 8:47 AM, up to 5%." legend="Uphill Downhill" />
        </div>
      </div>
    </Loading>
  );
}

// A charge's page: its place and when, the power curve, the details in groups, and what the charger gave.
export function ChargeSkeleton() {
  return (
    <Loading>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-hidden="true">
        <h1 className="text-[1.5rem] font-medium tracking-heading max-sm:text-[1.25rem]">
          <Ph>Koramangala, Bengaluru</Ph>
        </h1>
        <span className="text-xs">
          <Ph>Name this place</Ph>
        </span>
      </div>
      <p className="mt-2 mb-12 text-sm" aria-hidden="true">
        <Ph>Bengaluru · Today, 27 Oct 2026 · 4:08 PM to 6:20 PM</Ph>
      </p>
      <div className="space-y-12">
        <SkSection>
          <SkHead title="Power and battery level" description="Charging power and battery level through the charge." />
          <div className="space-y-3" aria-hidden="true">
            <SkBlock className="h-48 max-sm:h-[228px]" />
            <p className="text-xs">
              <Ph>Power Battery</Ph>
            </p>
          </div>
        </SkSection>
        <SkSection gap={6}>
          <p className="text-lg font-medium tracking-heading" aria-hidden="true">
            <Ph>Details</Ph>
          </p>
          <SkSection gap={3}>
            <p className="text-base font-medium tracking-heading" aria-hidden="true">
              <Ph>Battery</Ph>
            </p>
            <SkFigures
              tiles={[
                { label: "Charge level", value: "62% to 68%" },
                { label: "Energy added", value: "4.0 kWh" },
                { label: "Battery temperature", value: "34.1 to 34.1 °C" },
              ]}
            />
          </SkSection>
          <SkSection gap={3}>
            <p className="text-base font-medium tracking-heading" aria-hidden="true">
              <Ph>Power</Ph>
            </p>
            <SkFigures tiles={[{ label: "Peak power", value: "7.2 kW" }, { label: "Average power", value: "7.2 kW" }]} />
          </SkSection>
        </SkSection>
        <SkSection>
          <SkHead title="Charger" description="How the AC charger supplied power." />
          <SkFigures
            tiles={[
              { label: "Voltage", value: "229 V" },
              { label: "Current", value: "32 A", note: "The most the car drew" },
              { label: "Phases", value: "1", note: "Single-phase" },
              { label: "Cable", value: "Type 2", note: "IEC" },
            ]}
          />
        </SkSection>
      </div>
    </Loading>
  );
}
