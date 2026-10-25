// A value such as "46 km", "1 h 15 min", "₹12/kWh" or "≈ 412 km" split into its numbers and its units, so the
// unit can follow the number without a monospace space (a full character wide). A unit is any part with a
// letter or %, trimmed; anything else (a number, or a sign before one, like "≈ ", "₹", "−") is kept as it is.
export type MeasurePart = { text: string; unit: boolean };

export function measureParts(text: string): MeasurePart[] {
  return text
    .split(/(\d[\d.,]*)/)
    .filter((part) => part.trim())
    .map((part) => (/[\p{L}%]/u.test(part) ? { text: part.trim(), unit: true } : { text: part, unit: false }));
}
