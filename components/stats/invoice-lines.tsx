import { InfoButton } from "@/components/info-button";
import { Measure } from "@/components/measure";
import { type InvoiceLine, lineRows } from "@/lib/invoice-items";
import { formatMoney } from "@/lib/format";

// An attached invoice's own lines, under the session: charges, then taxes, then the total. Only shown when
// the lines were sent with it and add up to what was paid (lib/invoice-items.ts storedLines).
export function InvoiceLines({ lines, total, network }: { lines: readonly InvoiceLine[]; total: number; network: string }) {
  const rows = lineRows(lines);
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-medium tracking-heading">{network} invoice</h2>
        <InfoButton label="the invoice lines">As printed on the invoice you attached. Shown only when the lines add up to the total.</InfoButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-xs text-faint">
              <th scope="col" className="py-2 pr-4 font-normal">
                Item
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
            {rows.map((row, k) => (
              <tr key={k}>
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  {row.label}
                </th>
                <td className="py-3 pr-4 text-right font-mono text-muted-foreground">{row.detail && <Measure text={row.detail} />}</td>
                <td className="py-3 text-right font-mono">
                  <Measure text={formatMoney(row.amount, "INR")} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <th scope="row" colSpan={2} className="py-3 pr-4 text-left">
                Total
              </th>
              <td className="py-3 text-right font-mono">
                <Measure text={formatMoney(total, "INR")} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
