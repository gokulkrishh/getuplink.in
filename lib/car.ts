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
