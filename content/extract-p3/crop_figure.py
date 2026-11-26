"""Figure crop for one question (no model calls): find the drawing in the question's page band, keep its labels,
white out question text that intrudes, never over-crop.

  python3 -I crop_figure.py <workdir> <page> <y0> <y1> <out.png> [--text FILE] [--opts picture|text] [--x0 X] [--x1 X]

<workdir> is a paper's folder from ocr_index.py (pages/, ocr/). y0..y1 = the question's band in 300-dpi page pixels
(from crop_paper.py: index.json, or found from the question's own text). Prints JSON {bbox, whited_words, ...}.

How: ink = dark pixels. Page furniture is taken off the ink map first and painted white if it falls in the crop:
  * long straight rules (the frame lines between questions, the "Do not write in this space" column rule) and
    everything right of the column rule (its text and mark boxes); the scan border is not mistaken for the column;
  * answer lines: isolated thin horizontal strokes (underlines) plus the words on their row ("Ans:", "$", "cm"),
    so an underline under a graph never extends the crop;
  * answer brackets "(   )": pairs of isolated paren-shaped strokes at the right, found by shape (OCR often misses them).
Text words are taken off the ink map when they belong to the question's own text lines (lines of the question's
words, option lines "(1) 410 ml", page numbers, "[3]"); short words (labels such as "500 ml", "A", "12 cm", graph
titles, table cells) stay as part of the drawing. What is left is dilated and grouped into regions; the figure is the
union of the real regions (big enough, dense enough; far-away small leftovers are dropped). Label words touching the
union join it. MCQ picture options (bare "(1)".."(4)" labels with no text after them) are one figure with their labels.
The crop gets a small margin; any question-text word or furniture that still falls inside the crop is painted white
instead of shrinking the crop (so no part of a figure or its labels is ever cut off).
"""
import csv, io, json, re, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

work, page, y0, y1, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
args = sys.argv[6:]
x0 = int(args[args.index("--x0") + 1]) if "--x0" in args else 0
# --text <file>: the question's extracted text (stem, parts, options). Only words of THAT text count as question text
# (whited out if inside the crop); every other word in the band (graph titles, axis labels, table cells) is figure.
norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())
qtokens = None
if "--text" in args:
    qtokens = {norm(t) for t in re.split(r"\s+", open(args[args.index("--text") + 1]).read()) if norm(t)}
opts_mode = args[args.index("--opts") + 1] if "--opts" in args else "auto"   # what the MCQ options are, if known
x1_arg = int(args[args.index("--x1") + 1]) if "--x1" in args else None

im = Image.open(f"{work}/pages/p{page:02d}.png").convert("L")
W, H = im.size
x1 = x1_arg or W
y0, y1 = max(0, y0), min(H, y1)
a = np.array(im)
ink = a < 170
white = np.zeros_like(ink)  # everything removed as furniture; painted white if it lies inside the crop

# ---- page furniture: rules and the right-hand column -------------------------------------------------------------
def opened(m, axis, L):
    """ink strokes at least L px long along `axis` (1 = horizontal, 0 = vertical); tolerates a slight scan skew"""
    t = ndimage.maximum_filter1d(m.astype(np.uint8), 15, axis=1 - axis)   # thicken across the stroke
    e = ndimage.minimum_filter1d(t, L, axis=axis)
    return ndimage.maximum_filter1d(e, L, axis=axis).astype(bool)

# the column rule: a long vertical stroke in x 0.76W..0.94W, possibly slanted by the scan (the scan border beyond 0.94W is
# ignored). Ink pixels are sheared by a few tiny slopes; the column rule is where a straight stroke piles up >= 0.30 of
# the page height in one pixel column (a grid or a graph axis is far shorter, text is far sparser).
xa, xb = int(W * 0.76), int(W * 0.94)
ys_, xs_ = np.nonzero(ink[:, xa:xb])
best = (0, 0.0, 0)
for slope in np.linspace(-0.04, 0.04, 81):           # px of drift per row (scans are slanted by up to ~2 degrees)
    xc = xs_ + np.round(ys_ * slope).astype(int) + 300
    cnt = np.bincount(xc)
    if cnt.max() > best[0]:
        best = (int(cnt.max()), slope, int(np.nonzero(cnt >= 0.9 * cnt.max())[0].min()))
cutx = np.full(H, xb)                                   # per row: ink at or right of this x is the column (or scan border)
col_x = None
if best[0] >= 0.30 * H:
    line_x = best[2] - 300 + xa - np.round(np.arange(H) * best[1]).astype(int)   # x of the rule's left edge, per row
    cutx = np.minimum(line_x - 14, xb)
    col_x = int(np.median(line_x))
