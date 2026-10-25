"use client";

import { Measure } from "@/components/measure";

// One stretch parked as the list shows it, every text worked out on the server (see cells in
// parked-drain.tsx): the page sends these few strings per stretch, and the browser draws both layouts.
export type ParkedRow = {
  start: number;
  serial: number;
  ongoing: boolean;
  when: string;
  period: string;
  lost: string;
  // Lost as a phone shows it: the share with the range when that is known.
  lostWithRange: string;
  range: string;
  energy: string;
  power: string;
  awake: string;
};

// The table's columns. Fixed widths, so a second table (behind Show more) lines up with the first.
const COLUMNS = [
  { label: "#", width: "w-10" },
  { label: "Parked", width: "w-32" },
  { label: "For", width: "w-28" },
  { label: "Lost", width: "", right: true },
  { label: "Range", width: "", right: true },
  { label: "Energy", width: "", right: true },
  { label: "Avg power", width: "", right: true },
  { label: "Seen awake", width: "w-24", right: true },
];

// The stretch going on now says so under when it began, rather than in its length.
const Now = ({ row }: { row: ParkedRow }) => (row.ongoing ? <span className="block text-xs text-muted-foreground">Still parked</span> : null);

export function ParkedTable({ rows, header = true }: { rows: ParkedRow[]; header?: boolean }) {
  return (
    <table className="w-full table-fixed text-sm tabular-nums">
      <colgroup>
        {COLUMNS.map((c) => (
          <col key={c.label} className={c.width} />
        ))}
      </colgroup>
      {header && (
        <thead>
          <tr className="border-b text-left text-xs text-faint">
            {COLUMNS.map((c, k) => (
              <th key={c.label} scope="col" className={`py-2 font-normal ${c.right ? "text-right" : ""} ${k < COLUMNS.length - 1 ? "pr-3" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody className={`divide-y ${header ? "" : "border-t"}`}>
        {rows.map((r) => (
          <tr key={r.start} className="align-top">
            <td className="py-2.5 pr-3 font-mono text-xs text-faint">{r.serial}</td>
            <td className="py-2.5 pr-3 whitespace-nowrap">
              {r.when}
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

// Phones: one block per stretch, its figures labelled in two columns.
export function ParkedBlocks({ rows }: { rows: ParkedRow[] }) {
  return (
    <ul className="divide-y border-t">
      {rows.map((r) => {
        const figures = [
          ["Lost", r.lostWithRange],
          ["Energy", r.energy],
          ["Avg power", r.power],
          ["Seen awake", r.awake],
        ];
        return (
          <li key={r.start} className="space-y-3 py-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="tabular-nums">
                <span className="mr-2 font-mono text-xs text-faint">#{r.serial}</span>
                {r.when}
                <Now row={r} />
              </p>
              <span className="text-muted-foreground tabular-nums">{r.period}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {figures.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-faint">{label}</dt>
                  <dd className="tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
