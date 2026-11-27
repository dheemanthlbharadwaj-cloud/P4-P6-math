"""Manual figure crop: the fallback for crops the automatic cropper got wrong (no model calls inside).

  python3 -I manual_crop.py grid <workdir> <page> [y0 y1]     → <workdir>/grid_pNN.png: the page (or the y0..y1 band) at
                                                               half size with a labelled 100-px grid in PAGE pixels,
                                                               for reading exact coordinates off the image
  python3 -I manual_crop.py crop <workdir> <page> <x0> <y0> <x1> <y1> <out.png> [--white x0,y0,x1,y1 ...]
                                                             → crops that box (300-dpi page pixels) and paints each
                                                               --white box (page pixels) white: for question text that
                                                               sits inside the figure's box. Never white out figure lines
                                                               or labels; prefer a slightly larger crop.
Typical use: grid the question's band, read the figure box off the grid, crop, look at the result, adjust.
"""
import sys
from PIL import Image, ImageDraw

cmd, work, page = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(f"{work}/pages/p{page:02d}.png").convert("RGB")
W, H = im.size

if cmd == "grid":
    y0 = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    y1 = int(sys.argv[5]) if len(sys.argv) > 5 else H
    band = im.crop((0, y0, W, y1))
    d = ImageDraw.Draw(band)
    for x in range(0, W, 100):
        d.line([(x, 0), (x, band.height)], fill=(255, 0, 0) if x % 500 == 0 else (255, 170, 170), width=3 if x % 500 == 0 else 1)
        if x % 200 == 0:
            d.text((x + 4, 4), str(x), fill=(200, 0, 0))
    for y in range((y0 // 100) * 100, y1, 100):
        yy = y - y0
        if yy < 0:
            continue
        d.line([(0, yy), (W, yy)], fill=(0, 0, 255) if y % 500 == 0 else (170, 170, 255), width=3 if y % 500 == 0 else 1)
        d.text((4, yy + 4), str(y), fill=(0, 0, 200))
    band = band.resize((band.width // 2, band.height // 2))
    out = f"{work}/grid_p{page:02d}.png"
    band.save(out)
    print(out)
elif cmd == "crop":
    x0, y0, x1, y1, out = int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7]), sys.argv[8]
    crop = im.crop((x0, y0, x1, y1))
    d = ImageDraw.Draw(crop)
    rest = sys.argv[9:]
    for i, a in enumerate(rest):
        if a == "--white":
            l, t, r, b = map(int, rest[i + 1].split(","))
            d.rectangle([l - x0, t - y0, r - x0, b - y0], fill="white")
    crop.save(out)
    print(f"{out} {x1 - x0}x{y1 - y0}")
