"""Step 1 of the P3 extraction pipeline: render + OCR + index (cheap, no model calls).

  python3 -I ocr_index.py <paper.pdf> <outdir>

Writes to <outdir>:
  pages/p{NN}.png        300 dpi page renders (figure crops are cut from these)
  ocr/p{NN}.tsv          tesseract word boxes (left, top, width, height, conf, text, line ids)
  text.md                the whole paper as text, one "## page N" block per page, lines prefixed with their y (px)
  index.json             {pages:[{page, kind, section, questions:[{q, y0, y1}]}], questions:{"<section>:<q>": {page, y0, y1, page_end}}}
                         kind = cover | questions | answers | blank; y0/y1 = vertical band of the question on its page
The index lets later steps open only the page band of a question (fixes, figure crops) instead of the whole paper.
"""
import csv, io, json, os, re, subprocess, sys
import pymupdf

pdf, out = sys.argv[1], sys.argv[2]
os.makedirs(f"{out}/pages", exist_ok=True)
os.makedirs(f"{out}/ocr", exist_ok=True)
DPI = 300

QNUM = re.compile(r"^\(?(\d{1,2})[\.\),]?$")  # a question number as the first word of a line ("12", "12.", "(12)")
SECTION = re.compile(r"\b(section|booklet|part)\s*([abc]|[123])\b", re.I)
ANSWERS = re.compile(r"\b(answer\s*key|answers|marking\s*scheme|ans\s*key)\b", re.I)

doc = pymupdf.open(pdf)
pages, text_blocks = [], []
section = None
for i, page in enumerate(doc, start=1):
    png = f"{out}/pages/p{i:02d}.png"
    if not os.path.exists(png):
        page.get_pixmap(dpi=DPI).save(png)
    tsv_path = f"{out}/ocr/p{i:02d}.tsv"
    if not os.path.exists(tsv_path):
        tsv = subprocess.run(["tesseract", png, "stdout", "--psm", "4", "tsv"], capture_output=True, text=True).stdout
        open(tsv_path, "w").write(tsv)
    rows = [r for r in csv.DictReader(io.StringIO(open(tsv_path).read()), delimiter="\t", quoting=csv.QUOTE_NONE) if r.get("text", "").strip()]
    # group words into lines
    lines = {}
    for r in rows:
        key = (r["block_num"], r["par_num"], r["line_num"])
        lines.setdefault(key, []).append(r)
    line_list = []
    for words in lines.values():
        words.sort(key=lambda w: int(w["left"]))
        top = min(int(w["top"]) for w in words)
        bottom = max(int(w["top"]) + int(w["height"]) for w in words)
        left = int(words[0]["left"])
        line_list.append({"y": top, "y1": bottom, "x": left, "words": [w["text"] for w in words],
                          "conf": sum(float(w["conf"]) for w in words) / len(words)})
    line_list.sort(key=lambda l: (l["y"], l["x"]))
    full = " ".join(" ".join(l["words"]) for l in line_list)
    width = page.rect.width * DPI / 72
    qlines = sum(1 for l in line_list if re.match(r"^Q\d{1,2}\b", l["words"][0]))
    kind = "blank" if len(full) < 40 else ("answers" if (ANSWERS.search(full) or qlines >= 3) and i > len(doc) * 0.5 else "questions")
    if i == 1 and re.search(r"\b(name|class|index|duration|instructions?)\b", full, re.I):
        kind = "cover"
    m = SECTION.search(full)
    if m and kind == "questions":
        section = m.group(2).upper()
    qs = []
    if kind == "questions":
        # the page's own left margin (scans are offset differently): the 5th-percentile x of its text lines
        xs = sorted(l["x"] for l in line_list)
        margin = xs[len(xs) // 20] if xs else 0
        # word level: tesseract sometimes puts the number on its own line, or after the stem's first words
        seen = set()
        for r in sorted(rows, key=lambda r: int(r["top"])):
            mq = QNUM.match(r["text"].strip())
            x, y = int(r["left"]), int(r["top"])
            if mq and x < margin + 120 and 1 <= int(mq.group(1)) <= 60 and not any(abs(y - t) < 40 for t in seen):
                seen.add(y)
                qs.append({"q_ocr": int(mq.group(1)), "y0": y})
        for a, b in zip(qs, qs[1:] + [None]):
            a["y1"] = (b["y0"] - 10) if b else int(page.rect.height * DPI / 72)
    pages.append({"page": i, "kind": kind, "section": section, "questions": qs, "mean_conf": round(sum(l["conf"] for l in line_list) / max(1, len(line_list)), 1)})
    text_blocks.append(f"## page {i} ({kind}{', section ' + section if section else ''})\n" + "\n".join(f"[y{l['y']}] {' '.join(l['words'])}" for l in line_list))

# question index. OCR misreads digits (seen: "1" read as "4": 1→4, 13→43, 16→46, 19→49), so each number read is
# corrected to the candidate (the read value, or with 4→1 / 7→1 swaps) closest to previous+1 that keeps numbers rising.
# Corrections, missing numbers (gaps) and repeats go to "check" for the reviewing agent, which finds them via text.md.
import itertools
def candidates(v):
    s = str(v); out = {v}
    for bad in ("4", "7"):
        idx = [i for i, c in enumerate(s) if c == bad]
        for k in range(1, len(idx) + 1):
            for combo in itertools.combinations(idx, k):
                t = "".join("1" if i in combo else c for i, c in enumerate(s))
                if int(t) > 0: out.add(int(t))
    return out
index, prev, check = {}, 0, []
for p in pages:
    for q in p["questions"]:
        ok = [c for c in candidates(q["q_ocr"]) if c > prev]
        if not ok:
            check.append({"issue": "repeat/out of order", "ocr_read": q["q_ocr"], "page": p["page"], "y": q["y0"]}); q["q"] = None; continue
        n = min(ok, key=lambda c: abs(c - (prev + 1)))
        if n != q["q_ocr"]: check.append({"issue": "corrected", "ocr_read": q["q_ocr"], "q": n, "page": p["page"]})
        for missing in range(prev + 1, n): check.append({"issue": "missing", "q": missing, "between_pages": [index.get(str(prev), {}).get("page"), p["page"]]})
        q["q"] = prev = n
        index[str(n)] = {"page": p["page"], "section": p["section"], "y0": q["y0"], "y1": q["y1"]}

open(f"{out}/text.md", "w").write("\n\n".join(text_blocks))
json.dump({"pdf": os.path.basename(pdf), "dpi": DPI, "pages": pages, "questions": index, "check": check}, open(f"{out}/index.json", "w"), indent=1)
print(json.dumps({"pages": len(pages), "kinds": {k: sum(p["kind"] == k for p in pages) for k in ("cover", "questions", "answers", "blank")},
                  "questions_indexed": len(index), "number_mismatches": len(check), "low_conf_pages": [p["page"] for p in pages if p["mean_conf"] < 70]}))
