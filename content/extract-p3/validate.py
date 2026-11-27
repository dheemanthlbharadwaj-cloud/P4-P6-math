"""Checks every paper's questions.json and finds duplicate papers (same exam posted under two years/schools).

  python3 -I validate.py <work dir>      → prints problems; writes <work dir>/../validation.json

Per record: required fields, id = {year}_P3_{School}_EOY_Q{NN} matching its folder, question_no unique and 1..N without
gaps, MCQ has 4 options + answer_key 1-4, free response has an answer, topic in the 11 P3 topics, no plain "$" (currency
must be ＄), has_figure questions have a crop file. Duplicates: papers whose question texts mostly coincide.
"""
import json, os, re, sys
from difflib import SequenceMatcher

TOPICS = {"Whole Numbers", "Addition and Subtraction", "Multiplication and Division", "Money", "Length, Mass and Volume",
          "Time", "Fractions", "Area and Perimeter", "Angles", "Perpendicular and Parallel Lines", "Bar Graphs"}
work = sys.argv[1]
problems, papers = {}, {}
for folder in sorted(os.listdir(work)):
    qf = os.path.join(work, folder, "questions.json")
    if not re.match(r"^\d{4}_", folder) or not os.path.isdir(os.path.join(work, folder)):
        continue
    if not os.path.exists(qf):
        problems[folder] = ["NOT STRUCTURED"]; continue
    try:
        qs = json.load(open(qf))
    except Exception as e:
        problems[folder] = [f"BAD JSON: {e}"]; continue
    year, school = folder.split("_", 1)
    p = []
    nums = []
    for q in qs:
        n = q.get("question_no"); nums.append(n)
        want = f"{year}_P3_{school}_EOY_Q{int(n):02d}" if isinstance(n, int) else None
        if q.get("id") != want: p.append(f"id {q.get('id')} != {want}")
        if q.get("grade") != "P3" or str(q.get("year")) != year: p.append(f"{q.get('id')}: grade/year")
        if q.get("topic_primary") not in TOPICS: p.append(f"{q.get('id')}: topic {q.get('topic_primary')!r}")
        if not (q.get("question") or "").strip(): p.append(f"{q.get('id')}: empty question")
        if q.get("question_type") == "mcq":
            if len(q.get("options") or {}) != 4: p.append(f"{q.get('id')}: options {len(q.get('options') or {})}")
            if str(q.get("answer_key")) not in "1234" or not q.get("answer_key"): p.append(f"{q.get('id')}: answer_key {q.get('answer_key')!r}")
        elif not (str(q.get("answer") or "").strip() or q.get("answer_parts")):
            p.append(f"{q.get('id')}: no answer")
        shown = {k: q.get(k) for k in ("question", "question_parts", "options", "answer", "answer_parts", "unit")}
        blob = json.dumps(shown, ensure_ascii=False)  # only what students see (not ocr_fixes notes)
        if re.search(r"(?<![\\＄])\$(?=\s?\d)", blob): p.append(f"{q.get('id')}: plain $ before a number (use ＄)")
        if q.get("has_figure") and not os.path.exists(os.path.join(work, folder, "figures", f"{q.get('id')}.png")):
            p.append(f"{q.get('id')}: figure missing")
    ints = [n for n in nums if isinstance(n, int)]
    if len(set(ints)) != len(nums): p.append("duplicate/invalid question numbers")
    if ints and sorted(set(ints)) != list(range(1, max(ints) + 1)): p.append(f"gaps in numbering (max {max(ints)}, have {len(set(ints))})")
    papers[folder] = qs
    if p: problems[folder] = p

# duplicate papers: compare the first 10 question texts
def sig(qs): return " ".join(re.sub(r"\W+", " ", (q.get("question") or "").lower()) for q in sorted(qs, key=lambda q: q.get("question_no") or 0)[:10])
names = sorted(papers); sigs = {n: sig(papers[n]) for n in names}
dups = []
for i, a in enumerate(names):
    for b in names[i + 1:]:
        r = SequenceMatcher(None, sigs[a], sigs[b]).ratio()
        if r > 0.8: dups.append([a, b, round(r, 2)])
json.dump({"problems": problems, "duplicates": dups, "papers": len(papers),
           "questions": sum(len(v) for v in papers.values())}, open(os.path.join(work, "..", "validation.json"), "w"), indent=1)
for k, v in problems.items():
    print(f"{k}: {len(v)} problem(s): " + "; ".join(v[:6]) + (" ..." if len(v) > 6 else ""))
print("duplicates:", dups)
print(f"{len(papers)} papers, {sum(len(v) for v in papers.values())} questions, {sum(len(v) for v in problems.values())} problems")
