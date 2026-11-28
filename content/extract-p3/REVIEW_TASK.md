# Answer review (owner asked: review and fix every flagged question yourself)

Paper folders: /tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/p3/work/<paper>/
The flagged question ids per paper are in p3/review_plan.json → "by_paper"["<paper>"].
Each question in questions.json has source_pdf_page, answer_check, confidence; pages/pNN.png are 300-dpi page images
(answer-key pages are near the end of the PDF; index.json marks them kind "answers").

For EVERY flagged question in your papers:
1. Open the question's page image (and the figure crop figures/<id>.png or its figure_ref) and read the question
   exactly. Fix the question text / options if they were mis-read.
2. Solve it yourself carefully, from the image (read scales, graphs, clocks, grids directly).
3. Open the answer-key page and read the key's entry for it (if the paper has a key).
4. Decide the final answer:
   - key and your solution agree → that answer; confidence "high"; answer_check "ok (reviewed)".
   - they disagree → re-check both; the answer that is mathematically right for the question AS PRINTED wins (P3 keys
     do contain errors). answer_check "reviewed: key says X, correct is Y because ..." ; confidence "high" if certain.
   - truly undecidable from the scan (illegible) → best reading, confidence "medium", answer_check explains why.
   - drawing questions (answer is a drawing): give a precise text answer a student can be checked against
     (e.g. "line through C parallel to AB, passing through (x,y) grid points ..." or the count, e.g. "3 right angles marked
     at B, D, E") and set "answer_type": "drawing".
5. Write the decision into questions.json (answer / answer_key / answer_parts / unit / answer_check / confidence /
   question / options as needed). Keep all other fields. Keep currency ＄ and maths $...$ as in the existing records.

Add a "## Answer review" section to the paper's report.md listing each reviewed id: final answer, what changed, why.
Don't edit other papers' files. Helper scripts go in your own folder scratchpad/rv<batch>/.
Reply with: per paper, reviewed count, answers changed (id: old → new), still uncertain.
