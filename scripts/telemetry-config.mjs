#!/usr/bin/env node
// Push (or inspect) the Fleet Telemetry streaming config for one car.
//
//   node scripts/telemetry-config.mjs            dry run: prints the request, sends nothing
//   node scripts/telemetry-config.mjs --send     POST the config through the vehicle-command proxy
//   node scripts/telemetry-config.mjs --status   GET fleet_telemetry_config (look for synced: true)
//   node scripts/telemetry-config.mjs --errors   GET fleet_telemetry_errors
//
// Env:
//   TESLA_ACCESS_TOKEN     owner's Fleet API access token (never printed)
//   VIN                    the car
//   TELEMETRY_CA_FILE      PEM of OUR CA (the one that signed the server cert), needed for dry run / --send
//   TESLA_PROXY_URL        vehicle-command proxy, default https://localhost:4443  (--send only)
//   TESLA_PROXY_CA_FILE    the proxy's own TLS cert.pem (it is self-signed)       (--send only)
//   TESLA_FLEET_API_BASE_URL  default https://fleet-api.prd.na.vn.cloud.tesla.com (same as the app)
//   TELEMETRY_HOSTNAME     default telemetry.getuplink.in
//
// Signing: Tesla's docs say fleet_telemetry_config "should be called through the Vehicle Command
// Proxy", which signs the config with the app's private key (the one behind the public key at
// /.well-known). The raw fleet_telemetry_config_jws endpoint is documented as not recommended, so
// this script does NOT sign anything itself. Run the proxy locally:
//   tesla-http-proxy -tls-key proxy-tls-key.pem -cert proxy-cert.pem -key-file fleet-key.pem -port 4443
// (fleet-key.pem is the private key matching the app's registered public key.)

import { readFileSync } from "node:fs";
import https from "node:https";

const args = new Set(process.argv.slice(2));
const mode = args.has("--status") ? "status" : args.has("--errors") ? "errors" : args.has("--send") ? "send" : "dry";

const HOSTNAME = process.env.TELEMETRY_HOSTNAME || "telemetry.getuplink.in";
const PORT = 443;
const FLEET_BASE = (process.env.TESLA_FLEET_API_BASE_URL || "https://fleet-api.prd.na.vn.cloud.tesla.com").replace(/\/$/, "");
const PROXY = (process.env.TESLA_PROXY_URL || "https://localhost:4443").replace(/\/$/, "");

