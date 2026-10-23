// Where you charge most, after TeslaMate's top charging stations: charges, energy and spend per station
// name. Spend counts real bills only. Pure, so tested directly.

export type StationRow = { name: string; charges: number; kwh: number; spend: number; billed: number };
type Charge = { name: string | null; kwh: number | null; cost: number | null };

export function topStations(charges: Charge[], limit = 8): StationRow[] {
  const rows = new Map<string, StationRow>();
  for (const c of charges) {
    if (!c.name) continue;
    const row = rows.get(c.name) ?? { name: c.name, charges: 0, kwh: 0, spend: 0, billed: 0 };
    row.charges++;
    row.kwh += c.kwh ?? 0;
    if (c.cost !== null) {
      row.spend += c.cost;
      row.billed++;
    }
    rows.set(c.name, row);
  }
  return [...rows.values()].sort((a, b) => b.kwh - a.kwh || b.charges - a.charges).slice(0, limit);
}
