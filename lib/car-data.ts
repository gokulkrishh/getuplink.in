import { ALL_FIELDS } from "@/lib/telemetry-fields.mjs";
import { keepDays } from "@/lib/telemetry-retention";

// What the car sends Uplink, in owner words, for the Privacy page's car data page (app/privacy/car-data).
// Every field Uplink asks the car for (ALL_FIELDS) sits in exactly one group, and how long each is kept comes
// from the retention rules, so the page can't drift from what is collected (test/car-data.test.ts).

export type CarDataGroup = { title: string; what: string; fields: string[] };

export const CAR_DATA_GROUPS: CarDataGroup[] = [
  {
    title: "Battery",
    what: "Battery level, range, energy left, pack voltage and current, cell voltages and temperatures, and the battery heater.",
    fields: [
      "Soc", "BatteryLevel", "EnergyRemaining", "RatedRange", "EstBatteryRange", "IdealBatteryRange", "PackVoltage",
      "PackCurrent", "NumBrickVoltageMax", "BrickVoltageMax", "NumBrickVoltageMin", "BrickVoltageMin", "BrickSocMinPercent",
      "NumModuleTempMax", "ModuleTempMax", "NumModuleTempMin", "ModuleTempMin", "NominalFullPackEnergyKwh", "BMSState",
      "BmsFullchargecomplete", "IsolationResistance", "Hvil", "DCDCEnable", "BatteryHeaterOn", "NotEnoughPowerToHeat",
    ],
  },
  {
    title: "Charging",
    what: "Whether the car is charging, AC or DC, power and energy added, charge limit, scheduled charging, the charge port and cable, and power sharing.",
    fields: [
      "ChargeState", "DetailedChargeState", "DCChargingEnergyIn", "DCChargingPower", "ACChargingEnergyIn", "ACChargingPower",
      "ChargeLimitSoc", "FastChargerPresent", "FastChargerType", "TimeToFullCharge", "EstimatedHoursToChargeTermination",
      "ScheduledChargingStartTime", "ScheduledChargingPending", "ScheduledChargingMode", "ScheduledDepartureTime",
      "PreconditioningEnabled", "ChargeAmps", "ChargeEnableRequest", "ChargerPhases", "ChargerVoltage",
      "ChargeCurrentRequest", "ChargeCurrentRequestMax", "ChargeRateMilePerHour", "ChargePortColdWeatherMode",
      "SuperchargerSessionTripPlanner", "ChargePort", "ChargePortLatch", "ChargePortDoorOpen", "ChargingCableType",
      "LifetimeEnergyChargedKwh", "PowershareHoursLeft", "PowershareInstantaneousPowerKW", "PowershareStatus",
      "PowershareStopReason", "PowershareType",
    ],
  },
  {
    title: "Driving",
    what: "Speed, gear, odometer, pedals, acceleration, road slope, cruise control, and the car's energy counters.",
    fields: [
      "VehicleSpeed", "Gear", "Odometer", "PedalPosition", "BrakePedal", "BrakePedalPos", "LateralAcceleration",
      "LongitudinalAcceleration", "GradeEstimatePercent", "CruiseSetSpeed", "CruiseFollowDistance", "DriveRail",
      "LifetimeEnergyUsed", "LifetimeEnergyUsedDrive", "LifetimeEnergyGainedRegen", "MilesSinceReset",
      "SelfDrivingMilesSinceReset",
    ],
  },
  {
    title: "Location and navigation",
    what: "Where the car is and which way it faces, whether it's at home, work or a favourite, and the route, destination and arrival time when you navigate.",
    fields: [
      "Location", "GpsState", "GpsHeading", "GpsAccuracyMeters", "LocatedAtHome", "LocatedAtWork", "LocatedAtFavorite",
      "HomelinkNearby", "HomelinkDeviceCount", "RouteLastUpdated", "RouteLine", "OriginLocation", "DestinationLocation",
      "DestinationName", "MilesToArrival", "MinutesToArrival", "RouteTrafficMinutesDelay",
      "ExpectedEnergyPercentAtTripArrival", "MaxSpeedToReachDestinationMph",
    ],
  },
  {
    title: "Motors",
    what: "Each motor's state, power, speed, current and temperatures.",
    fields: [
      "DiStateR", "DiStateF", "DiStateREL", "DiStateRER", "DiHeatsinkTR", "DiHeatsinkTF", "DiHeatsinkTREL", "DiHeatsinkTRER",
      "DiAxleSpeedR", "DiAxleSpeedF", "DiAxleSpeedREL", "DiAxleSpeedRER", "DiTorquemotor", "DiSlaveTorqueCmd",
      "DiTorqueActualR", "DiTorqueActualF", "DiTorqueActualREL", "DiTorqueActualRER", "DiStatorTempR", "DiStatorTempF",
      "DiStatorTempREL", "DiStatorTempRER", "DiVBatR", "DiVBatF", "DiVBatREL", "DiVBatRER", "DiMotorCurrentR",
      "DiMotorCurrentF", "DiMotorCurrentREL", "DiMotorCurrentRER", "DiInverterTR", "DiInverterTF", "DiInverterTREL",
      "DiInverterTRER",
    ],
  },
  {
    title: "Climate and cabin",
    what: "Inside and outside temperature, AC and fan settings, seat heating and cooling, defrost, Climate Keeper, Cabin Overheat Protection, and whether seats are taken and belts on.",
    fields: [
      "InsideTemp", "OutsideTemp", "HvacACEnabled", "HvacAutoMode", "HvacFanSpeed", "HvacFanStatus", "HvacPower",
      "HvacLeftTemperatureRequest", "HvacRightTemperatureRequest", "HvacSteeringWheelHeatAuto", "HvacSteeringWheelHeatLevel",
      "SeatHeaterLeft", "SeatHeaterRight", "SeatHeaterRearLeft", "SeatHeaterRearRight", "SeatHeaterRearCenter",
      "RearSeatHeaters", "AutoSeatClimateLeft", "AutoSeatClimateRight", "ClimateSeatCoolingFrontLeft",
      "ClimateSeatCoolingFrontRight", "SeatVentEnabled", "ClimateKeeperMode", "CabinOverheatProtectionMode",
      "CabinOverheatProtectionTemperatureLimit", "DefrostForPreconditioning", "DefrostMode", "RearDefrostEnabled",
      "WiperHeatEnabled", "RearDisplayHvacEnabled", "DriverSeatBelt", "PassengerSeatBelt", "DriverSeatOccupied",
      "Cabin12vPortKeepOn", "Cabin48vPortKeepOn",
    ],
  },
  {
    title: "Tyres",
    what: "Each tyre's pressure, when it was last measured, and tyre warnings.",
    fields: [
      "TpmsPressureFl", "TpmsPressureFr", "TpmsPressureRl", "TpmsPressureRr", "TpmsLastSeenPressureTimeFl",
      "TpmsLastSeenPressureTimeFr", "TpmsLastSeenPressureTimeRl", "TpmsLastSeenPressureTimeRr", "TpmsHardWarnings",
      "TpmsSoftWarnings",
    ],
  },
  {
    title: "Doors, locks and lights",
    what: "Doors, windows and locks, Sentry Mode, Guest, Valet and Service Mode, PIN to Drive, how many keys are paired, the lights and the screen.",
    fields: [
      "DoorState", "Locked", "FdWindow", "FpWindow", "RdWindow", "RpWindow", "SentryMode", "GuestModeEnabled",
      "GuestModeMobileAccessState", "ValetModeEnabled", "ServiceMode", "PinToDriveEnabled", "PairedPhoneKeyAndKeyFobQty",
      "RemoteStartEnabled", "RemoteStartActive", "LightsHazardsActive", "LightsTurnSignal", "LightsHighBeams",
      "CenterDisplay", "TonneauOpenPercent", "TonneauPosition", "TonneauTentMode",
    ],
  },
  {
    title: "Safety settings",
    what: "Whether collision warnings, lane departure avoidance, emergency braking, the blind spot camera and Speed Limit Mode are on.",
    fields: [
      "ForwardCollisionWarning", "AutomaticEmergencyBrakingOff", "LaneDepartureAvoidance", "EmergencyLaneDepartureAvoidance",
      "BlindSpotCollisionWarningChime", "AutomaticBlindSpotCamera", "SpeedLimitWarning", "SpeedLimitMode", "CurrentLimitMph",
    ],
  },
  {
    title: "Car and software",
    what: "The car's name, model, trim, colours and wheels, its display units, its software version and any update downloading or installing.",
    fields: [
      "VehicleName", "CarType", "Trim", "ExteriorColor", "RoofColor", "WheelType", "EfficiencyPackage", "EuropeVehicle",
      "RightHandDrive", "OffroadLightbarPresent", "SunroofInstalled", "SettingDistanceUnit", "SettingTemperatureUnit",
      "Setting24HourTime", "SettingTirePressureUnit", "SettingChargeUnit", "Version", "SoftwareUpdateVersion",
      "SoftwareUpdateAvailable", "SoftwareUpdateInProgress", "SoftwareUpdateDownloadPercentComplete",
      "SoftwareUpdateInstallationPercentComplete", "SoftwareUpdateExpectedDurationMinutes",
      "SoftwareUpdateScheduledStartTime",
    ],
  },
];

// Fields Uplink asks for but this page doesn't list: none. Kept as a check for the test.
export const UNGROUPED = ALL_FIELDS.filter((f) => !CAR_DATA_GROUPS.some((g) => g.fields.includes(f)));

export type Keep = { days: number[]; forever: boolean };

// How long a group's figures are kept: the day counts of the ones that expire, and whether any are kept
// for good.
export function groupKeep(group: CarDataGroup): Keep {
  const keeps = group.fields.map(keepDays);
  return { days: keeps.filter((d): d is number => d !== null), forever: keeps.includes(null) };
}

// "7 days", "7 to 120 days", "for good", "7 to 120 days, some for good".
export function keepWords({ days, forever }: Keep): string {
  if (days.length === 0) return "for good";
  const min = Math.min(...days);
  const max = Math.max(...days);
  const span = min === max ? `${min} days` : `${min} to ${max} days`;
  return forever ? `${span}, some for good` : span;
}