// Every field in protos/vehicle_data.proto (teslamotors/fleet-telemetry) that a car can send: the owner
// asked Uplink to keep all of it, location included. Left out: Semitruck*, Experimental_* and
// Deprecated_* (not this car, or not real fields). A field the car doesn't have is never sent.
const ALL_FIELDS = [
  "DriveRail", "ChargeState", "BmsFullchargecomplete", "VehicleSpeed", "Odometer", "PackVoltage",
  "PackCurrent", "Soc", "DCDCEnable", "Gear", "IsolationResistance", "PedalPosition", "BrakePedal",
  "DiStateR", "DiHeatsinkTR", "DiAxleSpeedR", "DiTorquemotor", "DiStatorTempR", "DiVBatR",
  "DiMotorCurrentR", "Location", "GpsState", "GpsHeading", "NumBrickVoltageMax", "BrickVoltageMax",
  "NumBrickVoltageMin", "BrickVoltageMin", "NumModuleTempMax", "ModuleTempMax", "NumModuleTempMin",
  "ModuleTempMin", "RatedRange", "Hvil", "DCChargingEnergyIn", "DCChargingPower", "ACChargingEnergyIn",
  "ACChargingPower", "ChargeLimitSoc", "FastChargerPresent", "EstBatteryRange", "IdealBatteryRange",
  "BatteryLevel", "TimeToFullCharge", "ScheduledChargingStartTime", "ScheduledChargingPending",
  "ScheduledDepartureTime", "PreconditioningEnabled", "ScheduledChargingMode", "ChargeAmps",
  "ChargeEnableRequest", "ChargerPhases", "ChargePortColdWeatherMode", "ChargeCurrentRequest",
  "ChargeCurrentRequestMax", "BatteryHeaterOn", "NotEnoughPowerToHeat", "SuperchargerSessionTripPlanner",
  "DoorState", "Locked", "FdWindow", "FpWindow", "RdWindow", "RpWindow", "VehicleName", "SentryMode",
  "SpeedLimitMode", "CurrentLimitMph", "Version", "TpmsPressureFl", "TpmsPressureFr", "TpmsPressureRl",
  "TpmsPressureRr", "TpmsLastSeenPressureTimeFl", "TpmsLastSeenPressureTimeFr",
  "TpmsLastSeenPressureTimeRl", "TpmsLastSeenPressureTimeRr", "InsideTemp", "OutsideTemp", "SeatHeaterLeft",
  "SeatHeaterRight", "SeatHeaterRearLeft", "SeatHeaterRearRight", "SeatHeaterRearCenter",
  "AutoSeatClimateLeft", "AutoSeatClimateRight", "DriverSeatBelt", "PassengerSeatBelt",
  "DriverSeatOccupied", "LateralAcceleration", "LongitudinalAcceleration", "CruiseSetSpeed",
  "LifetimeEnergyUsed", "LifetimeEnergyUsedDrive", "BrakePedalPos", "RouteLastUpdated", "RouteLine",
  "MilesToArrival", "MinutesToArrival", "OriginLocation", "DestinationLocation", "CarType", "Trim",
  "ExteriorColor", "RoofColor", "ChargePort", "ChargePortLatch", "GuestModeEnabled", "PinToDriveEnabled",
  "PairedPhoneKeyAndKeyFobQty", "CruiseFollowDistance", "AutomaticBlindSpotCamera",
  "BlindSpotCollisionWarningChime", "SpeedLimitWarning", "ForwardCollisionWarning",
  "LaneDepartureAvoidance", "EmergencyLaneDepartureAvoidance", "AutomaticEmergencyBrakingOff",
  "LifetimeEnergyGainedRegen", "DiStateF", "DiStateREL", "DiStateRER", "DiHeatsinkTF", "DiHeatsinkTREL",
  "DiHeatsinkTRER", "DiAxleSpeedF", "DiAxleSpeedREL", "DiAxleSpeedRER", "DiSlaveTorqueCmd",
  "DiTorqueActualR", "DiTorqueActualF", "DiTorqueActualREL", "DiTorqueActualRER", "DiStatorTempF",
  "DiStatorTempREL", "DiStatorTempRER", "DiVBatF", "DiVBatREL", "DiVBatRER", "DiMotorCurrentF",
  "DiMotorCurrentREL", "DiMotorCurrentRER", "EnergyRemaining", "ServiceMode", "BMSState",
  "GuestModeMobileAccessState", "DestinationName", "DiInverterTR", "DiInverterTF", "DiInverterTREL",
  "DiInverterTRER", "DetailedChargeState", "CabinOverheatProtectionMode",
  "CabinOverheatProtectionTemperatureLimit", "CenterDisplay", "ChargePortDoorOpen", "ChargerVoltage",
  "ChargingCableType", "ClimateKeeperMode", "DefrostForPreconditioning", "DefrostMode", "EfficiencyPackage",
  "EstimatedHoursToChargeTermination", "EuropeVehicle", "ExpectedEnergyPercentAtTripArrival",
  "FastChargerType", "HomelinkDeviceCount", "HomelinkNearby", "HvacACEnabled", "HvacAutoMode",
  "HvacFanSpeed", "HvacFanStatus", "HvacLeftTemperatureRequest", "HvacPower", "HvacRightTemperatureRequest",
  "HvacSteeringWheelHeatAuto", "HvacSteeringWheelHeatLevel", "OffroadLightbarPresent",
  "PowershareHoursLeft", "PowershareInstantaneousPowerKW", "PowershareStatus", "PowershareStopReason",
  "PowershareType", "RearDisplayHvacEnabled", "RearSeatHeaters", "RemoteStartEnabled", "RightHandDrive",
  "RouteTrafficMinutesDelay", "SoftwareUpdateDownloadPercentComplete",
  "SoftwareUpdateExpectedDurationMinutes", "SoftwareUpdateInstallationPercentComplete",
  "SoftwareUpdateScheduledStartTime", "SoftwareUpdateVersion", "TonneauOpenPercent", "TonneauPosition",
  "TonneauTentMode", "TpmsHardWarnings", "TpmsSoftWarnings", "ValetModeEnabled", "WheelType",
  "WiperHeatEnabled", "LocatedAtHome", "LocatedAtWork", "LocatedAtFavorite", "SettingDistanceUnit",
  "SettingTemperatureUnit", "Setting24HourTime", "SettingTirePressureUnit", "SettingChargeUnit",
  "ClimateSeatCoolingFrontLeft", "ClimateSeatCoolingFrontRight", "LightsHazardsActive", "LightsTurnSignal",
  "LightsHighBeams", "MediaPlaybackStatus", "MediaPlaybackSource", "MediaAudioVolume",
  "MediaNowPlayingDuration", "MediaNowPlayingElapsed", "MediaNowPlayingArtist", "MediaNowPlayingTitle",
  "MediaNowPlayingAlbum", "MediaNowPlayingStation", "MediaAudioVolumeIncrement", "MediaAudioVolumeMax",
  "SunroofInstalled", "SeatVentEnabled", "RearDefrostEnabled", "ChargeRateMilePerHour", "MilesSinceReset",
  "SelfDrivingMilesSinceReset", "GpsAccuracyMeters", "LifetimeEnergyChargedKwh", "BrickSocMinPercent",
  "NominalFullPackEnergyKwh", "GradeEstimatePercent", "MaxSpeedToReachDestinationMph",
  "SoftwareUpdateAvailable", "SoftwareUpdateInProgress", "RemoteStartActive", "Cabin12vPortKeepOn",
  "Cabin48vPortKeepOn"
];

