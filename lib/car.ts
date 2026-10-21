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
