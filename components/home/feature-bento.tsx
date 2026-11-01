import { FileText, Paperclip } from "lucide-react";
import { Logo } from "@/components/logo";
import { Bar, SATELLITE, SURFACE } from "@/components/home/figure";
import { cn } from "@/lib/utils";

// "What Uplink keeps" on the home page: the features as one grid of tiles. Each tile is
// a grey stage with its copy at the top and one piece of the product pinned below it, off the bottom.
// Real Tesla versions; everything else is illustrative.

function Tile({ title, body, className, children }: { title: string; body: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl bg-muted sm:min-h-[380px]", className)}>
      <div className="px-6 pt-6 sm:px-8 sm:pt-8">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="mt-1.5 max-w-md text-base text-muted-foreground">{body}</p>
      </div>
      <div aria-hidden="true" className="relative mt-6 flex-1 select-none">
        {children}
      </div>
    </div>
  );
}

const VERSIONS = [
  { version: "2026.38.5.1", installed: "1 Nov", waited: "1 day" },
  { version: "2026.38.3.1", installed: "15 Oct", waited: "1 day" },
  { version: "2026.32.3", installed: "7 Sept", waited: "2 days" },
];

// The car's figures under its charge, as Uplink shows them for an Indian Model Y.
const GLANCE = [
  { label: "Battery health", value: "94%", unit: "of new" },
  { label: "Lost while parked", value: "0.6%", unit: "a day" },
  { label: "Odometer", value: "24,082", unit: "km" },
  { label: "Driven in October", value: "1,444", unit: "km" },
];

// October's charging spend by where the car charged, adding up to the answer's ₹3,180.
const SPEND = [
  { where: "6 at Superchargers", amount: "₹2,438" },
  { where: "3 on ChargeMOD", amount: "₹742" },
];

// Cars in the India rollout: one in focus on the new version, the rest as filler.
const CARS = Array.from({ length: 18 }, (_, i) => i);
const FOCUS = 6;

