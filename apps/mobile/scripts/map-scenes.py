"""Cut one map per chapter straight from the artist's full river map, and measure where the buttons go.

Writes assets/ui/map-bg-N.webp (N = 1..12) and src/theme/mapPaths.ts. The art is used exactly as drawn (the pack is
"Game Level Map for Water Games": every theme is a flooded island on a river), so no recolouring or extra paths.

    pip install pillow numpy scipy
    python scripts/map-scenes.py            # uses the pack committed at design/source-assets/map-pack/pack.zip
    python scripts/map-scenes.py /path/to/unzipped-pack assets/content/P6/curriculum.json
    python scripts/map-spots.py assets/content/P6/curriculum.json   # then: even button spots

With no arguments, the PNGs the script needs are unpacked once from pack.zip into map-pack/unzipped/ (git-ignored;
the 111 MB PSDs are skipped), and the located-obstacles cache (.obstacles.npy) is kept there too.

How it works:
1. Every island/object layer in the pack (assets/png/separated/*.png, 00_beginning, 13_end) is located in the full
   map (Game-Level-Map-for-Water-Games.png) by template matching; their alpha masks together = obstacles.
2. Per chapter, a portrait crop centred on that chapter's island (tall enough for its buttons) is saved as
   map-bg-N.webp; a distance transform gives clearance to the nearest obstacle;
   dynamic programming finds a smooth bottom→top route that maximises clearance.
3. Node spots: first guesses only; run scripts/map-spots.py afterwards, which re-places the buttons evenly spaced.
"""
import glob
import json
import math
import os
import sys
import zipfile

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "theme", "mapPaths.ts")
PACK_DIR = os.path.join(HERE, "..", "..", "..", "design", "source-assets", "map-pack")
CURRICULUM = os.path.join(HERE, "..", "assets", "content", "P6", "curriculum.json")

# Rows of each chapter's island in the full map (from the combined section PNGs). The crop is centred on them.
ISLAND_ROWS = {1: (13680, 15920), 2: (12496, 14896), 3: (11712, 13664), 4: (10080, 12688), 5: (9200, 11520),
               6: (7968, 10128), 7: (6864, 9280), 8: (5104, 8016), 9: (4336, 6960), 10: (2656, 5152),
               11: (1392, 4528), 12: (128, 2992)}
MIN_ASPECT = 1.8
ROW = 225  # map pixels between button rows (~63pt on a 390pt-wide phone)
GROUP_GAP = 2  # rows between level groups
JIT = 0.45  # a button may move this many rows up/down from its even row to stay in open water
BTN = 86  # button radius in map pixels (48pt button ≈ 172px wide at 1400px = 390pt)
CW = 1400  # crop width in map pixels (the full map is 2048 wide)
ISLAND_SIDE = {o: ("left" if o % 2 else "right") for o in range(1, 13)}
OUT_W = 1080
D = 8  # analysis downsample
DEBUG = os.environ.get("DEBUG") == "1"


