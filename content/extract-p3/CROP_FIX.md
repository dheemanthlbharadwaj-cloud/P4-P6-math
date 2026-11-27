# Crop-fix pass (per paper)

Folder: /tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/p3/work/<paper>
Tools: /tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/p3tools/manual_crop.py (read its docstring), sheet.py.
Inputs: questions.json, figures/<id>.png, report.md ("Crop problems" lists known bad crops), pages/pNN.png.

Goal: every question that needs a picture has a correct one. A correct crop (owner's rules):
- contains the WHOLE figure and ALL its labels (titles, axes, legends, table cells, captions, measurements, option
  labels (1)–(4) of picture options, point letters). Never cut a figure or a label; never white out figure lines.
- contains no question text, no other question's content, no "Ans:" lines, mark boxes, footers, page numbers or the
  "Do not write in this space" column. Text that sits INSIDE the figure's box and isn't part of the figure is whited
  out with --white boxes rather than cropping tighter.
- trimmed to the figure plus a small margin (no big empty areas).

Steps:
1. Make a contact sheet of all figures (sheet.py) and look at it together with report.md's crop problems.
2. Re-check has_figure for every question: a question needs a figure if it can't be answered/understood without it
   (pictures, diagrams, graphs, tables, grids, clocks, scales, number lines, picture options). Turn has_figure back
   on where an earlier step turned it off only because the crop was bad. If the figure is genuinely already in the text
   (an equation, a vertical sum written out in the question) leave it off.
3. Shared figures: when several questions use one printed figure (e.g. a graph for Q32–Q33), crop it once under the
   FIRST question's id and set on the others `"figure_ref": "<first question id>"` with has_figure true (no own file).
4. Fix every bad or missing crop with manual_crop.py: `grid` the question's band, read the exact box from the grid,
   `crop` to figures/<id>.png (with --white boxes only for non-figure text inside the box), then LOOK at the result
   and adjust until correct. Good crops from the automatic cropper stay as they are.
5. Update figures.json: for each figure id, {"bbox": [...], "page": n, "manual": true|false, "whited": [...]}.
6. Finish with a fresh contact sheet and look at it once; every crop must pass the rules above.
7. Append a "## Crop fix" section to report.md: crops fixed, figure_refs added, has_figure changes, anything still
   imperfect (only scan quality issues are acceptable, e.g. faint or watermarked figures).

Don't change any other field of questions.json; don't touch other folders; keep helper scripts out of the paper folder.
Reply with one line per paper: crops checked, fixed, figure_refs, has_figure changes, still imperfect.
