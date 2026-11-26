# P3 question extraction: record format and the structuring step

Owner decisions (26 Nov 2026): papers = P3 End-of-Year (SA2) exams 2021-2026 from sgtestpaper.com (P3 has no prelims;
2020 has none there; 2026 not yet uploaded); ids `{year}_P3_{School}_EOY_Q{NN}`; the 11 P3 topics below; P3 goes into
its OWN Firestore collection `questions_p3` in the editor project (the P6 `questions` collection and the game's P6 sync
stay untouched). Pipeline: download_all.sh → ocr_index.py (tesseract + page/question index, no model calls) →
structuring agent per paper (this spec) → crop_paper.py (deterministic figure crops: labels kept, intruding question
text whited out, never over-cropped) → review contact sheets (sheet.py) → bank write with --dry first + undo manifest.

Input per paper (made by ocr_index.py, no model calls):
- `text.md`: the whole paper's OCR, `## page N (kind, section)` blocks, each line `[y<px>] text`.
- `index.json`: `questions["<n>"] = {page, section, y0, y1}` (page band in 300-dpi pixels) and `check[]`
  (OCR-corrected numbers, missing numbers with the pages they fall between, repeats). Answer-key pages have kind `answers`.
- `pages/pNN.png`: 300-dpi page images (2480 x 3508). Open a page image ONLY to resolve a specific doubt (garbled
  maths, fractions, a missing question from `check`, an answer that doesn't solve); never read the whole paper as images.

## Output: `questions.json` = array of records

```
{
  "id": "2025_P3_HenryPark_EOY_Q04",        // {year}_P3_{School}_EOY_Q{NN}, NN two digits, School = CamelCase as in the PDF name
  "grade": "P3", "year": "2025", "school": "Henry Park", "exam": "EOY",
  "source": "(Henry Park) (EOY) (2025)", "source_pdf": "<pdf file name>", "source_pdf_page": 3,
  "section": "A",                            // as printed: A = MCQ, B = short answer, C = long answer
  "question_no": 4, "marks": 1,              // marks from the section instructions or "[2]" on the question
  "question_type": "mcq" | "short" | "long", // A → mcq; B → short; C → long
  "question": "What is the amount of water shown in the beaker below?",
  "question_parts": [{"part": "a", "text": "..."}],          // only when the question has (a)/(b) parts
  "options": {"1": "410 mℓ", "2": "420 mℓ", "3": "450 mℓ", "4": "490 mℓ"},   // MCQ only
  "answer_key": "1",                          // MCQ: the option number from the answer key
  "answer": "26",                             // free response: final answer value only (no working)
  "unit": "mℓ",
  "answer_parts": [{"part": "a", "value": "975", "unit": ""}],
  "topic_primary": "<one of the P3 topics below>", "topics": ["..."],
  "has_figure": true,                        // the question needs its picture/diagram/table/graph to be answered or understood
  "figure_note": "beaker with scale to 500 mℓ",               // what the figure shows, a few words (helps the crop check)
  "ocr_fixes": ["'threes hundred' → 'three hundred'", "Q1 number read as 4"],  // every change from the raw OCR, short
  "checked_against_image": [3],              // pages whose image you opened for this question
  "answer_check": "ok" | "solved:<value> differs from key" | "unsure: <why>",
  "confidence": "high" | "medium" | "low"
}
```

Text rules (same as the P6 bank): currency is fullwidth `＄` (never `$`); maths that needs it uses `$...$` LaTeX
(`$\frac{3}{4}$`, `$\times$`, `$\div$`), plain numbers stay plain; litres/millilitres `ℓ`/`mℓ`; keep the wording exactly
as printed apart from OCR fixes; no "Ans:" lines, mark boxes, "Do not write in this space" or page footers.

## P3 topics (owner-approved 26 Nov 2026; fixed list, never add a 12th)
Whole Numbers; Addition and Subtraction; Multiplication and Division; Money; Length, Mass and Volume; Time; Fractions;
Area and Perimeter; Angles; Perpendicular and Parallel Lines; Bar Graphs.
`topic_primary` = the main skill; `topics` = all skills actually needed (more than one only when really needed).

## Steps for the structuring agent (per paper)
1. Read `text.md` and `index.json` once. Map every question number 1..N (N from the section instructions) to its text.
   Resolve each `check` entry (missing/repeat) from the text around the given pages; open that page image only if the
   text can't settle it.
2. Write each record from the OCR text, fixing OCR errors. Flag anything that doesn't make sense (a number that can't be
   right, a garbled fraction, an option that repeats, units that don't match) and fix it by opening ONLY that
   question's page image (`index.json` gives the page).
3. Answers: from the answer-key pages (kind `answers`). Then solve every question yourself; if your answer differs from
   the key, open the question's page image and the key's page, decide, and record it in `answer_check`.
4. `has_figure`: from the question text ("shown below", "the figure", "the picture", "the table", "the graph",
   a measuring scale, a clock face...) and confirmed by the page band; the crop itself is made by crop_figure.py.
5. Output `questions.json` and a short `report.md`: counts, every unresolved doubt, pages opened.
