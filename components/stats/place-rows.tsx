"use client";

import { MapPin } from "lucide-react";
import { GoogleMapsCredit } from "@/components/google-maps-credit";
import { NamePlace } from "@/components/name-place";
import { TableBox } from "@/components/scroll-x";
import { usePaged } from "@/components/show-more";
import type { LoadMore, Paged } from "@/lib/list";
import type { NameTarget } from "@/lib/user-places";
import { TABLE_HEAD_ROW } from "@/lib/table-frame";

// One place as the table shows it, every text worked out on the server (see placeRows in driving-extras.tsx).
export type PlaceRow = {
  key: string;
  serial: number;
  href: string; // the spot in Google Maps
  name: string;
  google: boolean; // `name` is Google's, so it is credited
  flag: string | null; // the car's Home, Work or Favourite, beside a real name
  action: "rename" | "name" | null;
  target: NameTarget;
  visits: number;
  parked: string;
  lastVisit: string;
};

// The Places table: the first rows come with the page; "Show N more" fetches the rest with `load` into the
// same table.
export function PlaceRows({ list, load }: { list: Paged<PlaceRow>; load: LoadMore<PlaceRow> }) {
  const { rows, button } = usePaged(list, load);
  return (
    <>
      <TableBox>
        <table className="w-full min-w-md text-sm tabular-nums">
          <thead>
            <tr className={`border-b text-left text-xs text-faint ${TABLE_HEAD_ROW}`}>
              <th scope="col" className="w-10 pr-3 font-normal">
                #
              </th>
              <th scope="col" className="pr-4 font-normal">
                Place
              </th>
              <th scope="col" className="pr-4 text-right font-normal">
                Visits
              </th>
              <th scope="col" className="pr-4 text-right font-normal">
                Time parked
              </th>
              <th scope="col" className="text-right font-normal">
                Last visit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => (
              <tr key={p.key}>
                <td className="w-10 py-3 pr-3 font-mono text-xs text-faint">{p.serial}</td>
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {/* The name opens the spot in Google Maps, dotted like the charge page's title. */}
                    <a href={p.href} target="_blank" rel="noopener" title="Open in Google Maps" className="tap-target underline decoration-dotted decoration-muted-foreground underline-offset-4 transition-colors hover:decoration-foreground">
                      {p.name}
                    </a>
                    {p.google && <GoogleMapsCredit />}
                    {p.flag && <span className="text-xs text-muted-foreground">· {p.flag}</span>}
                    {p.action && <NamePlace target={p.target} compact={p.action === "rename"} />}
                  </span>
                </th>
                <td className="py-3 pr-4 text-right font-mono">{p.visits}</td>
                <td className="py-3 pr-4 text-right">{p.parked}</td>
                <td className="py-3 text-right">{p.lastVisit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
      {button}
    </>
  );
}