right_cut = int(np.median(cutx))
hor = opened(ink, 1, 500)
hl, hn = ndimage.label(ndimage.binary_dilation(hor, iterations=2))
rules = np.zeros_like(ink)
for i, sl in enumerate(ndimage.find_objects(hl), start=1):
    length = sl[1].stop - sl[1].start
    # frame rules run to the column rule (or are page-wide); a table's or a graph's own lines do neither
    if length >= 0.6 * W or (col_x is not None and sl[1].stop >= right_cut - 60 and length >= 500):
        rules[sl] |= hl[sl] == i
rules = ndimage.binary_dilation(rules, iterations=3)
white |= rules & ink
ink &= ~rules
beyond = np.arange(W)[None, :] >= cutx[:, None]          # the column (its text and mark boxes) and the scan border
white |= beyond
ink &= ~beyond

# ---- OCR lines ----------------------------------------------------------------------------------------------------
rows = [r for r in csv.DictReader(io.StringIO(open(f"{work}/ocr/p{page:02d}.tsv").read()), delimiter="\t", quoting=csv.QUOTE_NONE)
        if r.get("text", "").strip() and float(r["conf"]) > 0
        and int(r["left"]) < cutx[min(H - 1, int(r["top"]))]]          # words inside the column are cut away already
lines = {}
for r in rows:
    lines.setdefault((r["block_num"], r["par_num"], r["line_num"]), []).append(r)
# tesseract sometimes cuts one visual row into two "lines" ("Each" + "statement is either..."): merge the lines that
# stand on the same row and close together, so a row is classified as a whole
def _span(ws): return min(int(w["top"]) for w in ws), max(int(w["top"]) + int(w["height"]) for w in ws), min(int(w["left"]) for w in ws), max(int(w["left"]) + int(w["width"]) for w in ws)
merged = True
while merged:
    merged = False
    keys = list(lines)
    for i, ka in enumerate(keys):
        for kb in keys[i + 1:]:
            ta, ba, la, ra = _span(lines[ka]); tb, bb, lb, rb = _span(lines[kb])
            ov = min(ba, bb) - max(ta, tb)
            if ov > 0.6 * min(ba - ta, bb - tb) and max(la - rb, lb - ra) < 120 and max(ba - ta, bb - tb) < 2.2 * min(ba - ta, bb - tb):
                lines[ka] = lines[ka] + lines.pop(kb); merged = True; break
        if merged: break

OPTION = re.compile(r"^\(?[1-4]\)$|^\([1-4]\)?$")
text_words, label_words, pending, opt_labels = [], [], [], []
for ws in lines.values():
    ws.sort(key=lambda w: int(w["left"]))
    t0 = min(int(w["top"]) for w in ws)
    if not (y0 - 20 <= t0 <= y1):
        continue
    boxes = [(int(w["left"]), int(w["top"]), int(w["left"]) + int(w["width"]), int(w["top"]) + int(w["height"]), w["text"]) for w in ws]
    if boxes[0][0] > cutx[min(H - 1, max(0, boxes[0][1]))]:   # inside the column: already cut
        continue
    # MCQ picture option: a bare "(1)" label; the option is a picture, not text (nothing readable after the label)
    if OPTION.match(ws[0]["text"]) and opts_mode != "text" and not any(len(norm(w["text"])) >= 2 for w in ws[1:]):
        opt_labels.append(boxes[0])
        label_words.extend(boxes)
        continue
    alpha = sum(bool(re.search(r"[A-Za-z]{2,}", w["text"])) for w in ws)
    if qtokens is not None:
        hits = sum(norm(w["text"]) in qtokens for w in ws if norm(w["text"]))
        looks_text = len(ws) >= 2 and hits >= 0.6 * len([w for w in ws if norm(w["text"])])
    else:
        looks_text = len(ws) >= 3 and alpha >= 2
    is_text = looks_text or OPTION.match(ws[0]["text"]) or re.match(r"^(page|pago|pg)\d*$", ws[0]["text"], re.I) \
        or all(w["text"] in "(){}[]|" for w in ws) or re.match(r"^\(?\d{1,2}[.,)]$", ws[0]["text"]) \
        or re.match(r"^\[?\d{1,2}\]$", ws[0]["text"]) \
        or re.search(r"(do not write|this space|go to section|last page|end of paper|go on to the next|\b(page|pg|pago)\s*\d+\s*(of|/)\s*\d+|^score$)", " ".join(w["text"] for w in ws), re.I) \
        or any(re.match(r"^(score|answers?|ans)[:.;]?$", w["text"], re.I) for w in ws)
    pending.append((bool(is_text), bool(looks_text) and not OPTION.match(ws[0]["text"]), boxes))
