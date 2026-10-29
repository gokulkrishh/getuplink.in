"use client";

import { ScrollX } from "@/components/scroll-x";
import { usePaged } from "@/components/show-more";
import type { LoadMore, Paged } from "@/lib/list";
import Link from "next/link";
import { Measure } from "@/components/measure";
import { ROW_LINK, RowChevron } from "@/components/row-chevron";
import { cn } from "@/lib/utils";

// One trip as the table shows it, every text worked out on the server (see tripRow in drive-list.tsx): the
// page sends these few strings per trip, and the browser draws both layouts from them.
export type TripRow = {
  start: number; // the key and the trip page's address
  serial: number;
  day: string;
  times: string; // "8:10 AM to 8:42 AM"
  route: string | null; // "Home to Koramangala", when both ends are known
  km: string;
  duration: string;
  stops: string | null; // "2 stops"
  kwh: string | null;
  // How much of the battery the trip took, "9%", with the start and end levels for its title.
  used: string | null;
  levels: string | null;
};

// The trip table's columns. Fixed widths, so the rows fetched by Show more line up with the first.
const COLUMNS = [
  { label: "#", width: "w-10" },
  { label: "When", width: "w-44" },
  { label: "Trip", width: "" },
  { label: "Distance · time", width: "w-36", right: true },
  { label: "Energy · battery", width: "w-36", right: true },
];

const faint = <span className="text-faint">—</span>;

// One trip (a single drive, or drives with short stops between; see groupTrips) as a row. The times link to
// its page, which lists the legs; the link covers the row, which highlights on hover or focus.
function TripTableRow({ row }: { row: TripRow }) {
  return (
    <tr className="group/row relative cursor-pointer transition-colors duration-150 hover:bg-muted focus-within:bg-muted">
      <td className="py-3 pr-3 font-mono text-xs text-faint">{row.serial}</td>
      <td className="py-3 pr-3 whitespace-nowrap">
        <span className="block">{row.day}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">{row.times}</span>
      </td>
      {/* Where it went. With no arrow column (it would sit off screen while the table scrolls), the name
          underlines when the row is hovered, as the link it is. */}
      <th scope="row" className="py-3 pr-3 text-left font-medium">
        <Link href={`/stats/driving/${row.start}`} className={cn(ROW_LINK, !row.route && "font-normal text-muted-foreground")}>
          {row.route ?? "Place not known"}
        </Link>
      </th>
      <td className="py-3 pr-3 text-right whitespace-nowrap">
        <span className="block font-mono"><Measure text={row.km} /></span>
        <span className="block text-xs text-muted-foreground">
          {row.duration}
          {row.stops && ` · ${row.stops}`}
        </span>
      </td>
      <td className="py-3 pr-3 text-right whitespace-nowrap" title={row.levels ?? undefined}>
        <span className="block font-mono">{row.kwh === null ? faint : <Measure text={row.kwh} />}</span>
        {row.used && <span className="block text-xs text-muted-foreground">{row.used} of battery</span>}
      </td>
    </tr>
  );
}

// A trip on a phone, where five columns don't fit: two lines, the times and the distance on the first, the
// rest on the second, nothing dropped. The whole row opens the trip, as in the table.
function TripListRow({ row }: { row: TripRow }) {
  const second = [row.day, row.route ? row.times : null, row.duration, row.stops, row.kwh, row.used && `${row.used} of battery`].filter(Boolean);
  return (
    <li className="group/row relative flex items-center gap-3 py-3 text-sm tabular-nums transition-colors duration-150 hover:bg-muted focus-within:bg-muted active:bg-muted">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-medium">
            <span className="mr-2 font-mono text-xs font-normal text-faint">{row.serial}</span>
            <Link href={`/stats/driving/${row.start}`} className={ROW_LINK}>
              {row.route ?? row.times}
            </Link>
          </span>
          <span className="shrink-0 font-mono">
            <Measure text={row.km} />
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{second.join(" · ")}</p>
      </div>
      <RowChevron />
    </li>
  );
}

// Trips as a plain table: number, date, times, distance with the time it took, and energy with the battery
// it used. On a phone, a list of two-line rows instead. The first rows come with the page; "Show N more"
// fetches the rest with `load` and adds them to the same table, so it scrolls sideways as one.
export function TripRows({ list, load }: { list: Paged<TripRow>; load?: LoadMore<TripRow> }) {
  const { rows, button } = usePaged(list, load ?? (async () => []));
  return (
    <>
      <ul className="divide-y border-t sm:hidden">
        {rows.map((r) => (
          <TripListRow key={r.start} row={r} />
        ))}
      </ul>
      {/* The table sits 0.75rem wider than the column on each side and pads its outer cells by the same, so a
          highlighted row has room around its text while the text still lines up with the page. */}
      <ScrollX className="-mx-3 max-sm:hidden">
        <table className="w-full min-w-[44rem] table-fixed text-sm tabular-nums [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.label} className={c.width} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className={`pb-2 pr-3 font-normal ${c.right ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <TripTableRow key={r.start} row={r} />
            ))}
          </tbody>
        </table>
      </ScrollX>
      {button}
    </>
  );
}
