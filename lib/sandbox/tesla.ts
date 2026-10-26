import "server-only";
import { sandboxAccount, type SandboxAccount, type SandboxCar } from "./accounts";

// The sandbox's Tesla: a fetch that answers Tesla's token endpoint and the Fleet API paths Uplink calls,
// from the made-up accounts in ./accounts.ts. lib/server/tesla.ts sends through it instead of fetch while
// the sandbox is on, so signIn, the region and invite checks and the check after sign-in all run unchanged.
// Nothing leaves the machine.
//
// The code the login page returns is the account's key. Tokens name their account, so they need no state:
// "sbx.<key>.<n>" (access) and "sbx-r.<key>.<n>" (refresh).

type Call = { method: string; path: string; account: string | null };

// Every request it answered, for the tests. Kept on globalThis so dev's module reloads share it.
const g = globalThis as typeof globalThis & { __uplinkSandboxTeslaCalls?: Call[] };
export const sandboxTeslaCalls = (): Call[] => (g.__uplinkSandboxTeslaCalls ??= []);

let issued = 0;

function idToken(sub: string): string {
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part({ sub, iss: "https://sandbox.invalid" })}.sandbox`;
}

function tokens(account: SandboxAccount) {
  issued++;
  return Response.json({
    access_token: `sbx.${account.key}.${issued}`,
    refresh_token: `sbx-r.${account.key}.${issued}`,
    expires_in: 8 * 60 * 60,
    scope: "openid offline_access user_data vehicle_device_data vehicle_location vehicle_charging_cmds",
    id_token: idToken(account.sub),
    token_type: "Bearer",
  });
}

const accountOfToken = (token: string, prefix: string) => (token.startsWith(`${prefix}.`) ? sandboxAccount(token.split(".")[1]) : null);

const notFound = (what: string) => Response.json({ response: null, error: `not_found: ${what}`, error_description: "" }, { status: 404 });

function listed(car: SandboxCar) {
  return { id: Number(car.id), id_s: car.id, vehicle_id: Number(car.id) + 1, vin: car.vin, display_name: car.name, state: "online", in_service: false };
}

function vehicleData(car: SandboxCar) {
  return {
    id_s: car.id,
    vin: car.vin,
    state: "online",
    vehicle_state: { car_version: `${car.version} sandbox`, odometer: car.odometerMiles, software_update: { status: "", version: " ", download_perc: 0, install_perc: 1, expected_duration_sec: 2700 } },
    charge_state: { battery_level: car.battery, battery_range: Math.round(car.battery * 3.1), charging_state: "Disconnected", charge_limit_soc: 80 },
    vehicle_config: { car_type: car.vin.charAt(3) === "3" ? "model3" : "modely", exterior_color: "PearlWhite", trim_badging: "74d" },
  };
}

async function fleetApi(method: string, url: URL, account: SandboxAccount): Promise<Response> {
  const path = url.pathname;
  if (path === "/api/1/users/me") return Response.json({ response: { email: `${account.key}@sandbox.invalid`, full_name: account.name, profile_image_url: null } });
  if (path === "/api/1/users/region") {
    return Response.json({ response: { region: account.region.includes(".eu.") ? "eu" : "na", fleet_api_base_url: account.region } });
  }
  if (path === "/api/1/vehicles") return Response.json({ response: account.cars.map(listed), count: account.cars.length });
  if (path === "/api/1/dx/charging/history") return Response.json({ response: { data: [], totalResults: 0 } });
  if (method === "POST" && path === "/api/1/vehicles/fleet_status") {
    const vins = account.cars.map((c) => c.vin);
    const info = Object.fromEntries(
      account.cars.map((c) => [c.vin, { firmware_version: c.version, vehicle_command_protocol_required: true, discounted_device_data: false, fleet_telemetry_version: "1.2.0", total_number_of_keys: 4 }]),
    );
    return Response.json({ response: { key_paired_vins: vins, unpaired_vins: [], vehicle_info: info } });
  }
  // Sending the streaming config (the /setup branch): every car on the account takes it.
  if (method === "POST" && path === "/api/1/vehicles/fleet_telemetry_config_jws") {
    return Response.json({
      response: { updated_vehicles: account.cars.length, skipped_vehicles: { missing_key: [], unsupported_hardware: [], unsupported_firmware: [], max_configs: [] } },
    });
  }
  const match = path.match(/^\/api\/1\/vehicles\/([^/]+)\/([a-z_]+)$/);
  const car = match && account.cars.find((c) => c.vin === match[1] || c.id === match[1]);
  if (!match || !car) return notFound(path);
  switch (match[2]) {
    case "vehicle_data":
      return Response.json({ response: vehicleData(car) });
    case "release_notes":
      return Response.json({ response: null });
    case "fleet_telemetry_config":
      if (method === "DELETE") return Response.json({ response: { updated_vehicles: 1 } });
      return Response.json({
        response: { synced: true, config: { hostname: "telemetry.sandbox.invalid", port: 443, exp: 1999999999, fields: { Soc: { interval_seconds: 300 } } }, limit_reached: false, key_paired: true },
      });
    case "fleet_telemetry_errors":
      return Response.json({ response: { fleet_telemetry_errors: [] } });
    default:
      return notFound(path);
  }
}

// The transport: same signature as fetch.
export const sandboxTesla = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  if (url.pathname.endsWith("/oauth2/v3/token")) {
    const form = new URLSearchParams(String(init?.body ?? ""));
    const account =
      form.get("grant_type") === "authorization_code"
        ? sandboxAccount(form.get("code"))
        : form.get("grant_type") === "refresh_token"
          ? accountOfToken(form.get("refresh_token") ?? "", "sbx-r")
          : null;
    sandboxTeslaCalls().push({ method, path: url.pathname, account: account?.key ?? null });
    return account ? tokens(account) : Response.json({ error: "invalid_grant", error_description: "Unknown sandbox code" }, { status: 401 });
  }
  const bearer = new Headers(init?.headers).get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const account = accountOfToken(bearer, "sbx");
  sandboxTeslaCalls().push({ method, path: url.pathname, account: account?.key ?? null });
  if (!account) return Response.json({ error: "invalid bearer token" }, { status: 401 });
  return fleetApi(method, url, account);
}) as typeof fetch;