NUM = re.compile(r"^\(?\d{1,2}[.,)]$")
def line_left(bx):
    """left edge of a line's text, not counting a leading question number ("6.") that sits in the number column"""
    return next((w[0] for w in bx if not NUM.match(w[4])), bx[0][0])

# picture options: told by the caller (the question's options are "[figure]"), else several bare labels
picture_opts = opts_mode == "picture" and len(opt_labels) >= 2 or opts_mode == "auto" and len(opt_labels) >= 3
if not picture_opts:   # a lone "(1)" is an ordinary option line
    for b in opt_labels:
        text_words.append(b)
    label_words = [w for w in label_words if w not in opt_labels]

# question text starts at the stem's left edge (the text column right of the number): the left of the topmost text line
FURN = re.compile(r"(do not write|this space|go to section|last page|end of paper|go on to the next|\b(page|pg|pago)\s*\d+\s*(of|/)\s*\d+)", re.I)
stem_lines = [bx for t, lt, bx in pending if lt and len(bx) >= 3 and not FURN.search(" ".join(w[4] for w in bx))] \
    or [bx for t, lt, bx in pending if t and len(bx) >= 3 and not FURN.search(" ".join(w[4] for w in bx))]
stem_left0 = line_left(min(stem_lines, key=lambda bx: bx[0][1])) if stem_lines else 0
aligned = [bx for t, lt, bx in pending if t and (not lt or abs(line_left(bx) - stem_left0) <= 45)]
long_lefts = [bx_[0] for bx in aligned for bx_ in bx if re.search(r"[A-Za-z]{3,}", bx_[4])]
stem_left = min(long_lefts) if long_lefts else 0

band = np.zeros_like(ink)
band[y0:y1, x0:x1] = True
ink &= band
if long_lefts:  # the question-number column, left of where the question's text starts (numbers OCR missed)
    ink[:, :max(0, stem_left - 15)] = False

# ---- answer lines (underlines) and answer brackets, by shape ---------------------------------------------------------
cl, cn = ndimage.label(ink, structure=np.ones((3, 3)))
unders, parens = [], []
for i, sl in enumerate(ndimage.find_objects(cl), start=1):
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    n = int((cl[sl] == i).sum())
    if h <= 16 and w >= 120:                                   # isolated thin wide stroke
        unders.append([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])
    elif 45 <= h <= 130 and w <= 50 and sl[1].start > 0.55 * W and n / float(h * w) < 0.3:
        parens.append([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])
for u in unders:
    ink[u[1] - 2:u[3] + 2, u[0] - 2:u[2] + 2] = False
    white[u[1] - 2:u[3] + 2, u[0] - 2:u[2] + 2] = True
furniture = []   # boxes of answer-line words / brackets, whited if inside the crop
for p in parens:   # a bracket pair "(   )": two paren strokes on one row
    mates = [q for q in parens if q is not p and abs((q[1] + q[3]) - (p[1] + p[3])) < 50 and 50 < abs(q[0] - p[0]) < 300]
    if mates:
        l_, r_ = min(p[0], mates[0][0]), max(p[2], mates[0][2])
        t_, b_ = min(p[1], mates[0][1]), max(p[3], mates[0][3])
        ink[t_ - 4:b_ + 4, l_ - 4:r_ + 4] = False
        furniture.append((l_, t_, r_, b_, "()"))
# words standing on an answer line's row ("Ans:", "$", unit) are answer furniture, not figure labels
def on_answer_row(w):
    return any(w[3] > u[1] - 60 and w[1] < u[3] + 25 and w[2] > u[0] - 330 and w[0] < u[2] + 330 for u in unders)

# scan specks: tiny isolated ink bits (dust, stray dashes) never count towards a drawing's extent
_cl, _cn = ndimage.label(ink, structure=np.ones((3, 3)))
_area = ndimage.sum(ink, _cl, index=np.arange(1, _cn + 1))
specks = np.zeros_like(ink)
for _i, _sl in enumerate(ndimage.find_objects(_cl), start=1):
    if _area[_i - 1] < 150 and max(_sl[0].stop - _sl[0].start, _sl[1].stop - _sl[1].start) < 30:
        specks[_sl] |= _cl[_sl] == _i

