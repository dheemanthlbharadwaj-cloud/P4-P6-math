import { describe, expect, it } from "vitest";
import { defaultPsleDate } from "./psle";

describe("defaultPsleDate", () => {
  it("uses this year's date before PSLE", () => {
    expect(defaultPsleDate(new Date(2026, 5, 15))).toBe("2026-10-01");
    expect(defaultPsleDate(new Date(2026, 8, 30))).toBe("2026-10-01");
  });
  it("rolls to next year once PSLE has started", () => {
    expect(defaultPsleDate(new Date(2026, 9, 1))).toBe("2027-10-01");
    expect(defaultPsleDate(new Date(2026, 9, 10))).toBe("2027-10-01");
    expect(defaultPsleDate(new Date(2026, 11, 31))).toBe("2027-10-01");
  });
});