def locate(full_small, full, layer, s=16):
    a = np.asarray(layer.resize((max(1, layer.width // s), max(1, layer.height // s))), dtype=np.float32)
    m, rgb = a[..., 3] > 200, a[..., :3]
    h, w = m.shape
    best = (1e18, 0, 0)
    for y in range(full_small.shape[0] - h + 1):
        for x in range(full_small.shape[1] - w + 1):
            d = ((full_small[y:y + h, x:x + w] - rgb) ** 2).sum(2)[m].mean()
            if d < best[0]:
                best = (d, y * s, x * s)
    A = np.asarray(layer, dtype=np.float32)
    ys, xs = np.nonzero(A[..., 3] > 200)
    pick = np.random.default_rng(0).choice(len(ys), min(4000, len(ys)), replace=False)
    ys, xs, col = ys[pick], xs[pick], A[ys[pick], xs[pick], :3]
    _, cy, cx = best
    best = (1e18, cy, cx)
    for dy in range(-s, s + 1):
        for dx in range(-s, s + 1):
            Y, X = ys + cy + dy, xs + cx + dx
            ok = (Y >= 0) & (Y < full.shape[0]) & (X >= 0) & (X < full.shape[1])
            if ok.mean() < 0.95:
                continue
            d = ((full[Y[ok], X[ok]] - col[ok]) ** 2).sum(1).mean()
            if d < best[0]:
                best = (d, cy + dy, cx + dx)
    return best[1], best[2]


def route(clr, cap=300.0, lam=6.0, k=6):
    R, C = clr.shape
    score = np.minimum(clr, cap)
    score = np.where(clr < 120, score - 5000, score)
    acc, back = score[R - 1].copy(), np.zeros((R, C), int)
    for r in range(R - 2, -1, -1):
        best, arg = np.full(C, -1e18), np.zeros(C, int)
        for dx in range(-k, k + 1):
            sh = np.roll(acc, dx)
            if dx > 0:
                sh[:dx] = -1e18
            elif dx < 0:
                sh[dx:] = -1e18
            v = sh - lam * abs(dx)
            upd = v > best
            best[upd], arg[upd] = v[upd], (np.arange(C) - dx)[upd]
        acc, back[r] = best + score[r], arg
    x = int(np.argmax(acc))
    path = [(x, 0)]
    for r in range(R - 1):
        x = int(back[r][x])
        path.append((x, r + 1))
    P = np.array([(px * D, py * D) for px, py in path], float)
    P[:, 0] = np.convolve(np.pad(P[:, 0], 4, mode="edge"), np.ones(9) / 9, mode="valid")
    return P


def greedy(L, cs, c, d, n):
    picks, last = [], -1e18
    for i in range(len(L) - 1, -1, -1):
        s = L[-1] - L[i]
        if cs[i] >= c and s - last >= d:
            picks.append(i)
            last = s
            if len(picks) == n:
                return picks
    return None


def main(pack, curriculum):
    full_img = Image.open(os.path.join(pack, "Game-Level-Map-for-Water-Games.png")).convert("RGB")
    full = np.asarray(full_img, dtype=np.float32)
    small = np.asarray(full_img.resize((full_img.width // 16, full_img.height // 16)), dtype=np.float32)
    H, W = full.shape[:2]
    layers = [os.path.join(pack, "assets/png/00_beginning.png"), os.path.join(pack, "assets/png/13_end.png")]
    layers += [f for f in sorted(glob.glob(os.path.join(pack, "assets/png/separated/*.png"))) if "stream" not in f]
    cache = os.path.join(pack, ".obstacles.npy")  # locating the layers takes minutes; reuse the result
    if os.path.exists(cache):
        obs = np.load(cache)
        layers = []
    else:
        obs = np.zeros((H, W), bool)
    for f in layers:
        im = Image.open(f).convert("RGBA")
        y, x = locate(small, full, im)
        a = np.asarray(im)[..., 3] > 40
        y0, x0, y1, x1 = max(0, y), max(0, x), min(H, y + im.height), min(W, x + im.width)
        obs[y0:y1, x0:x1] |= a[y0 - y:y1 - y, x0 - x:x1 - x]
        print("located", os.path.basename(f), y, x)
    if layers:
        np.save(cache, obs)

    counts = {t["order"]: len(t["subtopics"]) for t in json.load(open(curriculum))["topics"]}
    lines = [
        "// GENERATED by apps/mobile/scripts/map-scenes.py from the river map pack. Do not edit by hand.",
        "// Per chapter map: `path` = safest route through open water, top → bottom, as [x, y, open] with x/y as",
        "// fractions of the map image (open = 0 where the route passes behind an object; no trail dots there).",
        "// `spots` = where the level buttons sit (x, y fractions), bottom first: every Level 1, then Level 2, then Level 3;",
        "// evenly spaced by scripts/map-spots.py (run it after this script).",
        "export interface MapPath { path: [number, number, 0 | 1][]; nodes: number[]; spots?: [number, number][] }",
        "",
        "export const mapPaths: MapPath[] = [",
    ]
    for o in range(1, 13):
        y0, y1 = ISLAND_ROWS[o]
        n = 3 * counts.get(o, 5)  # one button per level of every subtopic (LV1 row at the bottom, LV3 at the top)
        # Crop CW wide on the island's side (islands alternate left/right), so each map shows its own theme and only
        # glimpses of the neighbours; the river between the islands stays in view.
        # Buttons sit in evenly spaced rows up the map (ROW apart; GROUP_GAP rows between the Level 1, 2 and 3 groups),
        # each at the most open spot in its row near the river, leaving room beside it for the subtopic name.
        per = n // 3
        slots = [i + (i // per) * (GROUP_GAP - 1) for i in range(n)]  # bottom first
        result = None
        for grow in (1.0, 1.15, 1.3, 1.5, 1.75):
            for c0 in sorted({0 if ISLAND_SIDE[o] == "left" else W - CW, (W - CW) // 2, W - CW if ISLAND_SIDE[o] == "left" else 0}):
                h = int(max(CW * MIN_ASPECT, (y1 - y0) + 240, (slots[-1] + 2) * ROW) * grow)
                top = max(0, min(H - h, (y0 + y1) // 2 - h // 2))
                free = ~obs[top:top + h:D, c0:c0 + CW:D]
                free[:, :1] = free[:, -1:] = False
                clr = distance_transform_edt(free) * D
                P = route(clr)  # river route, used to keep buttons near the water path
                rx = lambda y: float(np.interp(y, P[:, 1], P[:, 0]))
                band = int(BTN / 2 / D)
                xs_ok = np.arange(int(0.08 * CW / D), int(0.92 * CW / D))  # leave room for a name beside the button
                R = clr.shape[0]
                # best open spot in every analysis row: clearance over a button-tall band
                colmins = [clr[max(0, r - band):r + band + 1].min(axis=0)[xs_ok] for r in range(R)]
                rowbest = np.array([c.max() for c in colmins])
                jit = int(ROW * JIT / D)

                def win(y):  # best clearance within ±JIT of a row
                    r = int(y / D)
                    return rowbest[max(0, r - jit):min(R, r + jit + 1)].max()
                best = (-1, None)
                for step in np.linspace(ROW, ROW * 1.35, 8):
                    span = slots[-1] * step
                    for b0 in np.arange(ROW * 0.5, max(ROW * 0.5 + 1, h - span - ROW * 0.5), D * 2):
                        ys = [h - b0 - sl * step for sl in slots]
                        if min(ys) < ROW * 0.4:
                            continue
                        c = min(win(y) for y in ys)
                        if c > best[0]:
                            best = (c, ys)
                if result is None or best[0] > result[0]:
                    result = (best[0], c0, h, top, best[1], colmins, R, jit, rx, xs_ok)
            if result[0] >= 0.6 * BTN:
                break
        _, c0, h, top, best_ys, colmins, R, jit, rx, xs_ok = result
        best = (result[0], best_ys)
        spots, worst = [], 1e9
        for y0r in best[1]:
            r0 = int(y0r / D)
            cand = []
            for r in range(max(0, r0 - jit), min(R, r0 + jit + 1)):
                colmin = colmins[r]
                score = 4 * np.minimum(colmin, BTN) - 0.08 * np.abs(xs_ok * D - rx(r * D)) - 1.5 * abs(r - r0) * D
                j = int(np.argmax(score))
                cand.append((score[j], xs_ok[j] * D, r * D, colmin[j]))
            _, x, y, c = max(cand)
            spots.append((x, y))
            worst = min(worst, c)
        lo = worst
        idx = np.linspace(0, len(P) - 1, 90).astype(int)
        coarse = P[idx]
        nodes = []
        crop = full_img.crop((c0, top, c0 + CW, top + h)).resize((OUT_W, round(h * OUT_W / CW)), Image.LANCZOS)
        crop.save(os.path.join(HERE, "..", "assets", "ui", f"map-bg-{o}.webp"), quality=82, method=6)
        print(f"map {o}: aspect {h / CW:.3f}, {n} nodes, narrowest spot fits a {round(2 * lo / CW * 390)}pt button")
        pts = [f"[{round(x / CW, 4)}, {round(y / h, 4)}, 1]" for x, y in coarse]
        sp = [f"[{round(x / CW, 4)}, {round(y / h, 4)}]" for x, y in spots]
        lines += [f"  {{ // map {o}", f"    path: [{', '.join(pts)}],", f"    nodes: [],", f"    spots: [{', '.join(sp)}],", "  },"]
    lines.append("];")
    open(OUT, "w").write("\n".join(lines) + "\n")
    print("wrote", OUT)


def default_pack():
    """Unpack the committed pack's PNGs once (skipping PSDs) and return the folder."""
    out = os.path.join(PACK_DIR, "unzipped")
    if not os.path.exists(os.path.join(out, "Game-Level-Map-for-Water-Games.png")):
        with zipfile.ZipFile(os.path.join(PACK_DIR, "pack.zip")) as z:
            z.extractall(out, [m for m in z.namelist() if m.lower().endswith(".png")])
    return out


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else default_pack(), sys.argv[2] if len(sys.argv) > 2 else CURRICULUM)