def find_regions(remove):
    m = ink.copy()
    for (l, t, r, b, _) in remove:
        m[max(0, t - 6):b + 6, max(0, l - 6):r + 6] = False
    lab, _ = ndimage.label(ndimage.binary_dilation(m, iterations=18))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        part = m[sl] & (lab[sl] == i)
        iy, ix = np.nonzero(part & ~specks[sl])
        if not len(iy):
            iy, ix = np.nonzero(part)
        if not len(iy):
            continue
        ih, iw = iy.max() - iy.min() + 1, ix.max() - ix.min() + 1
        # a drawing: not a speck, not an answer underline (thin, wide) or a margin rule (thin, tall)
        # and not scan speckle: real drawings have some ink density in their own box
        dense = part.sum() / float(ih * iw) > 0.012
        if part.sum() > (150 if picture_opts else 400) and dense and ih > 25 and iw > 25 and (sl[0].stop - sl[0].start) > 60 and (sl[1].stop - sl[1].start) > 60:
            out.append([int(sl[1].start + ix.min()), int(sl[0].start + iy.min()), int(sl[1].start + ix.max()), int(sl[0].start + iy.max()), int(part.sum())])
    return out

def drop_leftovers(regs):
    """small far-away leftovers (a speck cluster, a stray mark) next to a much bigger drawing are not part of the figure"""
    if len(regs) < 2:
        return regs
    big = max(regs, key=lambda g: g[4])
    keep = []
    for g in regs:
        gap = max(g[0] - big[2], big[0] - g[2], g[1] - big[3], big[1] - g[3], 0)
        if g is big or not (gap > 200 and g[4] < 0.05 * big[4]):
            keep.append(g)
    return keep

# pass 1: drawings with ALL words taken out
regions = find_regions([bx_ for t, lt, bx in pending for bx_ in bx] + text_words + label_words)
# a line made of the question's words that does not start at the stem's left edge is a figure label (graph title, axis
# label, table cell) only when it sits on or right next to a drawing; a free-standing one is question text
# (and it is short: a sentence of 9+ words, or the next line of such a paragraph, is question text wherever it stands)
def near_drawing(bx):
    l, t, r, b = min(w[0] for w in bx), min(w[1] for w in bx), max(w[2] for w in bx), max(w[3] for w in bx)
    return any(max(g[0] - r, l - g[2], g[1] - b, t - g[3], 0) <= 110 for g in regions)
def beside_drawing(bx):
    """the line stands level with a drawing (shares its rows) and next to it: an axis title or label, whatever its left edge"""
    t, b = min(w[1] for w in bx), max(w[3] for w in bx)
    l, r = min(w[0] for w in bx), max(w[2] for w in bx)
    if re.search(r"[?.!:]$", bx[-1][4]) or re.match(r"^\(?[a-z]\)$", bx[0][4]):   # a sentence or an "(a)" part: question text
        return False
    return any(min(b, g[3]) - max(t, g[1]) > 0.5 * (b - t) and max(g[0] - r, l - g[2], 0) <= 300 for g in regions)
decided = []   # (left, top, bottom, is_text) of lines already decided, top to bottom
for is_t, by_match, boxes in sorted(pending, key=lambda p: min(w[1] for w in p[2])):
    left, top, bot = line_left(boxes), min(w[1] for w in boxes), max(w[3] for w in boxes)
    if is_t and by_match and len(boxes) < 9 and ((abs(left - stem_left0) > 45 and near_drawing(boxes)) or beside_drawing(boxes)):
        is_t = any(t_ and abs(left - l_) <= 30 and 0 < top - b_ < 1.3 * (b_ - t0_) for l_, t0_, b_, t_, r_ in decided)   # paragraph continuation
        # or the rest of a row whose first piece is already text (the OCR cut one row of the stem in two)
        is_t = is_t or any(t_ and abs(l_ - stem_left0) <= 45 and min(bot, b_) - max(top, t0_) > 0.5 * min(bot - top, b_ - t0_) and 0 <= left - r_ < 250 for l_, t0_, b_, t_, r_ in decided)
    decided.append((left, top, bot, bool(is_t), max(w[2] for w in boxes)))
    (text_words if is_t else label_words).extend(boxes)
inside = lambda w, g: g[0] - 12 <= w[0] and w[2] <= g[2] + 12 and g[1] - 12 <= w[1] and w[3] <= g[3] + 12
# words on an answer line's row are furniture unless they sit inside a drawing
for w in list(label_words):
    if on_answer_row(w) and not any(inside(w, g) for g in regions):
        label_words.remove(w); text_words.append(w)
