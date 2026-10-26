// Plain words for the units and terms an owner may not read at a glance, in one place, so every ⓘ popover
// (components/info-button.tsx) says the same thing. Obvious units (km, km/h, %, °C, ₹, min) have no entry
// and are never explained. Each entry is one sentence, without its full stop.
export const UNIT_WORDS: Record<string, string> = {
  kWh: "kWh (kilowatt-hours) is energy, the same unit as on an electricity bill",
  kW: "kW (kilowatts) is power, how fast energy flows at a moment; kW is to kWh what km/h is to km",
  W: "W (watts) is power, how fast energy flows at a moment; 1,000 W is 1 kW",
  "km/h per second": "km/h per second is how much speed the car gained or lost in one second",
  "m/s²": "m/s² is how quickly the car sped up or slowed down: 1 m/s² is 3.6 km/h gained or lost each second",
  "Wh/km": "Wh/km is the energy used for each kilometre, in watt-hours (1,000 Wh is 1 kWh); lower is more efficient",
  "₹/kWh": "₹/kWh is the price of one kWh of energy, like a unit on an electricity bill",
  "% a day": "% a day is how much of a full battery the car lost for each day it sat parked",
  psi: "psi (pounds per square inch) is tyre pressure, the unit air pumps at petrol stations show",
  mV: "mV (millivolts) is a thousandth of a volt, small enough to show the tiny gaps between the battery's cells",
  cell: "The battery is built from many small cells; when they are evenly balanced, they charge and drain together",
  capacity: "Capacity is how much energy the battery holds when full; every battery holds a little less as it ages",
  "usable capacity": "Usable capacity is the energy the battery gives from 100% down to 0%, from each week's readings; a week shows once its charge moved 15 points",
  "full pack, per Tesla": "Full pack, per Tesla, is the car's own figure; it includes a reserve kept below 0%, so it reads a few kWh above usable capacity",
  "range at 100%": "Range at 100% is how far the car could go on a full battery, worked out from the range it shows and its charge level",
  "charge cycles": "A charge cycle is one full battery's worth of energy charged, made up of any number of smaller charges",
  "charging efficiency": "Charging efficiency is the share of the charger's energy that reached the battery; the rest is lost as heat or runs the car while it charges",
  "AC and DC": "AC is slower charging from a wall socket or a home charger; DC is fast charging, like a Supercharger",
  grade: "Road grade is how steep the road is: 5% rises 5 metres for every 100 metres driven",
  regen: "Regen is the motor slowing the car and sending energy back into the battery",
  V: "V (volts) is the push behind the electricity; a home socket in India gives about 230 V",
  A: "A (amps) is how much current flowed; more amps at the same volts charges faster",
  AC: "AC is slower charging from a wall charger or socket, where the car's own charger fills the battery",
  DC: "DC is fast charging, like a Supercharger, where the station feeds the battery directly",
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
