import { describe, expect, it } from "vitest";
import { mapPaths } from "../theme/mapPaths";
import { nodeRect, overlap, placeCat } from "./mapLayout";

// Height / width of each map image (uiAssets.maps in theme/assets.ts, which needs the bundler to load).
const ASPECT = [2.218, 2.411, 2.893, 2.411, 3.375, 2.893, 3.375, 4.821, 2.893, 4.387, 4.387, 2.549];
const NODE = 48; // TopicMapPage button size
const WIDTHS = [320, 360, 390, 430, 768];

describe("map buttons", () => {
  it("are evenly spaced, with a double step only between the level groups", () => {
    mapPaths.forEach((m, i) => {
      const s = m.spots!;
      const per = s.length / 3;
      const d = s.slice(1).map(([x, y], k) => Math.hypot(x - s[k][0], (y - s[k][1]) * ASPECT[i]));
      const step = d[0];
      d.forEach((v, k) => expect(v / step, `map ${i + 1} gap ${k + 1}→${k + 2}`).toBeCloseTo((k + 1) % per === 0 ? 2 : 1, 1));
    });
  });

  it("the student's cat never covers a button, wherever it stands", () => {
    mapPaths.forEach((m, i) => {
      for (const width of WIDTHS) {
        const height = width * ASPECT[i];
        const pos = m.spots!.map(([x, y]) => ({ x: x * width, y: y * height - NODE / 2 }));
        pos.forEach((_, idx) => {
          const { covers } = placeCat(pos, idx, NODE, width);
          const hit = pos.findIndex((p) => overlap(covers, nodeRect(p, NODE)) > 0);
          expect(hit, `map ${i + 1} at ${width}pt, cat on button ${idx + 1}`).toBe(-1);
          expect(covers.x).toBeGreaterThanOrEqual(0);
          expect(covers.x + covers.w).toBeLessThanOrEqual(width);
        });
      }
    });
  });
});
