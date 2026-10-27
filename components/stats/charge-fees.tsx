import { ScrollX } from "@/components/scroll-x";
import { Measure } from "@/components/measure";
import type { FeeLines } from "@/lib/charge-fees";
import { formatMoney } from "@/lib/format";

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

// Each line of Tesla's bill for a Supercharger session, under the session's total: what it was for, how
// much (kWh charged, minutes idle) and what it came to. `currency` is the session's, for a line without one.
export function ChargeFees({ fees, currency }: { fees: FeeLines | null; currency: string }) {
  if (!fees) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">Tesla&apos;s bill</h2>
      <ScrollX>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              <th scope="col" className="w-10 py-2 pr-3 font-normal">
                #
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Fee
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                Quantity
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fees.lines.map((line, k) => (
              <tr key={k}>
                <td className="py-3 pr-3 font-mono text-xs text-faint">{k + 1}</td>
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  {line.type}
                </th>
                <td className="py-3 pr-4 text-right font-mono">{line.quantity !== null && line.unit && <Measure text={`${quantity.format(line.quantity)} ${line.unit}`} />}</td>
                <td className="py-3 text-right font-mono">
                  <Measure text={formatMoney(line.amount, line.currency ?? currency)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      {!fees.addsUp && (
        <p className="text-sm text-faint">
          {fees.skipped > 0
            ? `${fees.skipped === 1 ? "One line" : `${fees.skipped} lines`} of Tesla's bill couldn't be read, so these don't add up to the total.`
            : "These lines don't add up to the total Tesla sent."}
        </p>
      )}
    </section>
  );
}
