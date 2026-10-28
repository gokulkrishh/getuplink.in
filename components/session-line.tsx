"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { GoogleMapsCredit } from "@/components/google-maps-credit";
import { Measure } from "@/components/measure";
import { ROW_LINK, RowChevron } from "@/components/row-chevron";
import { Tip } from "@/components/tip";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One charging session as the list shows it, every text worked out on the server (see SessionRow): the
// page sends these few strings per session, and the browser draws the row from them.
export type SessionView = {
  className: string; // the row's grid and hover classes
  serial?: number;
  date: string;
  clock: string;
  href: string | null;
  place: string;
  // The place is a Google Maps name: credited beside it.
  google?: boolean;
  // The station used most in this list: marked "Most used".
  mostUsed?: boolean;
  detail: string;
  energy: string | null;
  // Only lists with a Cost column have this; null for a row without a cost.
  cost?: { money: string; rate: string | null; invoice: { href: string; label: string } | null } | null;
};

export function SessionLine({ view }: { view: SessionView }) {
  return (
    <li className={view.className}>
      {view.serial !== undefined && <p className="pt-0.5 font-mono text-xs text-faint tabular-nums">{view.serial}</p>}
      <div className="space-y-1">
        <p className="tabular-nums">{view.date}</p>
        <p className="text-xs text-faint tabular-nums">{view.clock}</p>
      </div>
      <div className="min-w-0 space-y-1">
        {/* The name truncates; the credit beside a Google name never does. */}
        <p className="flex min-w-0 items-baseline gap-1.5 font-medium">
          <span className="min-w-0 truncate">
            {view.href ? (
              <Link href={view.href} className={ROW_LINK}>
                {view.place}
              </Link>
            ) : (
              view.place
            )}
          </span>
          {view.google && <GoogleMapsCredit className="shrink-0" />}
        </p>
        {view.mostUsed && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-charge" aria-hidden="true" />
            Most used
          </p>
        )}
        {/* Wraps rather than cuts off: the kind, levels, time and power are all worth reading. */}
        <p className="text-xs text-muted-foreground">{view.detail}</p>
      </div>
      <p className="text-right font-mono font-medium whitespace-nowrap tabular-nums">{view.energy === null ? "—" : <Measure text={view.energy} />}</p>
      {view.cost !== undefined &&
        (view.cost ? (
          <div className="space-y-1 text-right">
            <p className="flex items-center justify-end gap-1 font-mono font-medium whitespace-nowrap tabular-nums">
              {view.cost.invoice && (
                <a href={view.cost.invoice.href} aria-label={view.cost.invoice.label} className={buttonVariants({ variant: "ghost", size: "icon-xs", className: "group relative z-10 -my-0.5" })}>
                  <Download className="size-3.5" aria-hidden="true" />
                  <Tip>Download invoice</Tip>
                </a>
              )}
              {view.cost.money}
            </p>
            {view.cost.rate && <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{view.cost.rate}</p>}
          </div>
        ) : (
          <p className="text-right text-faint">—</p>
        ))}
      {/* The column stays in rows that open nothing, so the columns line up. */}
      {view.href ? <RowChevron className="self-center" /> : <span />}
    </li>
  );
}