# words inside a drawing's box (captions in a framed picture, labels on a diagram) belong to the figure
moved = [w for w in text_words if any(inside(w, g) for g in regions)]
text_words = [w for w in text_words if w not in moved]
label_words += moved
# a lone short word aligned with the question text (a wrapped stem line like "Friday.") is question text
stray = [w for w in label_words if abs(w[0] - stem_left) < 25 and not any(inside(w, g) for g in regions) and w not in opt_labels
         and not (beside_drawing([w]) and not re.search(r"[?.!:]$", w[4]))]
label_words = [w for w in label_words if w not in stray]
text_words += stray
# pass 2: drawings with only question text taken out (labels are part of the drawing's ink)
regions = drop_leftovers(find_regions(text_words) or regions)
# a one-line strip flush with the stem's left edge is a wrapped stem line the OCR missed ("total?"): question text
if stem_left and not picture_opts:
    # (unless it is a flush-left axis label standing close to the drawing and not directly under a stem line)
    directly_below = lambda g: any(abs(t[0] - stem_left) <= 30 and -15 <= g[1] - t[3] <= 70 for t in text_words)
    others = lambda g: [h for h in regions if h is not g]
    far = lambda g: not others(g) or min(max(g[0] - h[2], h[0] - g[2], g[1] - h[3], h[1] - g[3], 0) for h in others(g)) > 110
    for g in [g for g in regions if abs(g[0] - stem_left) <= 30 and g[3] - g[1] <= 70 and (directly_below(g) or far(g))]:
        regions.remove(g); text_words.append((g[0], g[1], g[2], g[3], "[missed text]"))
# a lone label word standing on the same row right next to question text is the rest of that text line ("angles?")
for w in list(label_words):
    if w not in opt_labels and not any(inside(w, g) for g in regions) and any(
            min(w[3], t[3]) - max(w[1], t[1]) > 0.5 * min(w[3] - w[1], t[3] - t[1]) and 0 <= w[0] - t[2] < 80 for t in text_words):
        label_words.remove(w); text_words.append(w)
if not regions:
    print(json.dumps({"bbox": None, "note": "no drawing found in band"}))
    sys.exit(2)
L, T = min(r[0] for r in regions), min(r[1] for r in regions)
R, B = max(r[2] for r in regions), max(r[3] for r in regions)
if picture_opts:   # the (1)-(4) labels are part of the picture-options figure
    for (l, t, r, b, _) in opt_labels:
        if T - 150 <= t <= B + 150:
            L, T, R, B = min(L, l), min(T, t), max(R, r), max(B, b)
changed = True
while changed:  # labels touching the figure join it
    changed = False
    for (l, t, r, b, _) in label_words:
        if l < R + 70 and r > L - 70 and t < B + 40 and b > T - 40 and not (L <= l and r <= R and T <= t and b <= B):
            L, T, R, B = min(L, l), min(T, t), max(R, r), max(B, b)
            changed = True
PAD = 16
L, T, R, B = max(0, L - PAD), max(0, T - PAD), min(W, R + PAD), min(H, B + PAD)
crop_a = np.array(im.crop((L, T, R, B)))
crop_a[white[T:B, L:R]] = 255          # rules, the column, answer lines
crop = Image.fromarray(crop_a).convert("RGB")
d = ImageDraw.Draw(crop)
whited = []
for (l, t, r, b, txt) in text_words + furniture:
    if l < R and r > L and t < B and b > T:
        d.rectangle([l - L - 4, t - T - 4, r - L + 4, b - T + 4], fill="white")
        whited.append(txt)
# ink fragments left beside a whited box (a half-covered bracket, a descender) are whited too
ca = np.array(crop.convert("L")) < 170
wr = np.zeros_like(ca)
for (l, t, r, b, txt) in text_words + furniture:
    if l < R and r > L and t < B and b > T:
        wr[max(0, t - T - 4):max(0, b - T + 4), max(0, l - L - 4):max(0, r - L + 4)] = True
ring = ndimage.binary_dilation(wr, iterations=6) & ~wr
fl, fn = ndimage.label(ca, structure=np.ones((3, 3)))
cd = ImageDraw.Draw(crop)
for i, sl in enumerate(ndimage.find_objects(fl), start=1):
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    if h < 90 and w < 60 and (fl[sl] == i).sum() < 700 and (ring[sl] & (fl[sl] == i)).any():
        cd.rectangle([sl[1].start - 1, sl[0].start - 1, sl[1].stop, sl[0].stop], fill="white")
crop.save(out)
print(json.dumps({"bbox": [L, T, R, B], "size": [R - L, B - T], "whited_words": whited, "ink_regions": len(regions),
                  "column_x": col_x, "picture_options": picture_opts}))
