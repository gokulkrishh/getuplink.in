import { Figures } from "@/components/stats/figures";
import { acSupply, phasesLabel } from "@/lib/ac-charge";
import type { StreamChargeSession } from "@/lib/server/stream-charging";

// Words, not a measure: set in the body font so Figures doesn't read them as a unit.
const Words = ({ children }: { children: string }) => <span className="font-sans text-xl tracking-normal">{children}</span>;

// How an AC charge was supplied, from what the car reported: voltage, the highest current it drew, the
// phases and the cable. Nothing for a DC charge, or when the car reported none of it.
export function ChargeSupply({ session }: { session: StreamChargeSession }) {
  const supply = session.kind === "ac" ? acSupply(session) : null;
  if (!supply) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-heading">Charger</h2>
      <Figures
        figures={[
          supply.volts !== null && { label: "Voltage", value: `${supply.volts} V` },
          supply.amps !== null && { label: "Current", value: `${supply.amps} A`, note: "The most the car drew" },
          supply.phases !== null && { label: "Phases", value: String(supply.phases), note: phasesLabel(supply.phases) },
          supply.cable !== null && { label: "Cable", value: <Words>{supply.cable.name}</Words>, note: supply.cable.standard },
        ]}
      />
    </section>
  );
}
