import type { StationRow } from "@/lib/top-stations";

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// Where you charge most in the span, by energy, with how often and what the bills came to, ranked from 1.
// `title` names the span and `words` ends "No named stations …" for a span without any.
export function TopStations({ rows, title, words }: { rows: StationRow[]; title: string; words: string }) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-heading">Where you charge</h2>
        <p className="text-sm text-muted-foreground">
          {title}.{rows.length === 0 && ` No charges at a named station ${words}.`}
        </p>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-md text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-xs text-faint">
                <th scope="col" className="w-10 py-2 pr-3 font-normal">
                  #
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Station
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Charges
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Energy
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Spent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, k) => (
                <tr key={r.name}>
                  <td className="py-3 pr-3 font-mono text-xs text-faint">{k + 1}</td>
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    {r.name}
                  </th>
                  <td className="py-3 pr-4 text-right font-mono">{r.charges}</td>
                  <td className="py-3 pr-4 text-right font-mono">{oneDecimal.format(r.kwh)} kWh</td>
                  <td className="py-3 text-right">
                    <span className="font-mono">{r.billed ? money.format(r.spend) : "No bills"}</span>
                    {r.billed > 0 && r.billed < r.charges && <span className="block text-xs text-muted-foreground">{r.charges - r.billed} without a bill</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
