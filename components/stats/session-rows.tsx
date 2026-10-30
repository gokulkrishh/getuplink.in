"use client";

import { ScrollX } from "@/components/scroll-x";
import { SessionHeader } from "@/components/session-columns";
import { GoogleMapsCredit } from "@/components/google-maps-credit";
import { Measure } from "@/components/measure";
import { ROW_LINK, RowChevron } from "@/components/row-chevron";
import { SessionLine, type SessionView } from "@/components/session-line";
import { usePaged } from "@/components/show-more";
import type { LoadMore, Paged } from "@/lib/list";
import Link from "next/link";

// One charge as the list holds it: the month it sits under and its row's texts (see sessionView).
export type ChargeRow = { key: string; month: string; view: SessionView };

// What a month's charges came to, over all of them, so its footer is true before the rest are fetched.
export type MonthTotal = { month: string; count: number; billed: string | null };

// A charge on a phone, where the columns don't fit: two lines, nothing dropped or cut. The place (it wraps) and
// when on the first; the energy, the cost (a grey dash with none) and the levels on the second.
function SessionListRow({ view, costs }: { view: SessionView; costs: boolean }) {
  const second = [view.energy === null ? <span key="e" className="text-faint">—</span> : <Measure key="e" text={view.energy} />, ...(costs ? [view.cost ? <span key="c">{view.cost.money}</span> : <span key="c" className="text-faint">—</span>] : [])];
  return (
    <li className="group/row relative flex items-center gap-3 rounded-lg py-3 text-sm transition-colors duration-150 hover:bg-muted focus-within:bg-muted active:bg-muted">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-medium">
            {view.href ? (
              <Link href={view.href} className={ROW_LINK}>
                {view.place}
              </Link>
            ) : (
              view.place
            )}
            {view.google && <GoogleMapsCredit className="ml-1.5 inline-flex align-baseline" />}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {view.date}, {view.clock}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground tabular-nums">
          {second.map((part, k) => (
            <span key={k} className="font-mono font-medium text-foreground">
              {part}
            </span>
          ))}
          <span>{view.detail}</span>
        </p>
      </div>
      {view.href && <RowChevron />}
    </li>
  );
}

// The period's charges grouped by month, newest first. The first rows come with the page; "Show N more" fetches
// the rest with `load`, which can start further months. On a phone the rows are two lines instead of columns.
export function SessionRows({ list, months, costs, load }: { list: Paged<ChargeRow>; months: MonthTotal[]; costs: boolean; load: LoadMore<ChargeRow> }) {
  const { rows, button } = usePaged(list, load);
  const groups = new Map<string, ChargeRow[]>();
  for (const r of rows) groups.set(r.month, [...(groups.get(r.month) ?? []), r]);
  return (
    <>
      <ScrollX className="max-sm:hidden sm:-mx-3 sm:px-3">
        <div className="space-y-10">
          {[...groups].map(([month, group]) => {
            const total = months.find((m) => m.month === month);
            return (
              <section key={month} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{month}</h3>
                <div>
                  <SessionHeader costs={costs} numbered />
                  <ul className="divide-y border-t">
                    {group.map((r) => (
                      <SessionLine key={r.key} view={r.view} />
                    ))}
                  </ul>
                </div>
                {total && (
                  <p className="pt-1 text-right text-xs text-faint tabular-nums">
                    {total.count} {total.count === 1 ? "charge" : "charges"}
                    {total.billed && `, ${total.billed} billed`}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </ScrollX>
      <div className="space-y-10 sm:hidden">
        {[...groups].map(([month, group]) => {
          const total = months.find((m) => m.month === month);
          return (
            <section key={month} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{month}</h3>
              <ul className="divide-y border-t">
                {group.map((r) => (
                  <SessionListRow key={r.key} view={r.view} costs={costs} />
                ))}
              </ul>
              {total && (
                <p className="pt-1 text-right text-xs text-faint tabular-nums">
                  {total.count} {total.count === 1 ? "charge" : "charges"}
                  {total.billed && `, ${total.billed} billed`}
                </p>
              )}
            </section>
          );
        })}
      </div>
      {button}
    </>
  );
}
