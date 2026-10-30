import { TableBox } from "@/components/scroll-x";
import { Download } from "lucide-react";
import { FoldToggle } from "@/components/fold-toggle";
import { buttonVariants } from "@/components/ui/button";
import { invoiceParts } from "@/lib/charging-figures";
import { lineRows, printedKwh } from "@/lib/invoice-items";
import { formatClock, formatMoney } from "@/lib/format";
import type { SessionInvoice } from "@/lib/server/receipts";

// An attached invoice, under the charge: what it printed about the charge (number, station, times, how it
// was paid, IDs), then its lines when they were sent and add up (lib/invoice-items.ts storedLines), and the
// file itself from the heading. `received` is the energy the car took in, for the price of each kWh it got.
export function InvoiceSection({ invoice, href, received }: { invoice: SessionInvoice; href?: string; received: number | null }) {
  const rows = invoice.lines ? lineRows(invoice.lines) : [];
  const hasKwh = rows.some((r) => r.kwh);
  const hasRate = rows.some((r) => r.rate);
  const { startedAt, endedAt } = invoice;
  // Duration only as the bill prints it ("31 mins 3 secs"): its times are to the minute, so one worked out
  // from them could be up to a minute off.
  const printed = invoice.details.find((d) => /duration/i.test(d.label));
  const others = invoice.details.filter((d) => d !== printed);
  const facts: [string, string | null][] = [
    ["Invoice number", invoice.invoiceNumber],
    ["Station", invoice.station],
    // The bill's times, with its printed duration beside them.
    ["Time", [startedAt && endedAt ? `${formatClock(startedAt)} to ${formatClock(endedAt)}` : startedAt ? formatClock(startedAt) : null, printed?.value].filter(Boolean).join(" · ") || null],
    ["Energy billed", invoice.kwhBilled ? printedKwh(invoice.kwhBilled) : null],
    // What each kWh that reached the battery cost: the fair figure to compare networks by.
    ["Cost per kWh received", received ? `${formatMoney(invoice.amountTotal / received, "INR")}/kWh` : null],
    // Without its lines, what the invoice split out: energy and fees before GST, the GST, and the total.
    ...(rows.length === 0
      ? [
          ...(invoiceParts({ amount: invoice.amountTotal, gst: invoice.gst, energyAmount: invoice.energyAmount }) ?? []).map((p): [string, string] => [p.label, formatMoney(p.amount, "INR")]),
          ["Total", formatMoney(invoice.amountTotal, "INR")] as [string, string],
        ]
      : []),
    ...others.map((d): [string, string] => [d.label, d.value]),
  ].filter((f): f is [string, string] => f[1] !== null);
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium tracking-heading">{invoice.network} invoice</h2>
        {href && <DownloadInvoice href={href} />}
      </div>
      {rows.length > 0 && (
        <TableBox>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-left text-xs text-faint">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Item
                </th>
                {hasKwh && (
                  <th scope="col" className="py-2 pr-4 text-right font-normal max-sm:hidden">
                    Energy
                  </th>
                )}
                {hasRate && (
                  <th scope="col" className="py-2 pr-4 text-right font-normal max-sm:hidden">
                    Rate
                  </th>
                )}
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
                    {/* On a phone the kWh and rate sit under the item, where their columns would crowd it. */}
                    {(row.kwh || row.rate) && <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">{[row.kwh, row.rate].filter(Boolean).join(" at ")}</span>}
                  </th>
                  {hasKwh && <td className="py-3 pr-4 text-right font-mono text-muted-foreground max-sm:hidden">{row.kwh}</td>}
                  {hasRate && <td className="py-3 pr-4 text-right font-mono text-muted-foreground max-sm:hidden">{row.rate}</td>}
                  <td className="py-3 text-right font-mono">{formatMoney(row.amount, "INR")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t text-base font-semibold">
                <th scope="row" className="pt-4 pr-4 text-left">
                  Total
                </th>
                {hasKwh && <td className="max-sm:hidden" />}
                {hasRate && <td className="max-sm:hidden" />}
                <td className="pt-4 text-right font-mono text-lg">{formatMoney(invoice.amountTotal, "INR")}</td>
              </tr>
            </tfoot>
          </table>
        </TableBox>
      )}
      {/* What the bill printed about the charge, after its lines: closed until wanted. */}
      {facts.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-y py-3 text-sm transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            Invoice details
            <FoldToggle />
          </summary>
          <table className="w-full text-sm tabular-nums">
            <tbody className="divide-y border-b">
              {facts.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row" className="py-3 pr-4 text-left font-normal text-muted-foreground">
                    {label}
                  </th>
                  <td className="py-3 text-right">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

export function DownloadInvoice({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
      <Download className="size-4" aria-hidden="true" />
      Download invoice
    </a>
  );
}
