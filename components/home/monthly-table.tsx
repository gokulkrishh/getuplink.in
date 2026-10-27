import type { MonthRow } from "@/lib/monthly";
import { formatDuration, formatKm, formatKwh, formatMoney, formatMonth } from "@/lib/format";
import { monthStart } from "@/lib/periods";
import { Measure } from "@/components/measure";

const money = { format: (n: number) => formatMoney(n, "INR") };

const COLUMNS = ["Month", "Driven", "Time driving", "Energy used", "Charges", "Energy added", "Spent"];

// Each month at a glance, after TeslaMate's statistics: driving and charging side by side, newest first.
// Spend counts real bills only; a month with unbilled charges says how many. On home it shows the months
// the period touches; `empty` says when it touches none the table has.
export function MonthlyTable({ rows, empty }: { rows: MonthRow[]; empty?: string }) {
  if (rows.length === 0 && !empty) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">By month</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-xs text-faint">
                <th scope="col" className="w-10 py-2 pr-3 font-normal">
                  #
                </th>
                {COLUMNS.map((c, k) => (
                  <th key={c} scope="col" className={`py-2 pr-4 font-normal last:pr-0 ${k > 0 ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, k) => (
                <tr key={r.month}>
                  <td className="w-10 py-3 pr-3 font-mono text-xs text-faint">{k + 1}</td>
                  <th scope="row" className="py-3 pr-4 text-left font-normal whitespace-nowrap">
                    {formatMonth(monthStart(r.month))}
                  </th>
                  <td className="py-3 pr-4 text-right font-mono">{r.km > 0 ? <Measure text={formatKm(r.km)} /> : <span className="font-sans">—</span>}</td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap">{r.drivingMs ? formatDuration(r.drivingMs / 1000) : "—"}</td>
                  <td className="py-3 pr-4 text-right font-mono">{r.kwhUsed !== null ? <Measure text={formatKwh(r.kwhUsed)} /> : "Unknown"}</td>
                  <td className="py-3 pr-4 text-right font-mono">{r.charges > 0 ? r.charges : <span className="font-sans">—</span>}</td>
                  <td className="py-3 pr-4 text-right font-mono">{r.charges > 0 ? <Measure text={formatKwh(r.kwhAdded)} /> : <span className="font-sans">—</span>}</td>
                  <td className="py-3 text-right">
                    {r.charges > 0 ? <span className="font-mono">{money.format(r.spend)}</span> : "—"}
                    {r.unbilled > 0 && <span className="block text-xs text-muted-foreground">{r.unbilled} without a bill</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-faint">Driven is the odometer&apos;s distance, like the Distance bars. Time driving and energy used cover the last 90 days of drives. Spent counts only real bills: Tesla&apos;s and invoices you attached.</p>
    </section>
  );
}
