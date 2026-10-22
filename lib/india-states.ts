// India's states and union territories, by the two-letter code on number plates (TG for Telangana, DD for
// the merged Dadra and Nagar Haveli and Daman and Diu). A car's home state is one of these codes; nothing
// finer is ever stored. Regions follow the Zonal Councils, with the two island territories (in none of
// them) placed with the coast they face.
export const REGIONS = ["North", "Central", "East", "West", "South", "Northeast"] as const;
export type Region = (typeof REGIONS)[number];

export const STATES = {
  JK: { name: "Jammu & Kashmir", region: "North" },
  LA: { name: "Ladakh", region: "North" },
  HP: { name: "Himachal Pradesh", region: "North" },
  PB: { name: "Punjab", region: "North" },
  CH: { name: "Chandigarh", region: "North" },
  HR: { name: "Haryana", region: "North" },
  DL: { name: "Delhi", region: "North" },
  RJ: { name: "Rajasthan", region: "North" },
  UP: { name: "Uttar Pradesh", region: "Central" },
  UK: { name: "Uttarakhand", region: "Central" },
  MP: { name: "Madhya Pradesh", region: "Central" },
  CG: { name: "Chhattisgarh", region: "Central" },
  BR: { name: "Bihar", region: "East" },
  JH: { name: "Jharkhand", region: "East" },
  OD: { name: "Odisha", region: "East" },
  WB: { name: "West Bengal", region: "East" },
  AN: { name: "Andaman & Nicobar", region: "East" },
  GJ: { name: "Gujarat", region: "West" },
  MH: { name: "Maharashtra", region: "West" },
  GA: { name: "Goa", region: "West" },
  DD: { name: "Dadra & Nagar Haveli and Daman & Diu", region: "West" },
  AP: { name: "Andhra Pradesh", region: "South" },
  TG: { name: "Telangana", region: "South" },
  KA: { name: "Karnataka", region: "South" },
  KL: { name: "Kerala", region: "South" },
  TN: { name: "Tamil Nadu", region: "South" },
  PY: { name: "Puducherry", region: "South" },
  LD: { name: "Lakshadweep", region: "South" },
  AS: { name: "Assam", region: "Northeast" },
  AR: { name: "Arunachal Pradesh", region: "Northeast" },
  NL: { name: "Nagaland", region: "Northeast" },
  MN: { name: "Manipur", region: "Northeast" },
  MZ: { name: "Mizoram", region: "Northeast" },
  TR: { name: "Tripura", region: "Northeast" },
  ML: { name: "Meghalaya", region: "Northeast" },
  SK: { name: "Sikkim", region: "Northeast" },
} as const satisfies Record<string, { name: string; region: Region }>;

export type StateCode = keyof typeof STATES;

export function isStateCode(value: unknown): value is StateCode {
  return typeof value === "string" && Object.hasOwn(STATES, value);
}

// The city before the comma in a Supercharger's name ("Bengaluru, Nexus Koramangala"), lower case, to its
// state. Old names and satellite towns are listed too; a city missing here simply doesn't count.
const SITE_CITIES: Record<string, StateCode> = {
  bengaluru: "KA", bangalore: "KA", mysuru: "KA", mysore: "KA", maddur: "KA", mangaluru: "KA", hubballi: "KA",
  mumbai: "MH", "navi mumbai": "MH", thane: "MH", pune: "MH", lonavala: "MH", nashik: "MH", nagpur: "MH",
  delhi: "DL", "new delhi": "DL",
  gurugram: "HR", gurgaon: "HR", faridabad: "HR", panipat: "HR",
  noida: "UP", "greater noida": "UP", ghaziabad: "UP", lucknow: "UP", agra: "UP",
  hyderabad: "TG", secunderabad: "TG",
  chennai: "TN", coimbatore: "TN", madurai: "TN", hosur: "TN",
  kochi: "KL", cochin: "KL", thiruvananthapuram: "KL", kozhikode: "KL",
  kolkata: "WB",
  ahmedabad: "GJ", gandhinagar: "GJ", surat: "GJ", vadodara: "GJ",
  chandigarh: "CH", mohali: "PB", ludhiana: "PB", amritsar: "PB",
  jaipur: "RJ", udaipur: "RJ",
  goa: "GA", panaji: "GA",
  indore: "MP", bhopal: "MP",
  bhubaneswar: "OD",
  visakhapatnam: "AP", vijayawada: "AP",
  dehradun: "UK",
  puducherry: "PY",
};
const STATE_NAMES = new Map<string, StateCode>(Object.entries(STATES).map(([code, s]) => [s.name.toLowerCase(), code as StateCode]));

// "Bengaluru, Nexus Koramangala" -> "KA". Null when the city isn't known.
export function siteState(siteName: string | null): StateCode | null {
  const city = siteName?.split(",")[0].trim().toLowerCase();
  if (!city) return null;
  return SITE_CITIES[city] ?? STATE_NAMES.get(city) ?? null;
}

// The state that comes up most often, the latest of them on a tie. Oldest first in, so a car's recent
// checks or a list of Supercharger visits both work. Null when none is a known state.
export function mostCommonState(codes: (string | null)[]): StateCode | null {
  const counts = new Map<StateCode, number>();
  let best: StateCode | null = null;
  for (const code of codes) {
    if (!isStateCode(code)) continue;
    const n = (counts.get(code) ?? 0) + 1;
    counts.set(code, n);
    if (best === null || n >= (counts.get(best) ?? 0)) best = code;
  }
  return best;
}
