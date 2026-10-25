// Plain words for the units and terms an owner may not read at a glance, in one place, so a chart's
// caption and a tile's note say the same thing. Obvious units (km, km/h, %, °C, ₹, min) have no entry
// and are never explained. Each entry is one sentence, without its full stop.
export const UNIT_WORDS: Record<string, string> = {
  kWh: "kWh (kilowatt-hours) is energy, the same unit as on an electricity bill",
  kW: "kW (kilowatts) is power, how fast energy flows at a moment",
  "km/h per second": "km/h per second is how much speed the car gained or lost in one second",
  "m/s²": "m/s² is how quickly the car sped up or slowed down: 1 m/s² is 3.6 km/h gained or lost each second",
  "Wh/km": "Wh/km is the energy used for each kilometre, in watt-hours (1,000 Wh is 1 kWh); lower is more efficient",
  "₹/kWh": "₹/kWh is the price of one kWh of energy, like a unit on an electricity bill",
  "% a day": "% a day is how much battery the car lost each day while parked",
  psi: "psi (pounds per square inch) is tyre pressure",
  grade: "Road grade is how steep the road is: 5% rises 5 metres for every 100 metres driven",
  regen: "Regen is the motor slowing the car and sending energy back into the battery",
};

// The words for one unit or term, or null when it needs none.
export function unitWords(unit: string | undefined): string | null {
  return (unit && UNIT_WORDS[unit]) || null;
}

// "kWh (kilowatt-hours) is energy, …." for each unit or term given that has words, in order, once each.
export function unitNotes(units: (string | undefined)[]): string {
  return [...new Set(units)].flatMap((u) => (u && UNIT_WORDS[u] ? [`${UNIT_WORDS[u]}.`] : [])).join(" ");
}
