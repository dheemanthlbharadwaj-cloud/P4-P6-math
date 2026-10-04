import { describe, expect, it } from "vitest";
import { TIMER_MS, timerProgress, wedgePath } from "./timer";

describe("board timer", () => {
  it("runs exactly 5 minutes and then stays full", () => {
    expect(TIMER_MS).toBe(300_000);
    expect(timerProgress(0, 0)).toBe(0);
    expect(timerProgress(0, 150_000)).toBe(0.5);
    expect(timerProgress(0, 299_999)).toBeLessThan(1);
    expect(timerProgress(0, 300_000)).toBe(1);
    expect(timerProgress(0, 900_000)).toBe(1); // no looping
  });
  it("draws a wedge from 12 o'clock clockwise", () => {
    expect(wedgePath(10, 10, 10, 0)).toBe("");
    expect(wedgePath(10, 10, 10, 0.25)).toBe("M 10 10 L 10 0 A 10 10 0 0 1 20.00 10.00 Z");
    expect(wedgePath(10, 10, 10, 0.75)).toContain(" 0 1 1 ");
  });
});
