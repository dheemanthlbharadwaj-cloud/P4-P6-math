"""Render the artist's map layers from the pack's PSD, once, into design/source-assets/map-pack/layers/.

    pip install pillow psd-tools aggdraw
    python scripts/map-layers.py        # ~10 min on 4 cores (vector shapes are slow to render)

Writes (all committed, so map-scenes.py never needs the PSD):
- river.png       the whole river (2048 x 16000): the flat water background plus every island's wave lines ("stream")
- island-N.png    chapter N's island (N = 1..12) exactly as drawn, with its ripples, on transparency
- layers.json     {"N": [x, y]}: where each island-N.png sits on the river (top-left, in river pixels)

Chapter N uses the PSD group named "N. ..." (1. Yacht Marina ... 12. NASA). The start/end islands, the pack's own
level markers ("LEVELS") and "map objects" are left out.
"""
import json
import os
import re
import sys
import zipfile
from multiprocessing import Pool

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PACK_DIR = os.path.join(HERE, "..", "..", "..", "design", "source-assets", "map-pack")
OUT = os.path.join(PACK_DIR, "layers")
PSD_NAME = "Game-Level-Map-for-Water-Games.psd"


def psd_path():
    p = os.path.join(PACK_DIR, "unzipped", PSD_NAME)
    if not os.path.exists(p):
        with zipfile.ZipFile(os.path.join(PACK_DIR, "pack.zip")) as z:
            z.extract(PSD_NAME, os.path.join(PACK_DIR, "unzipped"))
    return p


def open_psd():
    from psd_tools import PSDImage
    from psd_tools.psd.parse_limits import ParseLimits
    return PSDImage.open(psd_path(), parse_limits=ParseLimits(max_objects=10**9))


def render_island(name):
    psd = open_psd()
    g = next(x for x in psd if x.name == name)
    n = int(name.split(".")[0])
    g.composite().save(os.path.join(OUT, f"island-{n}.png"), optimize=True)
    return n, [g.bbox[0], g.bbox[1]]


def main():
    os.makedirs(OUT, exist_ok=True)
    psd = open_psd()
    W, H = psd.size
    river = psd[0].topil().convert("RGBA")  # "Background": the flat water
    for layer in psd.descendants():
        if layer.name == "stream" and layer.kind == "shape":
            im = layer.composite()
            if im is not None:
                sheet = Image.new("RGBA", (W, H))
                sheet.paste(im, (layer.bbox[0], layer.bbox[1]))
                river.alpha_composite(sheet)
    river.convert("RGB").save(os.path.join(OUT, "river.png"), optimize=True)
    print("river done", flush=True)
    names = [g.name for g in psd if g.is_group() and re.match(r"^\d+\. ", g.name)]
    with Pool(min(4, os.cpu_count() or 1)) as pool:
        pos = dict(pool.map(render_island, names))
    json.dump({str(k): pos[k] for k in sorted(pos)}, open(os.path.join(OUT, "layers.json"), "w"), indent=1)
    print("islands", sorted(pos))


if __name__ == "__main__":
    sys.exit(main())
