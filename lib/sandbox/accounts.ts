// The made-up Tesla accounts the sandbox's login page offers (app/sandbox/tesla-login). Each has a Tesla
// account id (the id_token's sub), the region Tesla would name for it, and its cars. Nothing here is a real
// person, account or car: the VINs are 17 characters with the model at position 4, and end in letters
// that read as fake (SBX = sandbox).

export const APAC_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";
export const EUROPE_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

export type SandboxCar = { id: string; vin: string; name: string; version: string; odometerMiles: number; battery: number };

export type SandboxAccount = {
  key: string; // the fake authorization code the login page sends back
  label: string;
  note: string;
  sub: string;
  name: string;
  region: string; // fleet_api_base_url
  cars: SandboxCar[];
};

export const OWNER_VIN = "LRWYGCEK3TCSBX001"; // Model Y, ends SBX001
export const FRIEND_VIN = "LRW3E7EK1TCSBX777"; // Model 3, ends SBX777
export const EUROPE_VIN = "XP7YGCEK0TCEU0042"; // Model Y, ends EU0042

const ownerCar: SandboxCar = { id: "900000000001", vin: OWNER_VIN, name: "Sandbox Y", version: "2026.38.5.1", odometerMiles: 14_210, battery: 61 };

export const SANDBOX_ACCOUNTS: SandboxAccount[] = [
  {
    key: "owner",
    label: "Owner (admin)",
    note: "Approved admin. Model Y ending SBX001, with three months of fake history.",
    sub: "sandbox-owner",
    name: "Sandbox Owner",
    region: APAC_BASE,
    cars: [ownerCar],
  },
  {
    key: "friend",
    label: "Friend with car",
    note: "Not in Uplink yet. Model 3 ending SBX777.",
    sub: "sandbox-friend",
    name: "Sandbox Friend",
    region: APAC_BASE,
    cars: [{ id: "900000000777", vin: FRIEND_VIN, name: "Friend's 3", version: "2026.32.10", odometerMiles: 5_120, battery: 74 }],
  },
  {
    key: "nocar",
    label: "Account with no car",
    note: "Not in Uplink. No cars on the account.",
    sub: "sandbox-no-car",
    name: "Sandbox No Car",
    region: APAC_BASE,
    cars: [],
  },
  {
    key: "driver2",
    label: "Second driver of the owner's car",
    note: "Not in Uplink. Shares the owner's Model Y ending SBX001.",
    sub: "sandbox-second-driver",
    name: "Sandbox Second Driver",
    region: APAC_BASE,
    cars: [ownerCar],
  },
  {
    key: "europe",
    label: "Europe account",
    note: "Not in Uplink. Tesla serves it from Europe, so it can't join.",
    sub: "sandbox-europe",
    name: "Sandbox Europe",
    region: EUROPE_BASE,
    cars: [{ id: "900000000042", vin: EUROPE_VIN, name: "EU Y", version: "2026.38.5.1", odometerMiles: 9_800, battery: 55 }],
  },
];

export function sandboxAccount(key: string | null | undefined): SandboxAccount | null {
  return SANDBOX_ACCOUNTS.find((a) => a.key === key) ?? null;
}
