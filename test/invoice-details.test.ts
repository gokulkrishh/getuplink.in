import { describe, expect, test } from "bun:test";
import { keptDetails, storedDetails } from "@/lib/invoice-details";

describe("invoice details", () => {
  test("keeps what the bill printed about the charge, trimmed, in order, once each", () => {
    expect(
      keptDetails([
        { label: " Paid by ", value: "App Wallet" },
        { label: "Station ID", value: "12438" },
        { label: "Charger ID", value: "IOCLTNDC2146" },
        { label: "GSTIN", value: "33AAACI1681G1ZW" },
        { label: "station id", value: "99999" },
      ]),
    ).toEqual([
      { label: "Paid by", value: "App Wallet" },
      { label: "Station ID", value: "12438" },
      { label: "Charger ID", value: "IOCLTNDC2146" },
      { label: "GSTIN", value: "33AAACI1681G1ZW" },
    ]);
  });

  test("drops anything about the owner", () => {
    const personal = [
      { label: "Customer name", value: "A Driver" },
      { label: "Mobile", value: "98450 00000" },
      { label: "Email", value: "someone@example.com" },
      { label: "Vehicle number", value: "KA01AB1234" },
      { label: "Card", value: "XXXX1234" },
      { label: "Contact", value: "9845000000" },
      { label: "Ref", value: "pay@upi" },
    ];
    expect(keptDetails(personal)).toEqual([]);
  });

  test("reads back only well-formed pairs", () => {
    expect(storedDetails(null)).toEqual([]);
    expect(storedDetails([{ label: "Paid by", value: "App Wallet" }, { label: 3 }, "x"])).toEqual([{ label: "Paid by", value: "App Wallet" }]);
  });
});
