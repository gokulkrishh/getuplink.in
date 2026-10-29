// Flags Tesla sends at the top of vehicle_data, read from the latest online check. A flag counts only
// when Tesla said true; false, missing or anything else is nothing. Pure, so tested. Home and the car page
// show the notices; the header bell lists the same flags (lib/alerts.ts).
export type CarFlags = { supercharger_payment_needed?: unknown; in_service?: unknown };

export type FlagsSeen = { unpaidSupercharging: boolean; inService: boolean };

export function flagsSeen(flags: CarFlags | null): FlagsSeen {
  return { unpaidSupercharging: flags?.supercharger_payment_needed === true, inService: flags?.in_service === true };
}

export function carNotices(flags: CarFlags | null): string[] {
  const seen = flagsSeen(flags);
  return [
    seen.unpaidSupercharging && "Tesla shows an unpaid Supercharger balance.",
    seen.inService && "The car is at a Tesla service centre.",
  ].filter((n): n is string => typeof n === "string");
}
