"""Contact sheet of a paper's figure crops: python3 -I sheet.py <workdir> <out.png> [ids...]"""
import sys, json, glob, os
from PIL import Image, ImageDraw
W, out = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(f"{W}/figures/*.png"))
ims = []
for f in fs:
    im = Image.open(f).convert("RGB"); s = min(1.0, 700 / im.width, 500 / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
    c = Image.new("RGB", (720, im.height + 24), "#ddd"); ImageDraw.Draw(c).text((4, 4), os.path.basename(f), fill="black")
    c.paste(im, (10, 22)); ims.append(c)
cols = 2; rows = [ims[i:i+cols] for i in range(0, len(ims), cols)]
H = sum(max(i.height for i in r) for r in rows)
S = Image.new("RGB", (720 * cols, H), "white"); y = 0
for r in rows:
    for k, i in enumerate(r): S.paste(i, (720 * k, y))
    y += max(i.height for i in r)
S.save(out); print(S.size)
