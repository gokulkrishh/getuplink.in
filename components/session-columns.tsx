import { cn } from "@/lib/utils";
import { TABLE_HEAD } from "@/lib/table-frame";

// Static class names, so Tailwind sees them. Wide fits "Yesterday" in the first column (with `now`);
// numbered puts a "#" column first.
export function columns(wide: boolean, costs: boolean, numbered = false): string {
  if (numbered && wide) return costs ? "grid-cols-charge-serial-wide-cost" : "grid-cols-charge-serial-wide";
  if (numbered) return costs ? "grid-cols-charge-serial-cost" : "grid-cols-charge-serial";
  if (wide) return costs ? "grid-cols-charge-wide-cost" : "grid-cols-charge-wide";
  return costs ? "grid-cols-charge-cost" : "grid-cols-charge";
}

// The column names above a list of SessionRows, in the same grid. `numbered` for rows given a serial.
export function SessionHeader({ costs, wide = false, numbered = false }: { costs: boolean; wide?: boolean; numbered?: boolean }) {
  return (
    <div className={cn(columns(wide, costs, numbered), "grid gap-x-4 px-4 text-xs text-faint", TABLE_HEAD)} aria-hidden="true">
      {numbered && <span>#</span>}
      <span>Date</span>
      <span>Charge</span>
      <span className="text-right">Energy</span>
      {costs && <span className="text-right">Cost</span>}
      <span />
    </div>
  );
}
