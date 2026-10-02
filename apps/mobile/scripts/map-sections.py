"""Build one personalised map per chapter from the map pack's 12 island sections, and measure button spots.

Writes assets/ui/map-bg-N.webp (N = 1..12) and src/theme/mapPaths.ts.

    pip install pillow numpy scipy
    python scripts/map-sections.py /path/to/unzipped-pack assets/content/P6/curriculum.json

How it works:
1. Each section gets its own setting (THEMES): land maps (cities, suburbia, base, ice, mountains, volcano, dump,
   theme park, space base) get a themed ground, and the water the pack drew around the island is recoloured to that
   ground (shadows → darker ground, ripples → lighter ground). Sea maps (marina, oil platform) keep their water.
2. The island layer (assets/png/separated/NN_*.png) sits flush against the side it was cut on; it is the obstacle mask.
3. A winding path runs through the open lane beside the island (kept a node-column half-width clear of the island and
   the screen edges), drawn in the theme's style: road, dirt track, snow trail, stone path, paving, boardwalk or
   metal walkway. Buttons sit evenly along it.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, gaussian_filter, label

HERE = os.path.dirname(os.path.abspath(__file__))
D = 8  # analysis downsample
W = 2048  # canvas width (pack scale); exported at OUT_W
OUT_W = 1080
WATER = (108, 221, 231)
ISLAND_FRAC = 0.6  # island takes at most this share of the width; the rest is the lane for the path and buttons
MIN_ASPECT = 1.75
R = 0.19  # half the node column (button + name label) as a share of width: path keeps this far from island/edges
PATH_W = 0.15  # path width as a share of map width (~58pt on a 390pt phone, the button is 56pt)

# ground: base colour (None = keep the sea), shade/light for recoloured water shadows/ripples, path style + colours
THEMES = {
    1: dict(name="yacht marina", ground=None, path="boardwalk", fill=(196, 140, 84), edge=(120, 78, 42), mark=(150, 100, 56)),
    2: dict(name="city", ground=(206, 202, 192), shade=(160, 156, 148), light=(226, 223, 214), path="road", fill=(84, 90, 104), edge=(232, 230, 222), mark=(255, 214, 64)),
    3: dict(name="suburbia", ground=(126, 196, 82), shade=(88, 152, 60), light=(150, 210, 104), path="road", fill=(96, 100, 112), edge=(236, 232, 220), mark=(255, 255, 255)),
    4: dict(name="military base", ground=(196, 178, 120), shade=(150, 134, 88), light=(214, 198, 146), path="road", fill=(132, 126, 108), edge=(92, 88, 70), mark=(236, 226, 190)),
    5: dict(name="ice", ground=(236, 246, 252), shade=(186, 212, 230), light=(250, 253, 255), path="trail", fill=(196, 228, 244), edge=(150, 192, 218), mark=(255, 255, 255)),
    6: dict(name="mountains", ground=(140, 200, 92), shade=(98, 156, 62), light=(166, 214, 118), path="trail", fill=(206, 164, 104), edge=(150, 108, 62), mark=(226, 190, 136)),
    7: dict(name="volcano", ground=(110, 90, 86), shade=(80, 64, 62), light=(134, 114, 108), path="stone", fill=(168, 152, 142), edge=(236, 120, 40), mark=(120, 104, 98)),
    8: dict(name="city at night", ground=(52, 58, 82), shade=(36, 40, 60), light=(70, 78, 106), path="road", fill=(30, 33, 48), edge=(120, 130, 170), mark=(255, 214, 64)),
    9: dict(name="garbage dump", ground=(170, 140, 98), shade=(128, 102, 70), light=(190, 162, 120), path="trail", fill=(122, 98, 70), edge=(92, 72, 50), mark=(146, 120, 88)),
    10: dict(name="theme park", ground=(142, 206, 104), shade=(100, 160, 70), light=(166, 220, 128), path="paving", fill=(244, 214, 160), edge=(214, 120, 140), mark=(226, 190, 136)),
    11: dict(name="oil platform", ground=None, path="walkway", fill=(150, 160, 172), edge=(255, 196, 0), mark=(110, 120, 132)),
    12: dict(name="space base", ground=(208, 212, 220), shade=(160, 166, 178), light=(228, 231, 236), path="road", fill=(70, 76, 90), edge=(246, 246, 248), mark=(255, 140, 40)),
}


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-9
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, np.where(mx > 0, d / (mx + 1e-9), 0), mx


def landify(rgba, ground, shade, light):
    """Recolour the water the artist drew around/inside an island (cyan, connected to the outside) to ground."""
    rgb, a = rgba[..., :3].astype(float) / 255, rgba[..., 3]
    h, s, v = hsv(rgb)
    cyan = (h > 172) & (h < 200) & (s > 0.2) & (v > 0.3) & (a > 20)
    outside = a < 20
    lab, _ = label(cyan | outside)
    keep = np.unique(lab[binary_dilation(outside, iterations=2) & (cyan | outside)])
    water = np.isin(lab, keep[keep > 0]) & cyan
    # white ripple lines on the water: white bits that mostly sit next to water
    white = (s < 0.15) & (v > 0.85) & (a > 20) & ~water
    wl, wn = label(white)
    if wn:
        near = np.bincount(wl[binary_dilation(water, iterations=3) & white].ravel(), minlength=wn + 1)
        size = np.bincount(wl.ravel(), minlength=wn + 1)
        rip = near / (size + 1e-9) > 0.3
        rip[0] = False
        v = np.where(rip[wl], 0.97, v)
        water |= rip[wl]
    g, sh, li = (np.array(c, float) for c in (ground, shade, light))
    t = np.clip((v - 0.5) / 0.28, 0, 1)[..., None]
    u = np.clip((v - 0.78) / 0.19, 0, 1)[..., None]
    col = np.where(v[..., None] < 0.78, sh + (g - sh) * t, g + (li - g) * u)
    out = rgba.astype(float)
    out[water, :3] = col[water]
    out[water, 3] = np.maximum(out[water, 3], 255 * (a[water] > 120))
    return out.clip(0, 255).astype(np.uint8)


def ground_texture(H, base, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W))
    for scale, amp in ((24, 7.0), (6, 3.0)):
        n = gaussian_filter(rng.standard_normal((H // scale + 2, W // scale + 2)), 1.2)
        n = np.asarray(Image.fromarray((n / (np.abs(n).max() + 1e-9)).astype(np.float32)).resize((W, H), Image.BICUBIC))
        out += n * amp
    img = np.array(base, float)[None, None, :] + out[..., None]
    return Image.fromarray(img.clip(0, 255).astype(np.uint8)).convert("RGBA")


def draw_path(canvas, P, th):
    """Draw the themed path along the dense point list P (x, y) on canvas (RGBA, in place)."""
    style, fill, edge, mark = th["path"], th["fill"], th["edge"], th["mark"]
    hw = PATH_W * W / 2
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    # soft drop shadow
    shadow = Image.new("L", canvas.size, 0)
    ds = ImageDraw.Draw(shadow)
    for x, y in P[::2]:
        ds.ellipse([x - hw - 6, y - hw + 10, x + hw + 6, y + hw + 22], fill=90)
    shadow = shadow.resize((W // 4, canvas.height // 4)).resize(canvas.size, Image.BILINEAR)
    canvas.alpha_composite(Image.merge("RGBA", (*(Image.new("L", canvas.size, 0),) * 3, shadow)))
    ew = {"road": 14, "trail": 10, "stone": 12, "paving": 12, "boardwalk": 12, "walkway": 16}[style]
    for x, y in P[::2]:
        dr.ellipse([x - hw - ew, y - hw - ew, x + hw + ew, y + hw + ew], fill=edge + (255,))
    for x, y in P[::2]:
        dr.ellipse([x - hw, y - hw, x + hw, y + hw], fill=fill + (255,))
    L = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]

    def at(s):
        x = np.interp(s, L, P[:, 0]); y = np.interp(s, L, P[:, 1])
        dx = np.interp(s + 4, L, P[:, 0]) - np.interp(s - 4, L, P[:, 0])
        dy = np.interp(s + 4, L, P[:, 1]) - np.interp(s - 4, L, P[:, 1])
        n = np.hypot(dx, dy) + 1e-9
        return x, y, dx / n, dy / n

    if style == "road":  # dashed centre line
        s = 40.0
        while s < L[-1] - 60:
            x0, y0, _, _ = at(s); x1, y1, _, _ = at(s + 70)
            dr.line([x0, y0, x1, y1], fill=mark + (255,), width=16)
            s += 150
    elif style in ("boardwalk", "walkway"):  # planks / grating across the path
        step = 46 if style == "boardwalk" else 34
        s = 0.0
        while s < L[-1]:
            x, y, tx, ty = at(s)
            nx, ny = -ty, tx
            dr.line([x - nx * hw, y - ny * hw, x + nx * hw, y + ny * hw], fill=mark + (255,), width=6 if style == "boardwalk" else 4)
            s += step
    elif style == "paving":  # tiles: two rows of joints
        s = 0.0
        while s < L[-1]:
            x, y, tx, ty = at(s)
            nx, ny = -ty, tx
            dr.line([x - nx * hw, y - ny * hw, x + nx * hw, y + ny * hw], fill=mark + (255,), width=5)
            s += 64
        for off in (-hw / 2, hw / 2):
            pts = []
            for s2 in np.arange(0, L[-1], 16):
                x, y, tx, ty = at(s2)
                pts.append((x - ty * off, y + tx * off))
            dr.line(pts, fill=mark + (255,), width=4)
    elif style in ("trail", "stone"):  # pebbles / footprints scattered on the path
        rng = np.random.default_rng(7)
        for s2 in np.arange(0, L[-1], 26 if style == "stone" else 40):
            x, y, tx, ty = at(s2)
            o = rng.uniform(-0.7, 0.7) * hw
            px, py = x - ty * o, y + tx * o
            r = rng.uniform(6, 16) if style == "stone" else rng.uniform(4, 9)
            dr.ellipse([px - r, py - r * 0.7, px + r, py + r * 0.7], fill=mark + (255,))
    canvas.alpha_composite(layer)


def lane_route(obs, H, side, o):
    """Winding route through the open lane beside the island; returns dense points (D px apart) and coarse points."""
    r = R * W
    ys = np.arange(0, H, D)
    occ = obs[::D, ::D]
    if side == "left":
        edge = np.array([np.nonzero(row)[0].max() if row.any() else 0 for row in occ]) * D
    else:
        edge = np.array([np.nonzero(row)[0].min() if row.any() else W for row in occ]) * D
    win = int(r * 1.1 / D)  # a button + label spans this many rows; use the worst row nearby
    if side == "left":
        edge = np.array([edge[max(0, i - win):i + win + 1].max() for i in range(len(edge))])
        a, b = np.maximum(r, edge + r), np.full(len(edge), W - r)
    else:
        edge = np.array([edge[max(0, i - win):i + win + 1].min() for i in range(len(edge))])
        a, b = np.full(len(edge), r), np.minimum(W - r, edge - r)
    b = np.maximum(a, b)
    wave = 0.5 + 0.42 * np.sin(2 * np.pi * ys / (0.95 * W) + o * 1.7)
    xs = a + (b - a) * wave
    xs = np.convolve(np.pad(xs, 15, mode="edge"), np.ones(31) / 31, mode="valid")
    xs = np.clip(xs, a, b)
    P = np.c_[xs, ys].astype(float)
    return P, P[np.linspace(0, len(ys) - 1, 90).astype(int)]


def main(pack, curriculum):
    counts = {t["order"]: len(t["subtopics"]) for t in json.load(open(curriculum))["topics"]}
    lines = [
        "// GENERATED by apps/mobile/scripts/map-sections.py from the map pack. Do not edit by hand.",
        "// Per chapter map: `path` = the drawn path (road, trail, boardwalk…), top → bottom, as [x, y, open] with x/y as",
        "// fractions of the map image. `nodes` = where the subtopic buttons sit, as arc-length fractions along `path`",
        "// (0 = top), start (bottom) first.",
        "export interface MapPath { path: [number, number, 0 | 1][]; nodes: number[] }",
        "",
        "export const mapPaths: MapPath[] = [",
    ]
    meta = []
    for o in range(1, 13):
        th = THEMES[o]
        sec = Image.open(glob.glob(os.path.join(pack, f"assets/png/{o:02d}_*.png"))[0]).convert("RGBA")
        isl = Image.open([f for f in glob.glob(os.path.join(pack, f"assets/png/separated/{o:02d}_*.png")) if "stream" not in f][0]).convert("RGBA")
        stream = Image.open(glob.glob(os.path.join(pack, f"assets/png/separated/{o:02d}_*_stream.png"))[0]).convert("RGBA")
        ia = np.asarray(isl)[..., 3] > 40
        side = "left" if ia[:, :12].mean() > ia[:, -12:].mean() else "right"
        s = min(1.0, ISLAND_FRAC * W / isl.width)
        iw, ih = round(isl.width * s), round(isl.height * s)
        n = counts.get(o, 5)
        H = max(int(W * MIN_ASPECT), ih + int(0.22 * W), (n + 1) * 520)  # room for n buttons a min gap apart
        top_y = (H - ih) // 2
        x0 = 0 if side == "left" else W - iw

        sea = th["ground"] is None
        canvas = ground_texture(H, WATER if sea else th["ground"], o)
        if sea:  # stream swirls in the open water above and below the island
            st = stream.resize((round(stream.width * s), round(stream.height * s)))
            sx = W - st.width if side == "left" else 0
            if top_y > st.height * 0.3:
                canvas.alpha_composite(st.transpose(Image.FLIP_TOP_BOTTOM), (sx, max(0, top_y - st.height)))
            if H - (top_y + ih) > st.height * 0.3:
                canvas.alpha_composite(st.transpose(Image.FLIP_LEFT_RIGHT), (sx, min(H - st.height, top_y + ih)))
            art = isl
        else:
            art = Image.fromarray(landify(np.asarray(isl), th["ground"], th["shade"], th["light"]))
        art = art.resize((iw, ih), Image.LANCZOS)

        obs = np.zeros((H, W), bool)
        obs[top_y:top_y + ih, x0:x0 + iw] = np.asarray(art)[..., 3] > 40
        P, coarse = lane_route(obs, H, side, o)
        draw_path(canvas, P, th)
        canvas.alpha_composite(art, (x0, top_y))

        out = canvas.convert("RGB").resize((OUT_W, round(H * OUT_W / W)), Image.LANCZOS)
        out.save(os.path.join(HERE, "..", "assets", "ui", f"map-bg-{o}.webp"), quality=82, method=6)
        meta.append((o, round(H / W, 3), side))

        nodes = [round(float(t), 4) for t in np.linspace(0.85, 0.08, n)]  # arc-length fractions, start (bottom) first
        pts = [f"[{round(x / W, 4)}, {round(y / H, 4)}, 1]" for x, y in coarse]
        lines += [f"  {{ // map {o}: {th['name']} ({th['path']})", f"    path: [{', '.join(pts)}],", f"    nodes: [{', '.join(map(str, nodes))}],", "  },"]
        print(f"map {o} {th['name']} ({side}, aspect {H / W:.3f}, {th['path']}): {n} nodes")
    lines.append("];")
    open(os.path.join(HERE, "..", "src", "theme", "mapPaths.ts"), "w").write("\n".join(lines) + "\n")
    print("meta (order, aspect, island side):", meta)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
