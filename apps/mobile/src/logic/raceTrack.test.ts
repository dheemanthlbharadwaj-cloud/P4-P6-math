import { describe, expect, it } from "vitest";
import { layoutTrack } from "./raceTrack";

const W = 390, CAT = 56;

describe("race track", () => {
  it("puts the most stars on the right and keeps distances proportional to stars", () => {
    const { placed } = layoutTrack([{ uid: "a", stars: 10 }, { uid: "b", stars: 40 }, { uid: "c", stars: 20 }, { uid: "d", stars: 0 }, { uid: "e", stars: 30 }], W, CAT);
    expect(placed.map((p) => p.uid)).toEqual(["d", "a", "c", "e", "b"]);
    const x = Object.fromEntries(placed.map((p) => [p.uid, p.x]));
    expect(x.b - x.e).toBeCloseTo(x.e - x.c); // 10 stars apart each
    expect(x.c - x.d).toBeCloseTo(2 * (x.a - x.d)); // 20 vs 10 stars
  });

  it("fits 5 cats on one screen and scrolls when there are more", () => {
    expect(layoutTrack(Array.from({ length: 5 }, (_, i) => ({ uid: `${i}`, stars: i * 10 })), W, CAT).width).toBeCloseTo(W);
    expect(layoutTrack(Array.from({ length: 9 }, (_, i) => ({ uid: `${i}`, stars: i * 10 })), W, CAT).width).toBeGreaterThan(1.7 * W);
  });

  it("stacks tied cats in lanes instead of on top of each other", () => {
    const { placed, lanes } = layoutTrack([{ uid: "a", stars: 21 }, { uid: "b", stars: 21 }, { uid: "c", stars: 60 }], W, CAT);
    const [a, b] = placed.filter((p) => p.stars === 21);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.lane).not.toBe(b.lane);
    expect(lanes).toBe(2);
  });

  it("handles one racer and everyone equal", () => {
    expect(layoutTrack([{ uid: "me", stars: 3 }], W, CAT).placed[0].x).toBeCloseTo(W / 2);
    const { placed } = layoutTrack([{ uid: "a", stars: 5 }, { uid: "b", stars: 5 }], W, CAT);
    expect(placed[0].x).toBeCloseTo(placed[1].x);
  });
});
