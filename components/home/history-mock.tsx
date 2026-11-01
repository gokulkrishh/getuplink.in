import { FileText, Paperclip } from "lucide-react";
import { Bar, FigureStage, SATELLITE, SURFACE } from "@/components/home/figure";

// "Every trip and charge": the Charging list with what each Supercharger charge cost, and the invoice
// that came with one, across the list's edge. India Supercharger pricing (₹24/kWh); the places, dates and
// amounts are illustrative.
const CHARGES = [
  { place: "Whitefield", when: "21 Oct · 17.2 kWh", amount: "412.80" },
  { place: "Hebbal", when: "14 Oct · 16.1 kWh", amount: "386.40" },
];

export function HistoryMock() {
  return (
    <FigureStage className="h-[380px] sm:h-[420px]">
      <div className={`absolute top-5 right-5 left-5 h-[460px] rounded-xl text-sm sm:top-8 sm:right-8 sm:left-[104px] ${SURFACE}`}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <span className="font-medium">Supercharging</span>
          <span className="flex gap-2">
            <Bar className="w-10" />
            <Bar className="w-8" />
          </span>
        </div>
        <ol className="px-1.5">
          {CHARGES.map((c, i) => (
            <li
              key={c.place}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 ${i === 0 ? "bg-muted" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.place}</span>
                <span className="mt-0.5 block truncate text-xs text-faint tabular-nums">{c.when}</span>
              </span>
              <Paperclip className="size-3.5 shrink-0 text-faint" />
              <span className="shrink-0 font-mono tabular-nums">₹{c.amount}</span>
            </li>
          ))}
          {[64, 52, 70, 58, 46].map((w) => (
            <li key={w} className="flex items-center gap-3 px-2.5 py-3.5">
              <span className="flex-1">
                <Bar style={{ width: `${w}%` }} />
                <Bar className="mt-2 w-20 opacity-60" />
              </span>
              <Bar className="w-12" />
            </li>
          ))}
        </ol>
      </div>

      {/* The invoice attached to the first charge. */}
      <div className={`absolute top-[232px] right-8 w-[168px] rounded-xl p-4 text-sm sm:top-[236px] sm:right-auto sm:left-6 sm:w-[176px] ${SATELLITE}`}>
        <span className="flex items-center gap-2 text-xs text-faint">
          <FileText className="size-3.5" />
          Invoice · 21 Oct
        </span>
        <p className="mt-3 font-mono text-xl tracking-tight tabular-nums">₹412.80</p>
        <div className="mt-3 hidden space-y-2 border-t pt-3 sm:block">
          <Bar className="w-24" />
          <Bar className="w-16 opacity-60" />
        </div>
      </div>
    </FigureStage>
  );
}
