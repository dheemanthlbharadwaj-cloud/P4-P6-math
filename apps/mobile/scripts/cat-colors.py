"""Quest-reward cat coats (Rose, Ocean, Galaxy): recoloured from the grey coat of every pose, animation and timer frame,
so they keep the same flat cel colour, darker same-hue lines and soft shadow.

    pip install pillow numpy
    python scripts/cat-colors.py          # from apps/mobile; writes assets/cats/colors/*-color-<name>.* and timer frames
"""
import glob
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
COLORS = os.path.join(HERE, "..", "assets", "cats", "colors")
TIMER = os.path.join(HERE, "..", "assets", "cats", "timer")
# name: (hue 0..1, saturation multiplier, value multiplier) applied to the grey coat (hue ~0.6, saturation ~0.19)
TARGETS = {"rose": (0.94, 2.6, 1.06), "ocean": (0.55, 3.2, 1.02), "galaxy": (0.72, 2.6, 0.95)}


def recolor(im: Image.Image, hue: float, sat: float, val: float) -> Image.Image:
    rgba = np.asarray(im.convert("RGBA")).astype(np.float32) / 255
    rgb, a = rgba[..., :3], rgba[..., 3:]
    mx, mn = rgb.max(-1), rgb.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    coat = s > 0.06  # the grey coat and its lines/shadow are slightly blue; eyes, whites and blacks are not
    v = mx
    s2 = np.clip(s * sat, 0, 1)
    v2 = np.clip(v * val, 0, 1)
    h = np.full(v.shape, hue)
    i = np.floor(h * 6) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v2 * (1 - s2), v2 * (1 - f * s2), v2 * (1 - (1 - f) * s2)
    idx = i.astype(int)
    r = np.choose(idx, [v2, q, p, p, t, v2]); g = np.choose(idx, [t, v2, v2, q, p, p]); b = np.choose(idx, [p, p, t, v2, v2, q])
    out = np.where(coat[..., None], np.stack([r, g, b], -1), rgb)
    return Image.fromarray((np.concatenate([out, a], -1) * 255).astype(np.uint8), "RGBA")


def convert(src: str, dst: str, target):
    im = Image.open(src)
    if getattr(im, "n_frames", 1) > 1:  # animated webp: every frame, same timing
        frames, durations = [], []
        for k in range(im.n_frames):
            im.seek(k)
            frames.append(recolor(im, *target))
            durations.append(im.info.get("duration", 40))
        frames[0].save(dst, save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=80, method=4)
    elif dst.endswith(".webp"):
        recolor(im, *target).save(dst, quality=85)
    else:
        recolor(im, *target).save(dst, optimize=True)


if __name__ == "__main__":
    for name, target in TARGETS.items():
        for src in sorted(glob.glob(os.path.join(COLORS, "*-color-grey.*")) + glob.glob(os.path.join(TIMER, "*-color-grey.*"))):
            convert(src, src.replace("-color-grey.", f"-color-{name}."), target)
        print("done", name)