const fields = {};
const set = (names, interval_seconds, extra = {}) => {
  for (const n of names) fields[n] = { interval_seconds, ...extra };
};
// Everything else: sent when it changes, at most once a minute (states, settings, media, navigation).
set(ALL_FIELDS, 60);
// Where the car is, every 10 s while it moves, for trip routes and stops.
set(["Location", "GpsHeading", "GpsAccuracyMeters"], 10);
// Speed every 10 s, only when it moves by 1.
set(["VehicleSpeed"], 10, { minimum_delta: 1 });
// Driving dynamics: drive units, pedals, acceleration, pack current and voltage. Every 30 s.
set(ALL_FIELDS.filter((n) => /^Di(Torque|AxleSpeed|MotorCurrent|VBat|SlaveTorque)|Pedal|Acceleration|^Pack(Current|Voltage)$|^GradeEstimate/.test(n)), 30);
// Temperatures, every 5 min and only when they move by a degree.
set(ALL_FIELDS.filter((n) => /Temp|Heatsink|^DiInverter/.test(n) && !/Request|Limit|Unit/.test(n)), 300, { minimum_delta: 1 });
// Battery and range, every 5 min.
set(["Soc", "BatteryLevel", "RatedRange", "EstBatteryRange", "IdealBatteryRange", "EnergyRemaining"], 300);
// Drive starts and ends: the gear as soon as it changes, the odometer every 30 s. At 5 minutes, a drive's
// first minutes and short moves between stops went unseen.
set(["Gear"], 1);
set(["Odometer"], 30);
set(["LifetimeEnergyUsed", "LifetimeEnergyGainedRegen", "LifetimeEnergyUsedDrive", "LifetimeEnergyChargedKwh", "NominalFullPackEnergyKwh"], 300);
// Tesla: SelfDrivingMilesSinceReset needs minimum_delta explicitly set to >= 1 (HW4, fw 2025.44.25.5+).
set(["SelfDrivingMilesSinceReset", "MilesSinceReset"], 3600, { minimum_delta: 1 });
// Brick voltages move constantly by tiny amounts: every 5 min.
set(ALL_FIELDS.filter((n) => /Brick/.test(n)), 300);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function usage() {
  return [
    "Usage: node scripts/telemetry-config.mjs [--send | --status | --errors]",
    "  (no flag)  dry run, prints the request body",
    "Required env: VIN, TELEMETRY_CA_FILE (dry run and --send); plus TESLA_ACCESS_TOKEN for --send/--status/--errors.",
    "Optional env: TESLA_PROXY_URL, TESLA_PROXY_CA_FILE, TESLA_FLEET_API_BASE_URL, TELEMETRY_HOSTNAME.",
  ].join("\n");
}

