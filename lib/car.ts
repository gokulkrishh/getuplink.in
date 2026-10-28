// Tesla reports car_type like "modely" and colours like "PearlWhite"; these make them readable.
const MODELS: [prefix: string, name: string][] = [
  ["models", "Model S"],
  ["model3", "Model 3"],
  ["modelx", "Model X"],
  ["modely", "Model Y"],
  ["cybertruck", "Cybertruck"],
];

export const MILES_TO_KM = 1.609344;

export function modelName(carType: string | null | undefined): string | null {
  const type = carType?.toLowerCase() ?? "";
  return MODELS.find(([prefix]) => type.startsWith(prefix))?.[1] ?? null;
}

// "MidnightSilver" -> "Midnight Silver"
export function colorName(color: string | null | undefined): string | null {
  const name = color?.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return name || null;
}

// Readable labels for Tesla's vehicle_config codes. Unknown codes fall back to null so the row hides
// rather than showing a raw code.

// VIN position 10 is the model year (ISO 3779 cycle; only recent years matter for Tesla India).
const VIN_YEARS: Record<string, number> = { N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027, W: 2028 };
export function modelYear(vin: string | null | undefined): number | null {
  return (vin && VIN_YEARS[vin.charAt(9).toUpperCase()]) || null;
}

// VIN position 11 is the factory.
const PLANTS: Record<string, string> = { A: "Austin, USA", B: "Berlin, Germany", C: "Shanghai, China", F: "Fremont, USA" };
export function factory(vin: string | null | undefined): string | null {
  return (vin && PLANTS[vin.charAt(10).toUpperCase()]) || null;
}

// trim_badging ends in "d" for dual motor ("74d"); a rear unit alone means rear-wheel drive.
export function driveLabel(trim: string | null | undefined, performance: string | null | undefined): string | null {
  if (!trim) return null;
  if (performance && performance !== "Base") return "Performance, all-wheel drive";
  return /d$/i.test(trim) ? "All-wheel drive" : "Rear-wheel drive";
}

// "Crossflow19" -> 19″ Crossflow
export function wheelsLabel(wheel: string | null | undefined): string | null {
  const m = wheel?.match(/^([A-Za-z]+?)(\d{2})$/);
  return m ? `${m[2]}″ ${colorName(m[1])}` : colorName(wheel);
}

// "TeslaAP4" -> Hardware 4
export function hardwareLabel(driverAssist: string | null | undefined): string | null {
  const m = driverAssist?.match(/AP(\d)/);
  return m ? `Hardware ${m[1]}` : null;
}

// "RoofColorGlass" -> Glass; "Black2" -> Black
export function roofLabel(roof: string | null | undefined): string | null {
  return colorName(roof?.replace(/^RoofColor/, ""));
}
export function interiorLabel(interior: string | null | undefined): string | null {
  return colorName(interior?.replace(/\d+$/, ""));
}

// "MYRefresh2025Row" marks the 2025 refresh of the Model Y.
export function generationLabel(pkg: string | null | undefined): string | null {
  const m = pkg?.match(/Refresh(\d{4})/);
  return m ? `${m[1]} refresh` : null;
}

// trim_badging is the pack's badge: "50" is the Standard Range pack, "74"/"74d" the Long Range one.
// Only the codes we're sure of; anything else hides the row.
const TRIMS: Record<string, string> = { "50": "Standard Range", "74": "Long Range", "74d": "Long Range" };
export function trimLabel(trim: string | null | undefined): string | null {
  return (trim && TRIMS[trim.toLowerCase()]) || null;
}

// The codes the labels above know exactly. A new variant (a Model Y L, a new pack) can still match a model
// prefix, or hide its pack row, so /admin lists any car reporting a code outside these to add it here.
const KNOWN_CAR_TYPES = new Set(MODELS.map(([code]) => code));
export function unknownCodes(config: { car_type?: string | null; trim_badging?: string | null }): string[] {
  const codes: string[] = [];
  if (config.car_type && !KNOWN_CAR_TYPES.has(config.car_type.toLowerCase())) codes.push(`model "${config.car_type}"`);
  if (config.trim_badging && !trimLabel(config.trim_badging)) codes.push(`pack "${config.trim_badging}"`);
  return codes;
}

// Tesla doesn't report the cell chemistry. Shanghai-built cars that default to charging to 100% carry
// LFP packs (LFP is fine kept full; nickel packs default lower), so that pair is a fair guess.
export function likelyLfp(vin: string | null | undefined, defaultChargeToMax: boolean | null | undefined): boolean {
  return !!vin && vin.charAt(10).toUpperCase() === "C" && defaultChargeToMax === true;
}

// From the drive units the car reports; null when it reports none.
export function motorLayout(rear: string | null | undefined, front: string | null | undefined): string | null {
  if (rear && front) return "Dual motor";
  return rear ? "Single rear motor" : null;
}

// The odometer now in km: the newer of the latest online check's (vehicle_state.odometer) and the streamed
// Odometer reading, both in miles. Null when neither is a number.
export function odometerKm(...readings: ({ miles: unknown; at: string } | null | undefined)[]): number | null {
  const newest = readings
    .filter((r): r is { miles: number; at: string } => typeof r?.miles === "number" && r.miles > 0 && Number.isFinite(Date.parse(r.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return newest ? newest.miles * MILES_TO_KM : null;
}

export const PSI_PER_BAR = 14.5038;
// Tesla sends tyre pressures in bar (the streamed TpmsPressure* fields and vehicle_state's recommended
// tpms_rcp_*_value); Uplink shows them in whole psi: 2.9 bar -> "42 psi".
export const psi = (bar: number) => `${Math.round(bar * PSI_PER_BAR)} psi`;

// Tesla's recommended cold pressures, given in bar: "42 psi front, 45 psi rear".
export function tyrePressureLabel(front: number | null | undefined, rear: number | null | undefined): string | null {
  const ok = (v: number | null | undefined): v is number => typeof v === "number" && v > 0;
  if (!ok(front) || !ok(rear)) return null;
  return `${psi(front)} front, ${psi(rear)} rear`;
}
