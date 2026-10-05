"""Place the level buttons on every chapter map, evenly spaced, and write them into src/theme/mapPaths.ts (`spots`).

    pip install pillow numpy scipy
    python scripts/map-spots.py assets/content/P6/curriculum.json

Works from the map backgrounds already in assets/ui (map-bg-N.webp, cut by map-scenes.py), so the artist's pack is not
needed. Only the `spots` of each map are rewritten; `path` stays as map-scenes.py made it.

Rules:
- Every button sits in open water: the river is found by colour (cyan), thin white wave lines are filled in, and a
  button needs CLEAR px of water around its centre. Buttons stay off the left/right 8% so names fit beside them.
- Consecutive buttons are exactly STEP apart (straight-line distance, which is what the dotted trail draws), and the
  Level 1 → 2 and Level 2 → 3 jumps are exactly GROUP_GAP × STEP. The trail between two buttons stays on water wherever the art allows (where the river
  runs behind an object, as on the space-port maps, it may cross under half of one jump).
- Bottom first, always moving up the map; the chain spans the whole map, so STEP is the smallest that reaches the top
  (each map's height was cut to fit its buttons, so steps come out similar on every map).
"""
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
TS = os.path.join(HERE, "..", "src", "theme", "mapPaths.ts")
BG = os.path.join(HERE, "..", "assets", "ui", "map-bg-{}.webp")
D = 4  # analysis downsample
GROUP_GAP = 2  # level-group jump = 2 steps (one empty slot)
TOP, BOTTOM = 110, 90  # px kept free above the top button and below the bottom one
CLEAR = (74, 60, 48, 40)  # px of water around a button centre (48pt button ≈ 133px wide on a 390pt phone), loosest last
TRAIL = 18  # px of water around every point of the dotted trail
ANGLES = np.radians(np.arange(-80, 81, 5))  # direction of the next button, from straight up
BEAM = 1500
MARGIN_X = 0.08


def water(o):
    hsv = np.asarray(Image.open(BG.format(o)).convert("HSV")).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    w = (h >= 118) & (h <= 142) & (s >= 85) & (v >= 190)
    w = ndi.binary_closing(w, structure=np.ones((3, 3)), iterations=8)  # fill thin white wave lines
    w = ndi.binary_opening(w, structure=np.ones((3, 3)), iterations=2)
    return w


def units(i, per):  # trail length from the first button to button i, in steps
    return i + (GROUP_GAP - 1) * (i // per)


def place(clr, W, H, n, per, step, need):
    def c(x, y):
        xi, yi = int(x / D), int(y / D)
        if xi < 0 or yi < 0 or yi >= clr.shape[0] or xi >= clr.shape[1]:
            return -1.0
        return float(clr[yi, xi])

    def ok(x, y):
        return MARGIN_X * W <= x <= (1 - MARGIN_X) * W and TOP - 20 <= y <= H - BOTTOM and c(x, y) >= need

    def trail_off(a, b):  # share of the trail between two buttons that is not over water
        k = max(2, int(math.dist(a, b) / 10))
        return sum(c(a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k) < TRAIL for t in range(1, k)) / (k - 1)

    # start: open water near the bottom; then every button keeps close to its even share of the climb to the top
    U = units(n - 1, per)
    starts = []
    for y in range(H - BOTTOM, H - BOTTOM - 240, -D * 2):
        for x in range(int(MARGIN_X * W), int((1 - MARGIN_X) * W), D * 2):
            if ok(x, y):
                starts.append((min(c(x, y), 200) - 2 * (H - BOTTOM - y), [(x, y)]))
    beam = sorted(starts, key=lambda t: -t[0])[:BEAM]
    for i in range(1, n):
        target = lambda y0: y0 - (y0 - TOP) * units(i, per) / U
        d = step * (GROUP_GAP if i % per == 0 else 1)
        nxt, seen = [], set()
        for score, chain in beam:
            x0, y0 = chain[-1]
            for a in ANGLES:
                x, y = x0 + d * math.sin(a), y0 - d * math.cos(a)
                if not ok(x, y):
                    continue
                off = trail_off((x0, y0), (x, y))
                if off > 0.5:
                    continue
                if any(math.dist((x, y), p) < 0.95 * step for p in chain[:-1]):
                    continue
                key = (int(x / 24), int(y / 24))
                if key in seen:
                    continue
                seen.add(key)
                nxt.append((score + min(c(x, y), 200) - 1.5 * abs(y - target(chain[0][1])) - 2000 * off, chain + [(x, y)]))
        if not nxt:
            return None
        beam = sorted(nxt, key=lambda t: -t[0])[:BEAM]
    return beam[0][1]


def main(curriculum):
    counts = {t["order"]: len(t["subtopics"]) for t in json.load(open(curriculum))["topics"]}
    src = open(TS).read()
    for o in range(1, 13):
        n = 3 * counts[o]
        w = water(o)
        H, W = w.shape
        clr = ndi.distance_transform_edt(w[::D, ::D]) * D
        lo = int((H - BOTTOM - TOP) / units(n - 1, counts[o]))  # the step if every button were straight above the last
        # the most water around the buttons, then the smallest step whose chain reaches the top; if none does, the chain
        # that climbs highest
        best = None
        for need in CLEAR:
            for step in range(lo, int(lo * 1.6), 8):
                chain = place(clr, W, H, n, counts[o], step, need)
                if chain and (best is None or chain[-1][1] < best[2][-1][1] - 40):
                    best = (need, step, chain)
                if chain and chain[-1][1] <= TOP + 0.6 * step:
                    break
            if best and best[2][-1][1] <= TOP + 0.6 * best[1]:
                break
        if not best:
            sys.exit(f"map {o}: no even layout found")
        need, step, chain = best
        print(f"map {o}: {n} buttons, step {step}px (≈{step / W * 390:.0f}pt at 390pt), clearance ≥ {need}px, top button at y={chain[-1][1]:.0f}px")
        sp = ", ".join(f"[{round(x / W, 4)}, {round(y / H, 4)}]" for x, y in chain)
        src, k = re.subn(rf"(// map {o}\n(?:.*\n){{2}}\s*spots: )\[.*?\]\],", lambda m: m.group(1) + f"[{sp}],", src)
        if k != 1:
            sys.exit(f"map {o}: spots line not found")
    open(TS, "w").write(src)
    print("wrote", TS)


if __name__ == "__main__":
    main(sys.argv[1])