const vin = process.env.VIN;
const token = process.env.TESLA_ACCESS_TOKEN;
const needVin = () => vin || die(`Missing VIN.\n${usage()}`);
const needToken = () => token || die(`Missing TESLA_ACCESS_TOKEN.\n${usage()}`);

function buildBody() {
  const caFile = process.env.TELEMETRY_CA_FILE;
  if (!caFile) die(`Missing TELEMETRY_CA_FILE (path to our CA certificate PEM).\n${usage()}`);
  let ca;
  try {
    ca = readFileSync(caFile, "utf8").trim();
  } catch (e) {
    die(`Cannot read TELEMETRY_CA_FILE ${caFile}: ${e.message}`);
  }
  if (!ca.includes("BEGIN CERTIFICATE")) die(`${caFile} does not look like a PEM certificate.`);
  return {
    vins: [needVin()],
    config: {
      hostname: HOSTNAME,
      port: PORT,
      ca,
      fields,
      // Unix seconds. Tesla rejects anything past ~364 days ahead, so stay under a year.
      exp: Math.floor(Date.now() / 1000) + 360 * 24 * 3600,
    },
  };
}

const masked = (v) => `*${String(v).slice(-4)}`;

function request(url, { method = "GET", body, ca } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        ca,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function show({ status, text }) {
  let out = text;
  try {
    out = JSON.stringify(JSON.parse(text), null, 2);
  } catch {}
  console.log(`HTTP ${status}\n${out}`);
  if (status >= 400) process.exit(1);
}

if (mode === "dry") {
  const body = buildBody();
  const preview = { ...body, vins: body.vins.map(masked), config: { ...body.config, ca: `${body.config.ca.split("\n")[0]} ... (${body.config.ca.length} chars)` } };
  console.log(`DRY RUN. Would POST ${PROXY}/api/1/vehicles/fleet_telemetry_config\n${JSON.stringify(preview, null, 2)}\nexp = ${new Date(body.config.exp * 1000).toISOString()}\nRe-run with --send to send.`);
} else if (mode === "send") {
  needToken();
  const body = buildBody();
  let proxyCa;
  if (process.env.TESLA_PROXY_CA_FILE) proxyCa = readFileSync(process.env.TESLA_PROXY_CA_FILE);
  else console.error("Note: TESLA_PROXY_CA_FILE not set; the proxy's self-signed cert will be rejected unless it is trusted another way.");
  try {
    show(await request(`${PROXY}/api/1/vehicles/fleet_telemetry_config`, { method: "POST", body: JSON.stringify(body), ca: proxyCa }));
  } catch (e) {
    die(`Request to the proxy failed: ${e.message}. Is tesla-http-proxy running at ${PROXY}?`);
  }
} else {
  needToken();
  needVin();
  const path = mode === "status" ? "fleet_telemetry_config" : "fleet_telemetry_errors";
  try {
    show(await request(`${FLEET_BASE}/api/1/vehicles/${encodeURIComponent(vin)}/${path}`));
  } catch (e) {
    die(`Request failed: ${e.message}`);
  }
}
