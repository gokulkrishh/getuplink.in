import { ChartCard } from "@/components/chart-card";
import { type Figure, Figures } from "@/components/stats/figures";
import { type AcSupply, acSupply, phasesLabel } from "@/lib/ac-charge";
import type { StreamChargeSession } from "@/lib/server/stream-charging";

// Words, not a measure: set in the body font so Figures doesn't read them as a unit.
export const Words = ({ children }: { children: string }) => <span className="font-sans text-xl leading-tight tracking-normal whitespace-normal">{children}</span>;

// The tiles for how an AC charge was supplied: voltage, the highest current the car drew, the phases and
// the cable. The car page shows the same tiles for the last AC charge.
export function supplyFigures(supply: AcSupply): (Figure | false)[] {
  return [
    supply.volts !== null && { label: "Voltage", value: `${supply.volts} V` },
    supply.amps !== null && { label: "Current", value: `${supply.amps} A`, note: "The most the car drew" },
    supply.phases !== null && { label: "Phases", value: String(supply.phases), note: phasesLabel(supply.phases) },
    supply.cable !== null && { label: "Cable", value: <Words>{supply.cable.name}</Words>, note: supply.cable.standard },
  ];
}

// How an AC charge was supplied, from what the car reported. Nothing for a DC charge, or when the car
// reported none of it.
export function ChargeSupply({ session }: { session: StreamChargeSession }) {
  const supply = session.kind === "ac" ? acSupply(session) : null;
  if (!supply) return null;
  return (
    <ChartCard
      title="Charger"
      description="How the AC charger supplied power."
      unit={supply.volts !== null ? "V" : undefined}
      terms={supply.amps !== null ? ["A"] : []}
    >
      <Figures figures={supplyFigures(supply)} />
    </ChartCard>
  );
}
