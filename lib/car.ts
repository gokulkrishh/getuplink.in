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

// Swatch colours for Tesla paints, by the readable name colorName() returns. Tesla doesn't publish
// hex values, so these are close visual matches to each paint, not official codes.
const PAINTS: Record<string, string> = {
  "Pearl White": "#f1f1ee",
  "Diamond Black": "#0d0e10",
  "Stealth Grey": "#3e4146",
  "Glacier Blue": "#9fb5c8",
  Quicksilver: "#b9bdc1",
  "Ultra Red": "#a3151c",
  "Midnight Silver": "#4b4f55",
  "Deep Blue": "#1f3b6f",
  "Solid Black": "#0b0b0b",
  "Red Multi Coat": "#a51d25",
  "Midnight Cherry Red": "#5d1b23",
};

export function paintHex(name: string | null | undefined): string | null {
  return (name && PAINTS[name]) || null;
}
