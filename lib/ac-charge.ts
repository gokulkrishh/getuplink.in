import { num } from "@/lib/telemetry-derive";

// How an AC charge was supplied, from a streamed session's columns, in plain words. Only what the car
// reported; the car page and each session page use the same names. Pure, so tested.

// The cable the car saw, as its plug name and the standard behind it.
const CABLES: Record<string, { name: string; standard: string }> = {
  IEC: { name: "Type 2", standard: "IEC" },
  SAE: { name: "J1772", standard: "SAE" },
  GB_AC: { name: "GB/T", standard: "AC" },
};

export function cable(value: unknown): { name: string; standard: string } | null {
  return typeof value === "string" ? (CABLES[value] ?? null) : null;
}

// "Type 2 (IEC)"
export function cableLabel(value: unknown): string | null {
  const c = cable(value);
  return c && `${c.name} (${c.standard})`;
}

export function phasesLabel(value: unknown): "Single-phase" | "Three-phase" | null {
  const n = num(value);
  return n === 1 ? "Single-phase" : n === 3 ? "Three-phase" : null;
}

export type AcSupply = { volts: number | null; amps: number | null; phases: 1 | 3 | null; cable: { name: string; standard: string } | null };

// Null when the car reported none of it. Volts and amps are whole numbers; a phase count other than 1 or
// 3 is left out rather than guessed at.
export function acSupply(s: { ac_voltage: unknown; ac_amps: unknown; ac_phases: unknown; cable_type: unknown }): AcSupply | null {
  const volts = num(s.ac_voltage);
  const amps = num(s.ac_amps);
  const n = num(s.ac_phases);
  const supply: AcSupply = {
    volts: volts !== null && volts > 0 ? Math.round(volts) : null,
    amps: amps !== null && amps > 0 ? Math.round(amps) : null,
    phases: n === 1 || n === 3 ? n : null,
    cable: cable(s.cable_type),
  };
  return Object.values(supply).some((v) => v !== null) ? supply : null;
}
