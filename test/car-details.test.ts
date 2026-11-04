import { describe, expect, test } from "bun:test";
import { batteryChemistry, carPicture, colorName, likelyLfp, modelName, motorLayout, packLabel, trimLabel, tyrePressureLabel, unknownCodes, wheelsLabel } from "@/lib/car";

describe("trimLabel", () => {
  test("maps the known pack badges", () => {
    expect(trimLabel("50")).toBe("Standard Range");
    expect(trimLabel("74")).toBe("Long Range");
    expect(trimLabel("74D")).toBe("Long Range");
  });
  test("unknown or missing codes show nothing", () => {
    expect(trimLabel("100d")).toBeNull();
    expect(trimLabel(undefined)).toBeNull();
  });
});

describe("likelyLfp", () => {
  test("Shanghai-built and charging to max by default", () => {
    expect(likelyLfp("LRWYGCEK3TC100001", true)).toBe(true);
  });
  test("not from Shanghai, or not defaulting to max", () => {
    expect(likelyLfp("7SAYGDEE1TF100001", true)).toBe(false);
    expect(likelyLfp("LRWYGCEK3TC100001", false)).toBe(false);
    expect(likelyLfp("LRWYGCEK3TC100001", undefined)).toBe(false);
    expect(likelyLfp(null, true)).toBe(false);
  });
});

describe("batteryChemistry", () => {
  test("Shanghai-built: LFP when it charges to 100% by default, NMC when it doesn't", () => {
    expect(batteryChemistry("LRWYGCEK3TC100001", true)).toBe("LFP");
    // A Model Y L reports default_charge_to_max false.
    expect(batteryChemistry("LRWYGCEK3TC100001", false)).toBe("NMC");
  });
  test("unknown without the setting, or for cars from other factories", () => {
    expect(batteryChemistry("LRWYGCEK3TC100001", undefined)).toBeNull();
    expect(batteryChemistry("7SAYGDEE1TF100001", false)).toBeNull();
    expect(batteryChemistry(null, true)).toBeNull();
  });
});

describe("packLabel", () => {
  test("the pack's name, except on the Model Y L, which Tesla doesn't sell by pack", () => {
    expect(packLabel("74d", "Model Y")).toBe("Long Range");
    expect(packLabel("50", "Model Y")).toBe("Standard Range");
    expect(packLabel("74d", "Model Y L")).toBeNull();
  });
});

describe("motorLayout", () => {
  test("rear only, both, neither", () => {
    expect(motorLayout("PM216MOSFET", undefined)).toBe("Single rear motor");
    expect(motorLayout("PM216MOSFET", "IM130D")).toBe("Dual motor");
    expect(motorLayout(undefined, undefined)).toBeNull();
  });
  test("a dual-motor badge is two motors even when Tesla names only the rear unit", () => {
    // A Model Y L Long Range all-wheel drive reports rear_drive_unit alone, with trim_badging "74d".
    expect(motorLayout("PM216MOSFET", undefined, "74d")).toBe("Dual motor");
    expect(motorLayout("PM216MOSFET", undefined, "50")).toBe("Single rear motor");
  });
});

const NEW_VIN = "LRWYGCEK3TC100001"; // model year 2026
const OLD_VIN = "5YJYGDEE1RF100001"; // model year 2024

describe("modelName", () => {
  test("Tesla's car_type as a name", () => {
    expect(modelName("modely")).toBe("Model Y");
    expect(modelName("model3")).toBe("Model 3");
    expect(modelName("roadster")).toBeNull();
  });
  test("a 2025 or later Model Y with a third row is the six-seat Model Y L", () => {
    expect(modelName("modely", { thirdRowSeats: "FlatFold", vin: NEW_VIN })).toBe("Model Y L");
  });
  test("no third row, or the older seven-seat Model Y, stays Model Y", () => {
    expect(modelName("modely", { thirdRowSeats: "None", vin: NEW_VIN })).toBe("Model Y");
    expect(modelName("modely", { thirdRowSeats: "FlatFold", vin: OLD_VIN })).toBe("Model Y");
    expect(modelName("modely", { thirdRowSeats: "FlatFold", vin: null })).toBe("Model Y");
    // A placeholder Tesla sends instead of a seat layout isn't a third row.
    expect(modelName("modely", { thirdRowSeats: "<invalid>", vin: NEW_VIN })).toBe("Model Y");
  });
});

describe("colorName", () => {
  test("splits Tesla's paint codes", () => {
    expect(colorName("PearlWhite")).toBe("Pearl White");
    expect(colorName("DiamondBlack")).toBe("Diamond Black");
    expect(colorName(undefined)).toBeNull();
  });
  test("uses Tesla's own name where the code differs", () => {
    expect(colorName("SilkroadSilver")).toBe("Cosmic Silver");
  });
});

describe("wheelsLabel", () => {
  test("size first, then the name", () => {
    expect(wheelsLabel("Crossflow19")).toBe("19″ Crossflow");
    expect(wheelsLabel("MachinaV219")).toBe("19″ Machina");
  });
});

describe("tyrePressureLabel", () => {
  test("bar in, whole psi out, front and rear", () => {
    expect(tyrePressureLabel(2.9, 2.9)).toBe("42 psi front, 42 psi rear");
    expect(tyrePressureLabel(2.9, 3.1)).toBe("42 psi front, 45 psi rear");
  });
  test("missing values show nothing", () => {
    expect(tyrePressureLabel(null, 2.9)).toBeNull();
  });
});

describe("unknownCodes", () => {
  test("known model and pack codes pass", () => {
    expect(unknownCodes({ car_type: "modely", trim_badging: "74d" })).toEqual([]);
    expect(unknownCodes({ car_type: "Model3", trim_badging: "50" })).toEqual([]);
    expect(unknownCodes({})).toEqual([]);
  });
  test("a new variant is flagged even when its prefix still names a model", () => {
    expect(unknownCodes({ car_type: "modelyl", trim_badging: "82d" })).toEqual(['model "modelyl"', 'pack "82d"']);
  });
});

describe("carPicture", () => {
  test("the Model Y and Model Y L in each paint sold in India", () => {
    expect(carPicture("Model Y", "Diamond Black")).toBe("/cars/model-y-diamond-black.webp");
    expect(carPicture("Model Y", "Quicksilver")).toBe("/cars/model-y-quicksilver.webp");
    // The Model Y L's silver: Tesla's code SilkroadSilver, named as the Tesla app names it.
    expect(carPicture("Model Y L", colorName("SilkroadSilver"))).toBe("/cars/model-y-l-cosmic-silver.webp");
    expect(carPicture("Model Y L", "Ultra Red")).toBe("/cars/model-y-l-ultra-red.webp");
  });
  test("a paint code spelled another way still finds its picture", () => {
    expect(carPicture("Model Y", colorName("QuickSilver"))).toBe("/cars/model-y-quicksilver.webp");
    expect(carPicture("Model Y", colorName("Stealthgrey"))).toBe("/cars/model-y-stealth-grey.webp");
  });
  test("no picture rather than the wrong car or paint", () => {
    expect(carPicture("Model Y", "Cosmic Silver")).toBeNull();
    expect(carPicture("Model Y L", "Quicksilver")).toBeNull();
    expect(carPicture("Model 3", "Pearl White")).toBeNull();
    expect(carPicture("Model Y", null)).toBeNull();
    expect(carPicture(null, "Pearl White")).toBeNull();
  });
});