export function FeatureBento() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tile title="Software updates" body="Every version your car gets, and how long it waited." className="lg:col-span-2">
        <div className={`absolute top-0 right-6 left-6 h-[260px] rounded-t-xl text-sm sm:right-8 sm:left-8 ${SURFACE}`}>
          <div className="flex gap-3 border-b px-4 py-2.5 text-xs text-faint">
            <span className="flex-1">Version</span>
            <span className="w-16 text-right">Installed</span>
            <span className="hidden w-16 text-right sm:block">Waited</span>
          </div>
          {VERSIONS.map((v, i) => (
            <div key={v.version} className={`flex items-baseline gap-3 border-b px-4 py-3 ${i === 0 ? "" : "text-muted-foreground"}`}>
              <span className="flex-1 truncate font-mono">{v.version}</span>
              <span className="w-16 text-right tabular-nums">{v.installed}</span>
              <span className="hidden w-16 text-right tabular-nums sm:block">{v.waited}</span>
            </div>
          ))}
          <div className="px-4 py-3.5">
            <Bar className="w-40" />
          </div>
        </div>
      </Tile>

      <Tile title="India rollout" body="Which version cars across India are getting.">
        {/* Many of one: whole cells across, off the bottom. One car in focus across three cells, the only one with words, wide enough for its version at every width. */}
        <div className="absolute inset-x-6 top-0 grid grid-cols-5 gap-2.5 sm:inset-x-8">
          {CARS.map((i) =>
            i === FOCUS ? (
              <span key={i} data-rollout-focus className={`col-span-3 flex h-12 min-w-0 flex-col justify-center overflow-hidden rounded-lg px-3 ${SATELLITE}`}>
                <span className="truncate font-mono text-xs leading-4">2026.38.5.1</span>
                <span className="truncate text-xs leading-4 text-faint">Bengaluru</span>
              </span>
            ) : (
              <span key={i} className="h-12 rounded-lg border bg-foreground/[0.04]" />
            ),
          )}
        </div>
      </Tile>

      <Tile title="Every charge, with its cost" body="Spend per charge, invoices attached.">
        <div className={`absolute top-0 right-6 bottom-0 left-6 rounded-t-xl p-1.5 text-sm sm:right-8 sm:left-8 ${SURFACE}`}>
          <div className="flex items-center gap-3 rounded-lg bg-muted px-2.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate">Whitefield</span>
              <span className="block truncate text-xs text-faint tabular-nums">21 Oct · 17.2 kWh</span>
            </span>
            <Paperclip className="size-3.5 shrink-0 text-faint" />
            <span className="font-mono tabular-nums">₹412.80</span>
          </div>
          {[60, 44, 52, 38, 56].map((w) => (
            <div key={w} className="flex items-center gap-3 px-2.5 py-3.5">
              <span className="flex-1">
                <Bar style={{ width: `${w}%` }} />
              </span>
              <Bar className="w-12" />
            </div>
          ))}
        </div>
        <span className={`absolute right-10 bottom-6 flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-3 text-xs ${SATELLITE}`}>
          <FileText className="size-3.5 text-faint" />
          Invoice attached
        </span>
      </Tile>

      <Tile title="Your car at a glance" body="Charge, battery health, parked loss and distance." className="min-h-[530px] sm:min-h-[460px]">
        <div className={`absolute top-0 right-6 bottom-0 left-6 rounded-t-xl p-5 text-sm sm:right-8 sm:left-8 ${SURFACE}`}>
          <p className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-medium tracking-tight tabular-nums">72%</span>
            <span className="text-muted-foreground tabular-nums">
              361<span className="ml-0.5 text-xs">km</span>
            </span>
          </p>
          <div className="relative mt-4 h-2 rounded-full bg-muted">
            <div className="h-full w-[72%] rounded-full bg-foreground" />
            <div className="absolute -inset-y-1 left-[80%] w-px bg-muted-foreground" />
          </div>
          <p className="mt-2 text-right text-xs text-faint tabular-nums">Limit 80%</p>
          <dl className="mt-3 border-t">
            {GLANCE.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 border-b py-2.5 last:border-b-0">
                <dt className="text-xs text-faint">{row.label}</dt>
                <dd className="font-mono tabular-nums">
                  {row.value}
                  <span className="ml-1 font-sans text-xs text-muted-foreground">{row.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Tile>

      <Tile title="Ask your AI" body="Connect Claude, ChatGPT, Grok or an always-on bot." className="min-h-[600px] sm:min-h-[500px]">
        {/* Two turns: a question answered from Uplink, then the always-on bot adding an invoice from Gmail. */}
        <div className={`absolute top-4 right-6 bottom-0 left-6 rounded-t-xl p-4 text-sm sm:right-8 sm:left-8 ${SURFACE}`}>
          <p className="ml-auto w-fit max-w-[90%] rounded-2xl bg-muted px-3 py-1.5">What did I spend in October?</p>
          <p className="mt-3 text-xs text-faint">Looked at your charging</p>
          <p className="mt-1">₹3,180 over 9 charges.</p>
          <dl className="mt-2 border-l pl-3 text-xs">
            {SPEND.map((row) => (
              <div key={row.where} className="flex items-baseline justify-between gap-3 py-0.5">
                <dt className="text-muted-foreground">{row.where}</dt>
                <dd className="tabular-nums">{row.amount}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 ml-auto w-fit max-w-[90%] rounded-2xl bg-muted px-3 py-1.5">Any new invoices in my Gmail?</p>
          <p className="mt-3 text-xs text-faint">Attached the invoice</p>
          <p className="mt-1">Whitefield Supercharger, ₹412.80. Added to your charge on 21 Oct.</p>
        </div>
        <span className={`absolute top-4 right-10 flex -translate-y-1/2 items-center gap-1.5 rounded-full py-1 pr-3 pl-2.5 text-xs font-medium ${SATELLITE}`}>
          <Logo className="size-3" />
          Uplink
        </span>
      </Tile>
    </div>
  );
}
