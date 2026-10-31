"use client";

import { GoogleMapsCredit } from "@/components/google-maps-credit";
import { Measure } from "@/components/measure";
import { TableBox } from "@/components/scroll-x";
import { usePaged } from "@/components/show-more";
import type { LoadMore, Paged } from "@/lib/list";
import { PARKED_COLUMNS, PARKED_TABLE, TABLE_HEAD_ROW } from "@/lib/table-frame";

// One stretch parked as the list shows it, every text worked out on the server (see cells in
// parked-drain.tsx): the page sends these few strings per stretch, and the browser draws the table.
export type ParkedRow = {
  start: number;
  serial: number;
  ongoing: boolean;
  when: string;
  // Where it was parked, by its best name (see spotName), when the readings show it.
  place: string | null;
  // The place is a Google Maps name: credited beside it.
  placeGoogle?: boolean;
  period: string;
  lost: string;
  range: string;
  energy: string;
  power: string;
  awake: string;
};

// The stretch going on now says so under when it began, rather than in its length.
const Now = ({ row }: { row: ParkedRow }) => (row.ongoing ? <span className="block text-xs text-muted-foreground">Still parked</span> : null);
// The name truncates on a wider screen and wraps on a phone, so it reads in full in the scrolling table. The
// credit beside a Google name never cuts.
const Where = ({ row }: { row: ParkedRow }) =>
  row.place ? (
    <span className="flex min-w-0 items-baseline gap-x-1.5 text-xs text-muted-foreground max-sm:flex-wrap">
      <span className="min-w-0 whitespace-normal sm:truncate">{row.place}</span>
      {row.placeGoogle && <GoogleMapsCredit className="shrink-0" />}
    </span>
  ) : null;

function ParkedTable({ rows }: { rows: ParkedRow[] }) {
  return (
    <table className={`${PARKED_TABLE} tabular-nums`}>
      <colgroup>
        {PARKED_COLUMNS.map((c) => (
          <col key={c.label} className={c.width} />
        ))}
      </colgroup>
      <thead>
        <tr className={`border-b text-left text-xs text-faint ${TABLE_HEAD_ROW}`}>
          {PARKED_COLUMNS.map((c, k) => (
            <th key={c.label} scope="col" className={`font-normal ${c.right ? "text-right" : ""} ${k < PARKED_COLUMNS.length - 1 ? "pr-3" : ""}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.start} className="align-top">
            <td className="py-2.5 pr-3 font-mono text-xs text-faint">{r.serial}</td>
            <td className="py-2.5 pr-3 whitespace-nowrap">
              {r.when}
              <Where row={r} />
              <Now row={r} />
            </td>
            <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">{r.period}</td>
            <td className="py-2.5 pr-3 text-right font-mono"><Measure text={r.lost} /></td>
            <td className="py-2.5 pr-3 text-right font-mono"><Measure text={r.range} /></td>
            <td className="py-2.5 pr-3 text-right font-mono"><Measure text={r.energy} /></td>
            <td className="py-2.5 pr-3 text-right font-mono"><Measure text={r.power} /></td>
            <td className="py-2.5 text-right font-mono whitespace-nowrap"><Measure text={r.awake} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The stretches as a table, scrolling sideways on a phone. The first rows come with the page; "Show N more"
// fetches the rest with `load` and adds them to the same table.
export function ParkedRows({ list, load }: { list: Paged<ParkedRow>; load: LoadMore<ParkedRow> }) {
  const { rows, button } = usePaged(list, load);
  return (
    <div>
      <TableBox>
        <ParkedTable rows={rows} />
      </TableBox>
      {button}
    </div>
  );
}
