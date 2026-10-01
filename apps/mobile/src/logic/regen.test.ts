import { describe, expect, it } from "vitest";
import { MAX_HEARTS, HEART_RECOVERY_MINUTES } from "@p6/shared";
import { formatCountdown, grant, newMeter, regen, spend } from "./regen";

const P = HEART_RECOVERY_MINUTES * 60_000;
const T0 = 1_000_000;

describe("regen", () => {
  it("full meter never has a timer", () => {
    const v = regen(newMeter(MAX_HEARTS, T0), T0 + 10 * P, MAX_HEARTS, P);
    expect(v.meter.value).toBe(MAX_HEARTS);
    expect(v.nextInMs).toBeNull();
  });
  it("spending from full starts the clock and regens +1 per period", () => {
    const m = spend(newMeter(5, T0), 2, T0, 5, P)!;
    expect(m.value).toBe(3);
    expect(regen(m, T0 + P - 1, 5, P).meter.value).toBe(3);
    const v = regen(m, T0 + P + 1000, 5, P);
    expect(v.meter.value).toBe(4);
    expect(v.nextInMs).toBe(P - 1000);
    expect(regen(m, T0 + 10 * P, 5, P).meter.value).toBe(5);
  });
  it("keeps the partial progress when spending again while not full", () => {
    const a = spend(newMeter(5, T0), 1, T0, 5, P)!;
    const b = spend(a, 1, T0 + P / 2, 5, P)!;
    expect(b.value).toBe(3);
    expect(regen(b, T0 + P, 5, P).meter.value).toBe(4); // clock was not reset
  });
  it("refuses to overspend", () => {
    expect(spend({ value: 0, updatedAt: T0 }, 1, T0, 5, P)).toBeNull();
  });
  it("grant clamps to max and handles backwards clocks", () => {
    expect(grant({ value: 4, updatedAt: T0 }, 3, T0, 5, P).value).toBe(5);
    expect(regen({ value: 2, updatedAt: T0 }, T0 - 5 * P, 5, P).meter.value).toBe(2);
  });
  it("formats the countdown", () => {
    expect(formatCountdown(125_000)).toBe("2:05");
    expect(formatCountdown(null)).toBe("");
  });
});
