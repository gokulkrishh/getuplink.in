// Flags Tesla sends at the top of vehicle_data, read from the latest online check. A notice shows only
// when Tesla said true; false, missing or anything else shows nothing. Pure, so tested.
export type CarFlags = { supercharger_payment_needed?: unknown; in_service?: unknown };

export function carNotices(flags: CarFlags | null): string[] {
  if (!flags) return [];
  return [
    flags.supercharger_payment_needed === true && "Tesla shows an unpaid Supercharger balance.",
    flags.in_service === true && "The car is at a Tesla service centre.",
  ].filter((n): n is string => typeof n === "string");
}
