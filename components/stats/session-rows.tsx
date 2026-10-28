"use client";

import { ScrollX } from "@/components/scroll-x";
import { SessionHeader } from "@/components/session-columns";
import { SessionLine, type SessionView } from "@/components/session-line";
import { usePaged } from "@/components/show-more";
import type { LoadMore, Paged } from "@/lib/list";

// One charge as the list holds it: the month it sits under and its row's texts (see sessionView).
export type ChargeRow = { key: string; month: string; view: SessionView };

// What a month's charges came to, over all of them, so its footer is true before the rest are fetched.
export type MonthTotal = { month: string; count: number; billed: string | null };

// The period's charges grouped by month, newest first. The first rows come with the page; "Show N more" fetches
// the rest with `load`, which can start further months. On a phone the list keeps its columns and scrolls
// sideways; the button sits below that.
export function SessionRows({ list, months, costs, load }: { list: Paged<ChargeRow>; months: MonthTotal[]; costs: boolean; load: LoadMore<ChargeRow> }) {
  const { rows, button } = usePaged(list, load);
  const groups = new Map<string, ChargeRow[]>();
  for (const r of rows) groups.set(r.month, [...(groups.get(r.month) ?? []), r]);
  return (
    <>
      <ScrollX className="max-sm:-mx-1 max-sm:px-1 sm:-mx-3 sm:px-3">
        <div className="max-sm:min-w-xl space-y-10">
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
      {button}
    </>
  );
}
