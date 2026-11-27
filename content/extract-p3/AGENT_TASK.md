# Task for one batch of P3 papers

For EACH paper folder named in your batch (in /tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/p3/work/<folder>), in order:

1. Structuring: follow /tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/p3tools/SPEC.md exactly. Folder `<year>_<School>` ↔ PDF `p3/pdfs/<year>-P3-Maths-EOY-<School>.pdf`; ids `{year}_P3_{School}_EOY_Q{NN}` with School exactly as in the folder name. Reference example of a finished paper: p3/work/2025_HenryPark/questions.json (match its style).
   School display names: ACSJ = ACS (Junior); ACSP = ACS (Primary); AiTong = Ai Tong; CatholicHigh = Catholic High; CHIJTP = CHIJ (Toa Payoh); HenryPark = Henry Park; MahaBodhi = Maha Bodhi; MGS = Methodist Girls'; NanHua = Nan Hua; Nanyang = Nanyang; Northland = Northland; PeiChun = Pei Chun Public; PeiHwa = Pei Hwa Presbyterian; PLMGS = Paya Lebar Methodist Girls'; Raffles = Raffles Girls'; RedSwastika = Red Swastika; Rosyth = Rosyth; Rulang = Rulang; SCGS = Singapore Chinese Girls'; StHilda = St. Hilda's; StJoseph = St. Joseph's Institution Junior; StNicholas = St. Nicholas Girls'; TaoNan = Tao Nan. (Use the paper's own cover if it says otherwise.)
   Some papers use different section layouts (Booklet A/B, Paper 1/2, Part I/II): record `section` as printed and question_type by format (MCQ/short/long). If a PDF holds two papers (e.g. Paper 1 then Paper 2, each numbered from 1), make question numbers unique by continuing the count and say so in report.md.
   If the answer key is missing from the PDF, solve every question yourself, set answer_check "solved: no key" and confidence accordingly.
2. Figures: run `python3 -I /tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/p3tools/crop_paper.py <folder path>`, then make a contact sheet with `python3 -I /tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/p3tools/sheet.py` (read its usage line first) and LOOK at it once. Fix only wrong `has_figure` flags or wrong source_pdf_page in questions.json and re-run; do NOT edit the cropper. List any crop that is still wrong (cut-off figure, missing label, leftover question text, wrong picture) in report.md under "Crop problems" with the question id.
3. Write report.md (counts, answer disagreements, unresolved doubts, pages opened, crop problems).

Efficiency: work from text.md; open page images only for specific doubts. Don't create files other than questions.json, report.md, figures/ and figures.json in each folder. No network, no writes anywhere else.

Reply at the end with one line per paper: folder, questions, figures, key disagreements, crop problems, low-confidence count.
