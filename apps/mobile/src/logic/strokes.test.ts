import { describe, expect, it } from "vitest";
import { eraseAt, strokePath, strokeTouched, type Stroke } from "./strokes";

const line: Stroke = { id: 1, color: "#000", width: 4, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
const dot: Stroke = { id: 2, color: "#000", width: 4, points: [{ x: 50, y: 50 }] };

describe("strokes", () => {
  it("hit-tests segments and dots", () => {
    expect(strokeTouched(line, { x: 50, y: 10 }, 12)).toBe(true);
    expect(strokeTouched(line, { x: 50, y: 30 }, 12)).toBe(false);
    expect(strokeTouched(line, { x: 130, y: 0 }, 12)).toBe(false);
    expect(strokeTouched(dot, { x: 55, y: 50 }, 4)).toBe(true);
  });
  it("erases only touched strokes and keeps identity when nothing is hit", () => {
    const all = [line, dot];
    expect(eraseAt(all, { x: 50, y: 0 }, 5).map((s) => s.id)).toEqual([2]);
    expect(eraseAt(all, { x: 300, y: 300 }, 5)).toBe(all);
  });
  it("builds paths", () => {
    expect(strokePath([])).toBe("");
    expect(strokePath(dot.points)).toMatch(/^M50 50 L/);
    expect(strokePath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }])).toContain("Q");
  });
});
