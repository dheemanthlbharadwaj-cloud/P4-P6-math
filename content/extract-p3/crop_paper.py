"""Crops every has_figure question of one paper:
  python3 -I crop_paper.py <workdir> [questions.json] [--no-index]      (default <workdir>/questions.json; also needs index.json, ocr/)

Band of a question = from its start line to the next question's start line on the same page (or the page end).
A question's start comes from index.json (the number the OCR read) or, when the index missed the number, from the
question's OWN TEXT: the start of the extracted text is matched against the OCR lines of its source_pdf_page.
Starts are taken for every question of the paper (not only figure ones) so the next question always closes the band."""
import csv, difflib, io, json, os, re, subprocess, sys
W = sys.argv[1].rstrip("/"); F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crop_figure.py")
args = [a for a in sys.argv[2:] if not a.startswith("--")]
qfile = args[0] if args else f"{W}/questions.json"
NO_INDEX = "--no-index" in sys.argv      # test switch: ignore index.json, find every band from the question text
qs = json.load(open(qfile)); idx = json.load(open(f"{W}/index.json"))["questions"]
PAGE_H = 3508
norm = lambda s: re.sub(r"[^a-z0-9 ]", "", re.sub(r"\$|\\[a-z]+|[{}]", " ", s.lower())).split()

def ocr_lines(page):
    """[(y_top, text_tokens)] of one page; a leading question number ("4." / "(4)") is dropped from the tokens"""
    try: txt = open(f"{W}/ocr/p{page:02d}.tsv").read()
    except OSError: return []
    L = {}
    for r in csv.DictReader(io.StringIO(txt), delimiter="\t", quoting=csv.QUOTE_NONE):
        if r.get("text", "").strip() and float(r["conf"]) > 0: L.setdefault((r["block_num"], r["par_num"], r["line_num"]), []).append(r)
    out = []
    for ws in L.values():
        ws.sort(key=lambda w: int(w["left"]))
        toks = [w["text"] for w in ws]
        if re.match(r"^\(?\d{1,2}[.,)]$", toks[0]): toks = toks[1:]
        out.append((min(int(w["top"]) for w in ws), norm(" ".join(toks))))
    return sorted(out)

def text_start(q, lines, after):
    """y of the OCR line that best matches the first words of the question's text (ratio >= 0.7), below `after`"""
    target = " ".join(norm(q.get("question", "")))
    best = None
    for y, toks in lines:
        s = " ".join(toks)
        if y <= after or len(s) < 10: continue
        r = difflib.SequenceMatcher(None, s, target[:len(s)]).ratio()
        if r >= 0.7 and (best is None or r > best[0] + 0.02): best = (r, y)
    return best[1] if best else None

# 1) start line of every question, per page
starts = {}   # page -> [(y, question_no)]
for q in sorted(qs, key=lambda q: q["question_no"]):
    page = q.get("source_pdf_page"); b = idx.get(str(q["question_no"]))
    if b and not NO_INDEX and (page is None or b["page"] == page):
        page, y = b["page"], b["y0"]; how = "index"
    elif page:
        prev = max([y for y, n in starts.get(page, []) if n < q["question_no"]] or [0])
        y = text_start(q, ocr_lines(page), prev - 1); how = "text"
    else: continue
    if y is not None: starts.setdefault(page, []).append((y, q["question_no"])); q["_how"] = how
    q["_page"], q["_y"] = page, y

os.makedirs(f"{W}/figures", exist_ok=True)
res = {}
for q in qs:
    if not q.get("has_figure"): continue
    page, y = q.get("_page"), q.get("_y")
    ys = sorted(s for s, n in starts.get(page, []) if y is None or s > y + 5)
    y0 = max(0, y - 10) if y is not None else 0                      # unknown start: from the page top
    y1 = (ys[0] - 10) if ys else PAGE_H
    txt = " ".join([q.get("question", "")] + [p.get("text", "") for p in q.get("question_parts") or []] + [v for v in (q.get("options") or {}).values() if v != "[figure]"])
    open(f"{W}/figures/.t", "w").write(txt)
    # MCQ options that are pictures ("[figure]" / empty) vs real option text
    ov = [str(v).strip() for v in (q.get("options") or {}).values()]
    opts = "picture" if ov and all(v in ("", "[figure]") for v in ov) else ("text" if ov else "auto")
    r = subprocess.run(["python3", "-I", F, W, str(page), str(y0), str(y1), f"{W}/figures/{q['id']}.png", "--text", f"{W}/figures/.t", "--opts", opts], capture_output=True, text=True)
    try: res[q["id"]] = json.loads(r.stdout)
    except Exception: res[q["id"]] = {"error": (r.stderr or r.stdout)[-300:]}
    res[q["id"]]["page"] = page; res[q["id"]]["band"] = [y0, y1]; res[q["id"]]["band_from"] = q.get("_how", "none")
os.remove(f"{W}/figures/.t")
json.dump(res, open(f"{W}/figures.json", "w"), indent=1)
for k, v in res.items(): print(k.split("_")[-1], v.get("bbox"), "band", v["band"], v["band_from"], "whited:", len(v.get("whited_words", [])), v.get("error", "")[:200])
