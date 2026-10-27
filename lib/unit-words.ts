// Plain words for the units and terms an owner may not read at a glance, in one place, so every ⓘ popover
// (components/info-button.tsx) says the same thing. Units and terms any EV owner knows (km, kWh, kW, W, V, A, AC, DC, ₹/kWh,
// Wh/km, psi, regen, %, °C, ₹, min) have no entry and are never explained: only what's genuinely unclear. Each entry is one sentence, without its full stop.
export const UNIT_WORDS: Record<string, string> = {
  "km/h per second": "km/h per second is how much speed the car gained or lost in one second",
  "m/s²": "m/s² is how quickly the car sped up or slowed down. At 1 m/s² the car gains or loses 3.6 km/h each second",
  mV: "mV is a thousandth of a volt, small enough to show tiny differences between the battery's cells",
  cell: "The battery is made of many small cells. When they are balanced, they charge and drain together",
  "usable capacity": "Usable capacity is how much energy the battery holds from full to empty, worked out each week. A week shows once the battery level has moved by 15% or more",
  "full pack, per Tesla": "Full pack, per Tesla, is the car's own figure. It includes a reserve kept below 0%, so it reads a few kWh above usable capacity",
  "charge cycles": "A charge cycle is one full battery's worth of charging, added up from smaller charges",
  "charging efficiency": "Charging efficiency is the share of the charger's energy that reached the battery. The rest is lost as heat or used by the car while it charges",
  grade: "Road grade is how steep the road is: 5% rises 5 metres for every 100 metres driven",
};

// The words for one unit or term, or null when it needs none.
export function unitWords(unit: string | undefined): string | null {
  return (unit && UNIT_WORDS[unit]) || null;
}

// "kWh (kilowatt-hours) is energy, …." for each unit or term given that has words, in order, once each.
export function unitNotes(units: (string | undefined)[]): string {
  return [...new Set(units)].flatMap((u) => (u && UNIT_WORDS[u] ? [`${UNIT_WORDS[u]}.`] : [])).join(" ");
}

// Whether any of these has words, so an ⓘ (components/info-button.tsx) is worth drawing.
export function hasWords(units: (string | undefined)[] = []): boolean {
  return units.some((u) => Boolean(u && UNIT_WORDS[u]));
}
