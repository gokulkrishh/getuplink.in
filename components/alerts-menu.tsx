// The header's bell and what it lists: each alert a row with a picture, its title, what to do and since when.
import Link from "next/link";
import { Bell, ChevronRight, Hourglass, IndianRupee, KeyRound, Server, TriangleAlert, Unplug, WifiOff, Wrench, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Alert, type AlertIcon, needsYou } from "@/lib/alerts";
import { formatSince } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<AlertIcon, LucideIcon> = {
  key: KeyRound,
  hourglass: Hourglass,
  "no-data": WifiOff,
  unplugged: Unplug,
  warning: TriangleAlert,
  payment: IndianRupee,
  service: Wrench,
  server: Server,
};

function bellLabel(count: number): string {
  if (count === 0) return "Alerts, nothing needs you";
  return `Alerts, ${count} ${count === 1 ? "needs" : "need"} you`;
}

const TONE = {
  // Warm for what needs the owner (amber chart token), quiet for the rest. Both read in light and dark.
  action: "bg-chart-2/15 text-chart-worse dark:bg-chart-2/20 dark:text-chart-2",
  info: "bg-muted text-muted-foreground",
};

function Tile({ alert, className }: { alert: Alert; className?: string }) {
  const Icon = ICONS[alert.icon];
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full", TONE[alert.kind], className)} aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

const ROW = "group/alert whitespace-normal rounded-md outline-none focus-visible:bg-accent";

function Empty() {
  return (
    <p className="flex min-h-11 items-center px-2 py-2 text-sm text-muted-foreground">All good. Nothing needs you right now.</p>
  );
}

function AlertRow({ a, now }: { a: Alert; now: number }) {
  return (
    <DropdownMenuItem render={<Link href={a.href} prefetch={true} />} className={cn(ROW, "min-h-11 items-start gap-3 px-2 py-2.5 hover:bg-accent")}>
      <Tile alert={a} className="size-8" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-snug text-foreground">{a.title}</span>
        <span className="text-xs leading-snug text-muted-foreground">{a.detail}</span>
        {a.since && <span className="text-xs text-faint">{formatSince(a.since, now)}</span>}
      </span>
      <ChevronRight className="mt-2 size-3.5 shrink-0 text-muted-foreground transition-[color,translate] duration-150 group-hover/alert:translate-x-0.5 group-hover/alert:text-foreground motion-reduce:transition-none motion-reduce:group-hover/alert:translate-x-0" aria-hidden />
    </DropdownMenuItem>
  );
}

export function AlertsMenu({ alerts, now, className }: { alerts: Alert[]; now: number; className: string }) {
  const count = needsYou(alerts);
  const sections = [
    { label: "Needs you", rows: alerts.filter((a) => a.kind === "action") },
    { label: "Good to know", rows: alerts.filter((a) => a.kind === "info") },
  ].filter((s) => s.rows.length > 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={bellLabel(count)}
        // Greyed out with nothing to say; full strength with anything, and the dot when something needs the owner.
        className={cn(
          className,
          alerts.length === 0 ? "text-muted-foreground/40" : "text-foreground",
          "cursor-pointer hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted",
        )}
      >
        <Bell className="size-4" aria-hidden />
        {count > 0 && <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-chart-accent" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        {sections.length === 0 ? (
          <Empty />
        ) : (
          sections.map((section, i) => (
            <DropdownMenuGroup key={section.label}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
              {section.rows.map((a) => (
                <AlertRow key={a.key} a={a} now={now} />
              ))}
            </DropdownMenuGroup>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
