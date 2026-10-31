// The Fleet Telemetry streaming config Uplink sends each car: which fields, and how often. One source for
// scripts/telemetry-config.mjs (sent by hand through the vehicle-command proxy) and the app
// (lib/server/setup.ts, signed and sent itself), so both always send the same thing.

export const TELEMETRY_HOSTNAME = "telemetry.getuplink.in";
// The receiver: Fly maps 443 to its 8443 (fly/telemetry/README.md).
export const TELEMETRY_PORT = 443;
// Tesla rejects an exp past ~364 days ahead, so stay under a year.
export const TELEMETRY_EXP_DAYS = 360;

// Every field in protos/vehicle_data.proto (teslamotors/fleet-telemetry) that a car can send: the owner
// asked Uplink to keep all of it, location included. Left out: Semitruck*, Experimental_* and
// Deprecated_* (not this car, or not real fields), and every Media* field: what was playing, from which
// source, and the volume. Uplink shows none of it, so it isn't collected (fly/telemetry/worker.ts drops
// any that still arrive). A field the car doesn't have is never sent.
export const ALL_FIELDS = [
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
  "LightsHighBeams", "SunroofInstalled", "SeatVentEnabled", "RearDefrostEnabled", "ChargeRateMilePerHour", "MilesSinceReset",
  "SelfDrivingMilesSinceReset", "GpsAccuracyMeters", "LifetimeEnergyChargedKwh", "BrickSocMinPercent",
  "NominalFullPackEnergyKwh", "GradeEstimatePercent", "MaxSpeedToReachDestinationMph",
  "SoftwareUpdateAvailable", "SoftwareUpdateInProgress", "RemoteStartActive", "Cabin12vPortKeepOn",
  "Cabin48vPortKeepOn"
];

/** @returns {Record<string, { interval_seconds: number; minimum_delta?: number }>} */
export function telemetryFields() {
  /** @type {Record<string, { interval_seconds: number; minimum_delta?: number }>} */
  const fields = {};
  /** @param {string[]} names @param {number} interval_seconds @param {{ minimum_delta?: number }} [extra] */
  const set = (names, interval_seconds, extra = {}) => {
    for (const n of names) fields[n] = { interval_seconds, ...extra };
  };
  // Everything else: sent when it changes, at most once a minute (states, settings, navigation).
  set(ALL_FIELDS, 60);
  // Where the car is, every 10 s while it moves, for trip routes and stops.
  set(["Location", "GpsHeading", "GpsAccuracyMeters"], 10);
  // Driving dynamics: drive units, pack current and voltage. Every 30 s.
  set(ALL_FIELDS.filter((n) => /^Di(Torque|AxleSpeed|MotorCurrent|VBat|SlaveTorque)|^Pack(Current|Voltage)$|^GradeEstimate/.test(n)), 30);
  // Speed, acceleration and pedals every second while driving, for each drive's speed and acceleration
  // graphs. Nothing changes while parked, so this costs nothing then.
  set(["VehicleSpeed"], 1, { minimum_delta: 1 });
  set(["LongitudinalAcceleration", "LateralAcceleration"], 1);
  set(["PedalPosition", "BrakePedal", "BrakePedalPos"], 1);
  // Pack voltage and current for each drive's power graph, and the road grade, every second while driving.
  set(["PackVoltage", "PackCurrent", "GradeEstimatePercent"], 1);
  // Temperatures, every 5 min and only when they move by a degree.
  set(ALL_FIELDS.filter((n) => /Temp|Heatsink|^DiInverter/.test(n) && !/Request|Limit|Unit/.test(n)), 300, { minimum_delta: 1 });
  // Battery and range, every 5 min.
  set(["Soc", "EstBatteryRange", "IdealBatteryRange", "EnergyRemaining"], 300);
  // The level and range on Home and the Car page, every minute: at 60 kW the level climbs a point every 40 s,
  // so at 5 min Home read 34% while the car said 38% (31 Oct 2026). Only when they move by a tenth (of a
  // point, of a mile): parked, the level moves about 0.03 a minute at most, so a parked car adds few readings.
  // A whole point would leave a charge's end level and a short drive's use up to 1 point out.
  set(["BatteryLevel", "RatedRange"], 60, { minimum_delta: 0.1 });
  // Drive starts and ends: the gear as soon as it changes, the odometer every 30 s. At 5 minutes, a drive's
  // first minutes and short moves between stops went unseen.
  set(["Gear"], 1);
  set(["Odometer"], 30);
  set(["LifetimeEnergyUsed", "LifetimeEnergyGainedRegen", "LifetimeEnergyUsedDrive", "LifetimeEnergyChargedKwh", "NominalFullPackEnergyKwh"], 300);
  // Tesla: SelfDrivingMilesSinceReset needs minimum_delta explicitly set to >= 1 (HW4, fw 2025.44.25.5+).
  set(["SelfDrivingMilesSinceReset", "MilesSinceReset"], 3600, { minimum_delta: 1 });
  // Brick voltages move constantly by tiny amounts: every 5 min.
  set(ALL_FIELDS.filter((n) => /Brick/.test(n)), 300);
  return fields;
}
