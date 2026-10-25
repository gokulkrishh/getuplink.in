// A value such as "46 km", "1 h 15 min", "₹12/kWh" or "≈ 412 km" split into its numbers and its units, so the
// unit can follow the number without a monospace space (a full character wide). A unit is any part with a
// letter or %, trimmed; anything else (a number, a sign before one like "≈ " or "₹", punctuation like ", ")
// is kept as it is. A bare space between two numbers stays; one beside a unit or at either end goes.
export type MeasurePart = { text: string; unit: boolean };

const isUnit = (part: string) => /[\p{L}%]/u.test(part);

export function measureParts(text: string): MeasurePart[] {
  const parts = text.split(/(\d+(?:[.,]\d+)*)/).filter((part) => part !== "");
  return parts.flatMap((part, k): MeasurePart[] => {
    if (isUnit(part)) return [{ text: part.trim(), unit: true }];
    if (part.trim()) return [{ text: part, unit: false }];
    const between = k > 0 && k < parts.length - 1 && !isUnit(parts[k - 1]) && !isUnit(parts[k + 1]);
    return between ? [{ text: part, unit: false }] : [];
  });
}
