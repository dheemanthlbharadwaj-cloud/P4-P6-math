import { describe, expect, it } from "vitest";
import { current, grant, localDay, newMeter, spend } from "./daily";

const day = (d: number, h = 9) => new Date(2026, 9, d, h, 0, 0).getTime(); // local time, Oct 2026

describe("daily allowance", () => {
  it("spends during the day and refills at local midnight", () => {
    let m = newMeter(10, day(4));
    m = spend(m, 3, day(4, 10), 10)!;
    expect(current(m, day(4, 23), 10).value).toBe(7);
    expect(current(m, new Date(2026, 9, 4, 23, 59, 59).getTime(), 10).value).toBe(7);
    expect(current(m, new Date(2026, 9, 5, 0, 0, 1).getTime(), 10).value).toBe(10);
  });
  it("cannot go below zero; ads add back up to the max", () => {
    let m = { value: 1, updatedAt: day(4) };
    expect(spend(m, 2, day(4, 11), 10)).toBeNull();
    m = grant(m, 3, day(4, 11), 10);
    expect(m.value).toBe(4);
    expect(grant({ value: 9, updatedAt: day(4) }, 3, day(4, 12), 10).value).toBe(10);
  });
  it("a clock moved backwards does not refill", () => {
    const m = { value: 2, updatedAt: day(5) };
    expect(current(m, day(4), 10).value).toBe(2);
  });
  it("formats the local day", () => {
    expect(localDay(day(4))).toBe("2026-10-04");
  });
});
