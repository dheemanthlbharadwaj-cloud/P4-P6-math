# Figure cut-off audit, 2026-10-16

Testers reported question figures that are cut off at the image edge, mostly in Angles. Scope: every figure with an image in the
P6 bundle (1,644), chapter by chapter: Angles first, then Triangles/Squares/Rectangles, then all other chapters. All chapters are done.
Old images ("before") in all sheets are the images the app ships (`apps/mobile/assets/content/P6/figures/<id>.webp` at HEAD).

## Method
1. Local inputs only: bundle `apps/mobile/assets/content/P6/questions.json`, current figures in `content/raw/P6/figures/`, editor
   snapshot for `source_pdf_url` / `source_pdf_page`. 105 source PDFs were downloaded from Cloudinary (public raw files);
   nothing was read from or written to Firestore or Cloudinary.
2. Candidates: ink pixels within 3 px of an image edge (all four sides). Every candidate was then reviewed by eye on
   before/after sheets next to the stem. The OCR letter check (pytesseract) was too noisy on scans to be useful, so as well
   as the edge candidates **all non-candidate figures of both chapters were also looked at by eye** (contact sheets), which
   caught 5 more problems (blank/wrong/cut figures with no ink at the border).
3. Re-cut: located the old figure on the source page by OpenCV template matching (multi-scale, 50 dpi pages), re-rendered at
   170 dpi with PyMuPDF, grew the crop to every ink component that crosses the old crop border, dropped page-frame lines and
   stray stem/option text, trimmed to ink + 10 px. Where the automatic pass was unreliable (stem text picked up, matching
   offset, multi-page figure), the crop was placed by hand from the page at 170 dpi. Every final image was checked by eye
   against the old one.
4. Results are saved to `content/recrops/P6/<questionId>.png` and copied to `content/raw/P6/figures/<id>.png` (spaces in ids
   become `_` in the raw file name, as already used there). No commit, no content build/sync, no apply-recrops.

## Counts
| Chapter | Figures checked | Edge-touch candidates | Confirmed cut / wrong / blank (fixed) |
|---|---|---|---|
| Angles in Geometrical Figures | 357 | 190 | 110 |
| Triangles, Squares, Rectangles | 179 | 91 | 48 |
| Numbers to 10 Million | 44 | 24 | 11 |
| Algebra | 22 | 10 | 4 |
| Four Operations of Whole Numbers | 42 | 20 | 8 |
| Fractions | 67 | 33 | 20 |
| Decimals | 110 | 64 | 31 |
| Percentage | 87 | 55 | 18 |
| Circles | 175 | 86 | 40 |
| Volume | 210 | 98 | 63 |
| Data Representation | 274 | 127 | 48 |
| Ratio and Rate | 77 | 43 | 19 |
| **Total** | **1,644** | 841 | **420** |

All chapters were reviewed by eye, candidates (before/after sheets) and non-candidates (contact sheets). Chapters after the
first two are listed below the first two tables, one section each, with their fixed ids. Pre-existing verified recrops
(185 from the earlier session) were not changed; `2021_AITONG_P1_Q30` was briefly overwritten by this audit and has been restored
to the committed version.

## Fixed: Angles in Geometrical Figures (110)
| Question id | What was missing / wrong |
|---|---|
| `2021_CATHOLIC_P2_Q13` | top (B, A) and left (D, C) of parallelogram cut off |
| `2021_HENRY_P2_Q09` | label B (top) and z (bottom) missing, figure clipped |
| `2021_MGS_P2_Q02` | point E (end of GE) cut off at right |
| `2021_MGS_P2_Q06` | left part (S, left vertices) cut off |
| `2021_MGS_P2_Q15` | WRONG figure (another question rectangle); correct figure re-cut |
| `2021_NANHUA_P2_Q04` | point C and lower part of line AC missing (cut at bottom) |
| `2021_NANYANG_P2_Q05` | point J cut off at bottom-left |
| `2021_Rosyth_P1A_Q06` | label D clipped at bottom |
| `2021_STNICHOLAS_P2_Q15` | left side cut (52 deg label, P, N clipped) and page frame line included; manual re-cut |
| `2021_TAO_NAN_P2_Q09` | top vertex Q and bottom P, R labels clipped |
| `2021_Tao_Nan_P1A_Q09` | parallel lines and transversal run off the edges (cut at left, right, bottom) |
| `2022_ACSJ_P1_Q29` | top labels A, E, B and bottom D clipped; manual re-cut |
| `2022_ACSJ_P2_Q7` | top of figure (C, E and apex lines) cut off |
| `2022_Henry_P2_Q4` | labels S and R clipped at bottom |
| `2022_Henry_P2_Q5` | label V clipped at left; auto re-cut picked up stem text, manual crop |
| `2022_MGS_P1_Q23` | figure missing entirely (old image blank); re-cut from PDF |
| `2022_Nan_Chiau_P1_Q28` | right half cut (points A, E, F, 45 deg missing); manual re-cut |
| `2022_Nan_Chiau_P2_Q8` | point Q cut off at top; also drop "Find angle RSU" text line that is in old image |
| `2022_Nan_Hua_P1_Q20` | top (A, B, y) and right part of trapezium cut off |
| `2022_Nan_Hua_P1_Q28` | top and right of square (A, B, C edges) cut off |
| `2022_Nan_Hua_P1_Q30` | top vertex B and right squares (H, E, J) cut off |
| `2022_Nan_Hua_P2_Q4` | labels A, C at top and F at bottom clipped; right side of H-D cut |
| `2022_Nan_Hua_P2_Q9` | top (A, F, 70 deg) cut off |
| `2022_Nanyang_P1A_Q05` | point D (end of line B-A-D) and top of vertical line at E cut off (the reported example) |
| `2022_Nanyang_P2_Q15` | label B clipped at left edge; old image also has stem text "as shown below" to remove |
| `2022_Nanyang_P2_Q5` | point E at top cut off |
| `2022_Rosyth_P1_Q30` | top labels B, D and right end E and base line cut off |
| `2022_Rosyth_P2_Q1` | apex N label missing and vertex touches top edge; manual re-cut |
| `2022_Rosyth_P2_Q15` | label T at left and R at right cut off |
| `2022_SCGS_P1_Q30` | label C and left end of semicircle clipped |
| `2022_St_Nicholas_P2_Q11` | top of rhombus cut off (A, B, 256 deg missing) |
| `2022_St_Nicholas_P2_Q4` | labels A and D clipped at top |
| `2022_Tao_Nan_P1_Q28` | point E and base line cut off at bottom-left |
| `2023_ACSJ_P2_Q9` | labels A, G (top) and B, D (bottom) clipped by the image edge |
| `2023_ACSP_P1A_Q03` | line WX cut off at bottom, label X missing |
| `2023_ACSP_P2_Q16` | point C (end of BC) cut off at top; remove "(a) Find angle CBF" text from bottom |
| `2023_AIT_P2_Q3` | top of Figure 2 (a) cut and "Figure 2" caption clipped at bottom; manual re-cut |
| `2023_CHS_P2_Q7` | 260 deg label and D clipped at top |
| `2023_CHS_P2_Q9` | apex A cut off at top and left vertex |
| `2023_Catholic_High_P1A_Q08` | line ends and label T clipped at bottom-right, left end cut |
| `2023_MGS_P1A_Q06` | point B (top-right vertex) cut off at right; stray "80 deg" fragment removed |
| `2023_MGS_P2_Q01` | bottom vertex (C) of measured triangle cut off at bottom; auto re-cut also picks up question number |
| `2023_MarisStella_P1_Q30` | label G clipped at top |
| `2023_Maris_Stella_P1A_Q09` | grid figure cut off at right/bottom (points G, F, E, D, B, C missing) |
| `2023_Maris_Stella_P1A_Q12` | point B (end of line AB) cut off at right |
| `2023_NanHua_P1_Q25` | point E at top cut off |
| `2023_Nanyang_P1A_Q05` | label R clipped at the bottom edge |
| `2023_Nanyang_P1_Q29` | apex B cut off at top |
| `2023_PeiChun_P1_Q18` | WRONG figure (shows Q16/Q17 text instead of the equilateral triangle PAR); re-cut the correct figure from PDF |
| `2023_PeiChun_P1_Q25` | point S and top of rhombus cut off; remove "Find angle QVU" text |
| `2023_Red_Swastika_P1A_Q06` | bottom cut (R, U labels and end of line PR missing) |
| `2023_Temasek_P1_Q22` | top (A, E) and right-hand part (lower part of BF, G, F) cut off; manual re-cut |
| `2023_Temasek_P1_Q24` | point D at bottom-right cut off |
| `2024_ACSJ_P2_Q4` | left vertex of triangle PST and left end of base cut at the left edge |
| `2024_ACSP_P1A_Q09` | point U (top right) cut off |
| `2024_ACSP_P1A_Q12` | bottom of figure cut (D, C, B, F labels missing); stem text trimmed |
| `2024_ACSP_P1_Q21` | point D at bottom-right and end of ED line cut off |
| `2024_ACSP_P2_Q4` | label F clipped at left edge; remove "Ans:" answer line from bottom |
| `2024_ACSP_P2_Q8` | point D (top right) and F (bottom) cut off |
| `2024_Henry_Park_P1A_Q09` | label Z cut off at top |
| `2024_Henry_Park_P1A_Q14` | point B (bottom left) cut off |
| `2024_MGS_P1A_Q14` | label 255 deg clipped at right |
| `2024_MGS_P2_Q3` | label B and left end of base clipped at left |
| `2024_NanHua_P1_Q25` | label E at right clipped |
| `2024_Nan_Hua_P1A_Q13` | label T at right clipped; remove stem text fragment "line. Find x" at top |
| `2024_Nanyang_P1A_Q05` | figure cut at top/right/bottom (B, C, D, E, F missing) |
| `2024_Nanyang_P1A_Q06` | point K and right side of parallelogram cut off |
| `2024_Nanyang_P2_Q15` | label C at top clipped; remove "(a) Find angle AEB" text at bottom |
| `2024_PeiChun_P2_Q1` | top (C) and left (G) cut off; line CE truncated |
| `2024_PeiChun_P2_Q13` | top vertex C cut off; old image also holds "Find angle BED" text; manual re-cut |
| `2024_PeiChun_P2_Q6` | left vertex B and base BC cut off at left; manual re-cut |
| `2024_PeiChun_P2_Q7` | top vertex A cut off |
| `2024_Raffles_P1A_Q09` | point F cut off at left |
| `2024_RedSwastika_P1_Q27` | apex of triangle and right tip of folded figure cut off |
| `2024_Red_Swastika_P1A_Q10` | label P and top-left end of line PQ cut off; manual re-cut |
| `2024_Rosyth_P1A_Q08` | labels P, Q, R clipped at bottom |
| `2024_Rosyth_P1A_Q13` | labels D and C clipped at top |
| `2024_SCGS_P2_Q4` | left part (A, B) cut off; remove "Find" text fragment at top |
| `2024_TaoNan_P1_Q23` | point P (end of line OP) cut off at top |
| `2024_TaoNan_P2_Q8` | point B cut off at right |
| `2025_ACSJ_P1_Q29` | WRONG figure (picture of a toaster/other item); correct figure re-cut |
| `2025_ACSJ_P2_Q3` | labels P and S clipped at bottom |
| `2025_AiTong_P1_Q28` | label A clipped at top |
| `2025_Ai_Tong_P1A_Q14` | shaded triangles cut off at top and left |
| `2025_HenryPark_P1_Q26` | label B clipped at top; remove stray text fragment "are" at top |
| `2025_Henry_Park_P1A_Q07` | label V clipped at right; remove stem text fragments at top |
| `2025_Henry_Park_P1A_Q13` | figure image is blank (clock missing); re-cut the clock from the PDF |
| `2025_Henry_Park_P1A_Q14` | label D clipped at left; remove stem text lines at top |
| `2025_Methodist_Girls_P1A_Q15` | bottom and right of square (C, D, F) cut off; remove stem text line at top |
| `2025_Nan_Hua_P1A_Q12` | figure cut off at top (A, C) and left; auto re-cut also includes the sentences below, trimmed |
| `2025_Nanyang_P1A_Q06` | top of trapezium (A, B) cut off; options below the figure removed |
| `2025_Raffles_Girls_P1A_Q09` | top (E, G, A, B) cut off; text lines below figure to remove |
| `2025_Raffles_Girls_P1A_Q15` | top and left of trapezium cut off; options below removed |
| `2025_RedSwastika_P1_Q27` | WRONG figure (cube solid from another question); correct figure re-cut |
| `2025_Red_Swastika_P1A_Q10` | top of rhombus (A, B, D) cut off; old image holds option text below, must be excluded |
| `2025_Red_Swastika_P1A_Q14` | top of figure (E, A) cut off; option numbers and other question text below must be excluded |
| `2025_Rosyth_P2_Q3` | point F and lower part of square cut off at bottom |
| `2025_StNicholas_P1_Q25` | label A at left and C at top cut off |
| `2026_ACS_P2_Q4` | line DG cut off at right (point G missing) |
| `2026_ACS_P2_Q6` | figure cut on left, top and bottom (D, C and lower triangles missing); manual re-cut |
| `2026_CH_P1_Q30_30` | most of figure cut off (A, E, 22 deg label, left side missing) |
| `2026_HP_P1_22` | label B (end of line AB) clipped at the top edge |
| `2026_MGS_P1_24` | label A at left cut off; auto re-cut includes page frame line, manual re-cut |
| `2026_MGS_P1_25` | top vertices A, B and right part of rhombus cut off |
| `2026_MGS_P2_08` | label 94 deg clipped at top |
| `2026_NY_P1_24` | point E and left end of base cut off at left |
| `2026_NY_P1_25` | label M clipped at the left edge and apex label touching top |
| `2026_RS_P1_29` | point R and left of figure cut off at left |
| `2026_SN_P2_05` | figure cut (labels B, C and bottom of square missing) |
| `2026_SN_P2_15` | label A and left corner of triangle clipped at left |

## Fixed: Triangles, Squares, Rectangles (48)
| Question id | What was missing / wrong |
|---|---|
| `2021_ACS_P1_Q20` | apex B and vertex C missing (cut at top and right) |
| `2021_ACS_P2_Q03` | right side of both figures cut (E, C labels, 67 deg); manual re-cut incl. before/after figures |
| `2021_CATHOLIC_P2_Q09` | labels A, B at top of square ABDE cut off |
| `2022_ACSJ_P2_Q17` | top of both triangles (apex A) cut off |
| `2022_Catholic_P2_Q9` | top of folded figure (S, apex) cut off at top; page frame line removed |
| `2022_Henry_P1_Q30` | label 16 cm clipped at left and apex A cut at top |
| `2022_Henry_Park_P1A_Q07` | top of figure cut off (vertex C, line CA, right-angle mark) |
| `2022_Nan_Hua_P2_Q8` | WRONG figure (shows Q9 parallelogram figure); re-cut the 9-square grid figure from the PDF |
| `2022_Rosyth_P2_Q10` | labels A, X, B clipped at top and C at right |
| `2022_Rosyth_P2_Q12` | top and bottom tips of the pinwheel figure cut off |
| `2022_SCGS_P1_Q23` | extension of line through B cut at the top edge |
| `2022_SCGS_P2_Q15` | left side (A), bottom (D) and right triangle EFG (17 cm, F) cut off |
| `2022_Tao_Nan_P2_Q3` | label "1 unit" clipped at the bottom edge |
| `2023_ACSJ_P1A_Q07` | right part cut off (vertex C and 3 cm label missing) |
| `2023_ACSJ_P1_Q18` | label "cm" clipped at left; ruler runs off the right edge |
| `2023_AIT_P2_Q14` | label T clipped at the right edge |
| `2023_AIT_P2_Q5` | large cut: top (F, A, B), left and bottom (D, C) of rectangle ABCD missing |
| `2023_MarisStella_P2_Q05` | "1 m wide path" label clipped at left; check manual |
| `2023_Pei_Chun_P1A_Q04` | left (F) and bottom (E) of the grid cut off |
| `2024_ACSJ_P2_Q14` | logo cut off at top (top petal), left and bottom (dashed base line); manual re-cut to avoid stem/margin text |
| `2024_ACSP_P1_Q19` | apex of the shaded triangle cut off at top |
| `2024_ACSP_P2_Q2` | top of the shaded path border cut off (A, B labels) |
| `2024_Catholic_High_P2_Q12` | right/bottom of Figure 2 and left of "8 cm" labels cut off; stem fragment removed |
| `2024_Nanyang_P1A_Q04` | bottom of grid and lower end of line EF (label F) cut off |
| `2024_Pei_Chun_P1A_Q02` | right side (B, line BC) and left of the grid cut off |
| `2024_Raffles_P1A_Q13` | "24 cm" label clipped at the bottom |
| `2024_Raffles_P1A_Q15` | top of Figure 2 (upper parallelogram) cut off |
| `2024_RedSwastika_P1_Q20` | left side (label "x cm") and lower-left vertex cut off |
| `2024_RedSwastika_P2_Q3` | top of the figure cut off; stem fragment "area" removed |
| `2024_SCGS_P2_Q5` | top of the square (labels A, B) cut off |
| `2024_TaoNan_P1_Q28` | WRONG figure (stem text only); check PDF for the actual figure |
| `2024_Tao_Nan_P1A_Q12` | "12 cm" label clipped at the right edge |
| `2025_NanHua_P1_Q20` | WRONG figure (compass diagram of another question); re-cut the triangle from PDF |
| `2025_NanHua_P2_Q11` | right corner of the square and top/bottom tips of the triangle cut off |
| `2025_Nan_Hua_P1A_Q04` | top of grid figure cut off (A..E), image included answer options |
| `2025_Nan_Hua_P1A_Q06` | WRONG figure (neighbouring question text); real figure re-cut |
| `2025_Nanyang_P1A_Q04` | top of the grid (labels A, B, F) cut off; answer options below removed |
| `2025_RafflesGirls_P1_Q26` | top "12 cm" arrow and left side (A, D) cut off |
| `2025_RafflesGirls_P2_Q17` | bottom of figure (label H and the lower edge) cut off |
| `2025_Tao_Nan_P1A_Q15` | WRONG figure ("End of Booklet A" only); re-cut the figure of three right-angled triangles |
| `2026_ACS_P2_Q3` | labels R and Q clipped at the top edge |
| `2026_CH_P2_Q7_07` | double arrow above the top pins clipped at the top edge |
| `2026_MGS_P1_26` | left and top of the figure cut off (left square, labels); page frame line removed |
| `2026_RG_P1_30` | "13 cm" label clipped at the right edge |
| `2026_RG_P2_05` | bottom labels F, E and bottom edge of square cut off |
| `2026_Raffles_Girls_P1A_Q18` | top of Figure 2 cut off; stem fragment removed |
| `2026_St_Nicholas_P1A_Q18` | bottom of Figure 2 cut off; stem fragments removed |
| `2026_TN_P1_25` | labels "7 cm", "8 cm", A, B clipped at top/right |

## Could not fully fix / notes
- `2026_TN_P1_25`: "8 cm" is clipped in the source scan itself (right edge of the page), so the re-cut shows "8 (" like the old image.
- `2024_RedSwastika_P1_Q20`: the left label ("x cm") is clipped in the scan; only "n" survives. Recut is otherwise complete.
- `2023_Nanyang_P1A_Q05`: source figure is tiny, so the re-cut is a little noisier than the old image; nothing is missing now.
- `2025_TaoNan_P2_Q17`: Figure 1 is on the previous PDF page and the old image already contains it, left as is.
- Figures with `figure` ids that contain a space (`2023_St Nicholas_*`) are stored with `_` in `content/raw/P6/figures/`; none of them needed a fix.
- 87 of the angles questions (2024-2026 papers) have `source_pdf_url: null` in the snapshot; their PDFs were found by year and school name
  instead. Every match was checked by eye (low-score matches were located by hand).

## Before / after sheets (old shipped image on the left, new on the right)
Scratchpad folder `/tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/figcut/before_after/`: `angles_*.png`, `triangles_*.png`, and `FIXED_<chapter>_*.png` per chapter. Per-chapter `*_rev_*` and `*_dense_*` sheets are the review sheets (what was looked at).

`/tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/figcut/before_after/angles_000.png` ... `angles_021.png`, `triangles_000.png` ... `triangles_009.png`.

## To apply tomorrow
`cd content && npx tsx scripts/apply-recrops.ts recrops/P6 --dry`, review, then run without `--dry`, then sync and build.
Note `recrops/P6` also contains the 185 earlier verified re-crops, which are untouched and will be re-applied unchanged.


## Chapter: Numbers to 10 Million
Checked 44 figures; 24 edge-touch candidates; **11 confirmed cut / wrong / blank and re-cut** (0 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_numbers_to_10_million_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_CATHOLIC_P1_Q28` | left tip of Figure 1 diamond cut at left edge; page frame line removed |
| `2021_Catholic_High_P1A_Q09` | axis/ticks and "boys" label cut off at bottom, left label clipped |
| `2021_HENRY_P2_Q08` | right end of the tape cut off |
| `2021_MGS_P2_Q16` | WRONG figure (Diagram A/B/C text from another question); Figures 1-4 and the table re-cut |
| `2021_NANYANG_P2_Q03` | right border of the Score column and table frame cut off |
| `2021_SCGS_P1A_Q15` | column headers (Column A-D) clipped at the top |
| `2022_ACSJ_P2_Q5` | table frame cut at left/top/bottom edges |
| `2022_Nan_Chiau_P1A_Q12` | number strip frame cut at the top/left/right; "15th" label and the 1 ... end clipped |
| `2022_SCGS_P1A_Q06` | left side of the scale base clipped (the "8" mark at left) |
| `2024_Rosyth_P2_Q17` | left label "X" and right label "3 cm gap" clipped, Figure 3 caption clipped at the bottom |
| `2024_SCGS_P1A_Q15` | table frame cut at top and right (Row 1 header line, Column D border) |


## Chapter: Algebra
Checked 22 figures; 10 edge-touch candidates; **4 confirmed cut / wrong / blank and re-cut** (0 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_algebra_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_ROSYTH_P1_Q24` | top of the train (chimney/roof) clipped at the top edge; page frame line removed |
| `2022_Nan_Hua_P2_Q2` | label "(2p + 1) cm" clipped at the right edge |
| `2023_PeiChun_P2_Q17` | top of Figure 6 (tallest stack) clipped at the top; right end of table clipped |
| `2024_Henry_Park_P2_Q17` | Figure 4 clipped at the top and right (top row of squares missing) |


## Chapter: Four Operations of Whole Numbers
Checked 42 figures; 20 edge-touch candidates; **8 confirmed cut / wrong / blank and re-cut** (0 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_four_operations_of_whole_numbers_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_AiTong_P1A_Q12` | label "6 cm" clipped at the right edge |
| `2021_AiTong_P1A_Q14` | top vertex P (and line PQ/PR tops) cut off at the top edge |
| `2021_NanChiau_P1A_Q11` | label C clipped at the right edge, label A at the top |
| `2021_SCGS_P1A_Q14` | left part of the star figure cut off (angle b and left arm missing) |
| `2021_STNICHOLAS_P1_Q23` | bottom vertex C of the triangle clipped at the bottom edge |
| `2021_STNICHOLAS_P2_Q17` | box flaps clipped at the top and left; bottom caption row cut |
| `2023_AIT_P1_Q16` | number-line labels 31 and 31.1 (above the line) and the line ends were cut off |
| `2024_PeiChun_P2_Q4` | pamphlet frame clipped at top/right/bottom; stem fragment removed |


## Chapter: Fractions
Checked 67 figures; 33 edge-touch candidates; **20 confirmed cut / wrong / blank and re-cut** (1 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_fractions_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_MGS_P1A_Q13` | labels A, E, D clipped at the left edge and the rectangle top |
| `2021_NANHUA_P1_Q17` | top of the scale labels (7.7, 7.8, 7.9, 8.0) and tick tops clipped at the top edge; tick marks missing |
| `2021_ROSYTH_P1_Q30` | top row of the table (Amount of Money, $0, $1...) clipped at the top |
| `2022_MGS_P2_Q7` | x-axis labels (Week 1-6) and graph bottom frame cut off at the bottom |
| `2022_Nan_Chiau_P1A_Q03` | the whole number labels 2 and 3 under the number line were cut off (and tick bottoms) |
| `2022_Nan_Chiau_P1_Q17` | label E (bottom right) and left labels clipped |
| `2022_Nan_Chiau_P1_Q29` | left of the graph cut: "10" before a.m. and the y-axis tick labels clipped at the left edge |
| `2022_Rosyth_P2_Q14` | right end of the x-axis (20) and the left axis title "volume of water in tank" cut off |
| `2022_St_Nicholas_P2_Q10` | top of the tank cut off at the top edge |
| `2022_Tao_Nan_P1_Q29` | left base corner of the triangle cut off at the left edge; stem fragment "figure." must stay out |
| `2022_Tao_Nan_P2_Q15` | right end of the road strip cut at the right edge |
| `2023_MGS_P1_Q29` | labels A, H, G clipped at the left edge; bottom row of labels clipped |
| `2023_Pei_Chun_P1A_Q03` | bottom row of the 3x3 grid cut off; old image also holds stem fragments |
| `2024_Raffles_P1A_Q06` | right-hand figure (4) cut off at the right edge |
| `2025_MGS_Paya_Lebar_P1A_Q12` | WRONG figure (answer options of Q11 + stem text); the row of shapes re-cut |
| `2025_Methodist_Girls_P1A_Q06` | WRONG figure (fractions 1/6, 2/3 plus Q7 text); the number line with points A-D re-cut |
| `2025_Raffles_Girls_P1A_Q02` | WRONG figure (Q1 options text, triangle figure cut at the top); the shaded triangle figure re-cut |
| `2025_Raffles_Girls_P1A_Q10` | stem fragment "of the Primary 6 students go to school by MRT?" inside the image (not a cut) |
| `2026_MGS_P1_23` | the left end of the number line with its label 3/8 was cut off |
| `2026_MGS_P1_28` | top square A cut off at the top edge |


## Chapter: Decimals
Checked 110 figures; 64 edge-touch candidates; **31 confirmed cut / wrong / blank and re-cut** (0 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_decimals_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_NANCHIAU_P1_Q27` | left label "4 cm" and the left dashed line cut off; bottom labels P, Q clipped |
| `2021_NANHUA_P2_Q12` | bottom row of the table and its frame cut off |
| `2021_NANYANG_P2_Q17` | top and bottom of the figure and the square corners clipped at the image edge |
| `2021_Nan_Hua_P1A_Q08` | labels A-D and the bottom dots clipped at the bottom edge; stem fragment at the top removed |
| `2021_Nan_Hua_P1A_Q14` | left label "4 cm" clipped at the left edge |
| `2021_Red_Swastika_P1A_Q15` | bottom point of the Special Offer burst cut off at the bottom edge |
| `2021_SCGS_P2_Q15` | WRONG figure (fragment of another question); the rectangular card with semicircle/quadrant edges re-cut |
| `2022_MGS_P2_Q11` | only the March graph was shown and without x-axis labels; the April graph (referred to in the question) and the category labels were missing |
| `2022_Nan_Hua_P1A_Q09` | stem text fragment "mass of a calculator shown" sat inside the image; removed (calculator itself was complete) |
| `2022_Nanyang_P1A_Q13` | top ruler scale labels (8 cm, 9, 10, 11, 12) cut off at the top edge |
| `2023_CHS_P2_Q15` | left label "18.5 cm" and left of container P clipped at the left edge; top clipped |
| `2023_Catholic_High_P1A_Q03` | badminton court cut off at the bottom (baseline and arrow end missing); stem fragment on top removed |
| `2023_MGS_P1A_Q03` | label A under the arrow clipped at the bottom edge and number line right end/8 clipped at the right edge |
| `2023_St Nicholas_P2_Q12` | WRONG figure (answer lines of the parts (b) and (c)); the bar graph (File, Marker, Notebook, Pen, Stapler) re-cut |
| `2024_MGS_P1A_Q05` | top edge of the top wooden block clipped at the top edge |
| `2024_Nanyang_P1A_Q03` | label B above the arrow clipped at the top edge |
| `2024_Nanyang_P2_Q16` | bottom of the bar chart cut off (axis label 0 and baseline clipped) |
| `2024_PeiChun_P2_Q2` | bottom row of the table (12 30 Music) and the table bottom frame cut off |
| `2024_Rosyth_P1A_Q03` | bottom of the sign cut off (phone icons and the frame bottom missing) |
| `2024_Rosyth_P1A_Q10` | top of the table cut ("First km" row and "$4.80" clipped) and right frame |
| `2024_Rosyth_P1A_Q14` | left label "9 cm" clipped at the left edge |
| `2024_Rosyth_P2_Q3` | bottom row of chairs and the bottom of the right-hand dimension arrow cut off |
| `2025_Ai_Tong_P1A_Q06` | phone icon cut off at the top, left and right |
| `2025_NanHua_P2_Q16` | left label "140 cm" and the left arrow and bottom of the tile grid cut off at the left/bottom edge |
| `2025_Nan_Hua_P1A_Q02` | WRONG figure (Q1 options text); the number line with A re-cut |
| `2025_Nan_Hua_P1A_Q08` | image held the stem and answer options (clipped at the bottom); only the box of distances kept |
| `2025_Nan_Hua_P1A_Q11` | image held the stem and options; only the postage table kept |
| `2025_Nanyang_P1A_Q03` | top of the number line (ruler ticks) and left part cut off; right label 2.5 clipped |
| `2025_Nanyang_P1A_Q10` | slide cut off at the left edge (bottom of the slide and the child's feet missing) |
| `2025_Nanyang_P1A_Q13` | WRONG figure (Q14 text); the three weighing-scale readings re-cut |
| `2025_Red_Swastika_P1A_Q08` | pencil and ruler cut off at the left/bottom; image held stem and option fragments |


## Chapter: Percentage
Checked 87 figures; 55 edge-touch candidates; **18 confirmed cut / wrong / blank and re-cut** (0 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_percentage_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_ACS_P1_Q24` | last table column (May, 60) cut off at the right edge |
| `2021_HENRY_P2_Q11` | top of the graph (120 label and first point) clipped at the top edge; page frame line removed |
| `2021_MGS_P2_Q10` | WRONG figure (a triangle diagram from another question); the CCA table and bar graph re-cut |
| `2021_TAO_NAN_P2_Q14` | bottom of both graphs cut off (x-axis year labels 1995 ... 2025 and "Year" clipped) |
| `2022_Catholic_P1_Q23` | top of the racket and the SALE tag cut off at the top edge, frame cut at the bottom |
| `2022_SCGS_P2_Q11` | y-axis labels (50, 40 ...) and the left axis missing (cut off at the left edge) |
| `2023_AIT_P1_Q23` | y-axis labels (70 ... 0) and left axis cut off at the left edge |
| `2023_AIT_P2_Q6` | bottom of the pie chart (Dance Club / Brownies sectors) cut off |
| `2023_MarisStella_P2_Q01` | pie chart clipped at the left, top and right edges; stem fragment removed |
| `2023_MarisStella_P2_Q04` | y-axis labels (90, 80 ...) and the axis top cut off at the left/top |
| `2023_Maris_Stella_P1A_Q14` | table cut off at the right (right border), top and bottom edge (header and last row clipped) |
| `2024_Raffles_P1_Q19` | right part of the sale banner and the frame cut off at the right edge |
| `2024_Rosyth_P1A_Q05` | table header row (Day / Children / Adults) clipped at the top edge |
| `2025_HenryPark_P2_Q15` | x-axis labels (Start of sale, Mon ... Sun) clipped at the bottom edge |
| `2025_MGS_Paya_Lebar_P1A_Q13` | pie chart clipped at the top and left (Floorball label and sector cut off) |
| `2026_AT_P1_29` | pie chart clipped at the top and left edges (circle, Taiwan label touching the border) |
| `2026_CH_P2_13` | bottom of the paperback book cut off at the bottom edge; page frame line removed |
| `2026_NY_P2_12` | pie chart clipped at the left/right and bottom (circle and Women sector cut off) |


## Chapter: Circles
Checked 175 figures; 86 edge-touch candidates; **40 confirmed cut / wrong / blank and re-cut** (0 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_circles_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_ACS_P2_Q15` | top of the shaded sector and label R cut off at the top edge |
| `2021_AITONG_P2_Q07` | top breadth arrow (21 m) and the top of the rectangle cut off at the top edge |
| `2021_Catholic_High_P1A_Q15` | left side of circle B clipped at the left edge |
| `2021_NANHUA_P1_Q20` | bottom of the parallelogram (base AB and label A/B) cut off at the bottom edge |
| `2021_NANHUA_P2_Q13` | bottom of the lower semicircle ring cut off at the bottom edge |
| `2021_RAFFLES_P2_Q15` | top of the big semicircle cut off at the top edge |
| `2022_Henry_P2_Q15` | top of the figure cut off (20 cm width arrow and the two upper circles); stem fragment removed |
| `2022_Nan_Chiau_P1A_Q07` | top of the semicircle cut off (only a sliver of the arc remained); the answer options 6pi / 18pi that the app shows as text were inside the image, removed |
| `2022_Nan_Chiau_P1_Q21` | bottom of the rectangle figure cut off at the bottom edge |
| `2022_Nanyang_P2_Q17` | dimension label "28 cm" clipped at the bottom edge |
| `2022_PLMGS_P1_Q24` | top of the semicircle arc clipped at the top edge; question number "14." removed |
| `2022_St_Nicholas_P2_Q17` | top-right corner of the square grid cut off; stem text fragments removed |
| `2023_ACSJ_P1_Q20` | bottom vertex of the outer diamond cut off at the bottom edge |
| `2023_Ai_Tong_P1A_Q12` | "10 cm" label clipped at the right edge; stem fragment "3.14)" removed |
| `2023_Catholic_High_P1A_Q04` | 4th figure cut off at the right edge and the option labels (1)-(3) clipped at the bottom |
| `2023_MGS_P2_Q04` | left vertex U and the left end of line UT cut off at the left edge |
| `2023_MGS_P2_Q12` | label "10 cm" clipped at the right edge |
| `2023_MarisStella_P2_Q16` | top half of the circle (and the top of the shaded parts) cut off |
| `2023_RedSwastika_P2_Q16` | label X under the bottom vertex clipped at the bottom edge |
| `2023_St Nicholas_P2_Q10` | top of the big semicircle arc cut off at the top edge |
| `2023_TAO_P2_Q8` | bottom of the circle (below YZ) cut off at the bottom edge |
| `2023_Temasek_P1_Q18` | top and left of the three-quarter circle cut off; right edge clipped |
| `2024_ACSJ_P1_Q20` | label "5 cm" clipped at the right edge |
| `2024_Catholic_High_P2_Q11` | right part of Figure 4 cut off at the right edge (right column of circles clipped) |
| `2024_MGS_P1A_Q12` | label C at the bottom clipped at the bottom edge |
| `2024_MGS_P2_Q16` | left dimension arrow and left of the box cut off at the left edge |
| `2024_PeiChun_P2_Q15` | top vertex C and "?" of Figure Y cut off at the top; stem fragment "What is the length of CD?" removed |
| `2024_PeiChun_P2_Q17` | bottom of the lower semicircles and the right dimension arrow cut off |
| `2024_Raffles_P2_Q17` | caption "Figure 1" clipped at the bottom edge |
| `2024_Red_Swastika_P1A_Q11` | bottom row of the grid cut off at the bottom edge |
| `2024_Rosyth_P2_Q12` | label "66 m" clipped at the bottom edge; page frame line removed |
| `2024_TaoNan_P1_Q22` | top of the cube cut off at the top edge |
| `2025_ACSJ_P2_Q15` | labels B and C clipped at the top edge |
| `2025_ACS_Junior_P1A_Q12` | top of the large semicircle cut off at the top edge |
| `2025_MGS_Paya_Lebar_P1A_Q09` | WRONG figure (a clipped piece of the vouchers table); the shaded quarter circle with 21 cm re-cut |
| `2025_Methodist_Girls_P1A_Q08` | WRONG figure (stem text only); the big circle with the small circle inside re-cut |
| `2025_Raffles_Girls_P1A_Q14` | left of the figure (5 cm arrow and the left of the semicircle) cut off at the left edge |
| `2025_Red_Swastika_P1A_Q04` | top row of circles cut off; the fraction options the app shows as text removed |
| `2026_HP_P2_15` | top edge of the cloth (the "7" label and the top cut-outs) cut off at the top edge |
| `2026_SN_P1_27` | bottom of the figure cut off (points P, Q and "7 cm" missing); page frame line removed |


## Chapter: Volume
Checked 210 figures; 98 edge-touch candidates; **63 confirmed cut / wrong / blank and re-cut** (1 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_volume_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_ACS_P2_Q02` | tap and its label "Tap A" cut off at the top edge |
| `2021_HENRY_P1_Q20` | top edge of the tank clipped at the top; left label "20 cm" clipped at the left |
| `2021_MGS_P2_Q03` | right end of the cuboid cut off at the right edge, top of the cube clipped |
| `2021_PEIHWA_P2_Q01` | bottom of the tank and the "20 cm" length label cut off at the bottom edge |
| `2021_SCGS_P2_Q13` | x-axis labels (2, 4, 6, 8, 10, 12 and "Time"), the "cm" title and the page margin line; axis cut off at the bottom |
| `2022_ACSJ_P1_Q18` | top of the container and the left/right glass walls cut off at the edges |
| `2022_ACSJ_P1_Q24` | top of the tank (top face) cut off at the top edge |
| `2022_Catholic_P1_Q28` | the top of the cuboids (top faces) and the "?" brace cut off at the top and right edge |
| `2022_Henry_P2_Q14` | stem fragment "ch tank?" inside the image (not a cut); top of Tank A clipped at top |
| `2022_Henry_Park_P1A_Q09` | options (1) and (2) nets cut off at the top and right (only parts of 4 nets shown) |
| `2022_Nan_Chiau_P1A_Q15` | right tank cut off at the right edge ("15 cm", "10 cm" labels clipped) and the left tank clipped at the left; Tank A / Tank B captions added |
| `2022_Nan_Hua_P1_Q17` | top face of the cuboid cut off at the top edge |
| `2022_Nan_Hua_P2_Q14` | right end of the graph (x = 120) and the x-axis title cut off at the right edge |
| `2022_Nan_Hua_P2_Q5` | "cm2" of the base-area label clipped at the right/bottom edge |
| `2022_Nanyang_P1_Q19` | bottom row of cubes cut off at the bottom edge |
| `2022_PLMGS_P2_Q8` | box and cover cut off at left/top/bottom (cover of the box, the 25 cm label and the left cubes missing) |
| `2022_RedSwastika_P2_Q11` | caption "Figure 1" and the 20 cm label clipped at the top/bottom edges |
| `2022_SCGS_P1_Q27` | right side (dashed outline) and bottom tip of the pyramid net cut off |
| `2022_SCGS_P2_Q4` | top of the cuboid and the height arrow (above "?") cut off at the top edge |
| `2022_Tao_Nan_P1_Q27` | left cubes and the top row of the solid cut off at the left/top edge |
| `2022_Tao_Nan_P2_Q4` | top solid (prism) cut off at the top edge |
| `2023_ACSP_P1A_Q07` | bottom of the tank (30 cm arrow, 10 cm label) cut off at the bottom/right; stem fragment on top removed |
| `2023_ACSP_P2_Q14` | top of the tall cuboid and its "3 cm" label cut off at the top edge |
| `2023_ACSP_P2_Q3` | x-axis labels (Day 1 ... Day 4) clipped at the bottom edge |
| `2023_AIT_P2_Q7` | left height label of the container cut off at the left edge; tap clipped at the top |
| `2023_CHS_P2_Q17` | Figure 2 (top of the taller stack and the 44 cm arrow) and the bottom of Figure 3 cut off at the top/bottom edges |
| `2023_Catholic_High_P1A_Q10` | options labels (1)-(4) clipped at the left edge and nets cut at the top/left |
| `2023_MGS_P2_Q07` | graph cut off at the bottom/right (x-axis labels 0-12 and "Time (min)" missing) |
| `2023_MarisStella_P2_Q10` | label Y under the tank clipped at the bottom edge |
| `2023_Nanyang_P1A_Q07` | option (4) net cut off at the bottom and the right of the nets cut |
| `2023_PeiChun_P2_Q07` | x-axis title "Time (min)" and axis labels clipped at the bottom edge |
| `2023_Pei_Chun_P1A_Q11` | bottom square of the net cut off; stem fragment "a net of a solid" above removed |
| `2023_ROS_P2_Q9` | bottom label "40 cm" clipped at the bottom edge |
| `2023_Red_Swastika_P1A_Q04` | bottom of the cup cut off at the bottom edge |
| `2023_Tao_Nan_P1A_Q15` | bottom of net (4) and the stem fragment; image cut at the top/left/bottom edges |
| `2023_Temasek_P2_Q13` | top of Container X cut off at the top edge; stem fragment at the bottom removed |
| `2024_ACSJ_P1A_Q08` | tops of the containers (levels 250/400 ml labels) cut off at the top edge; answer options (1)-(4) that the app shows as text removed |
| `2024_ACSJ_P2_Q13` | right container cut off at the right edge and the top of Tank A clipped |
| `2024_ACSP_P1A_Q06` | bottom label "10 cm" clipped at the bottom edge |
| `2024_ACSP_P1_Q20` | beaker top (rim) and right wall cut off at the top/right edges |
| `2024_ACSP_P1_Q24` | label "Vertical" clipped at the top edge and the bottom square of the net cut at the bottom |
| `2024_Nanyang_P2_Q12` | labels "Section A / Section B" and "?" clipped at the bottom edge; right label 15 cm clipped |
| `2024_PeiChun_P1_Q20` | top and left of the solid (top cubes) cut off at the top edge |
| `2024_Pei_Chun_P1A_Q03` | top of beaker G and the left of the beaker and label G/H clipped at the top/bottom edges |
| `2024_Raffles_P2_Q1` | x-axis title "Time" clipped at the bottom edge |
| `2024_Raffles_P2_Q16` | left label "24 cm" and the left edge of tank P cut off at the left edge |
| `2024_RedSwastika_P2_Q2` | label "Which" of the stem line clipped at the left (stem sentence is text, not part of the figure) and the nets D/A clipped |
| `2025_ACS_Junior_P1A_Q07` | left height label "h" of the prism clipped at the left edge |
| `2025_HenryPark_P1_Q21` | right corner of the pyramid base clipped at the right edge |
| `2025_Henry_Park_P1A_Q06` | bottom of the net (squares C, F) cut off at the bottom edge |
| `2025_MGSPayaLebar_P2_Q1` | top of the cube cut off at the top edge |
| `2025_MGSPayaLebar_P2_Q11` | top of the graph (250 label) and stem fragment; graph frame cut |
| `2025_MGS_P2_Q16` | left label "13 cm" and the left edge of the tank cut off at the left edge |
| `2025_Methodist_Girls_P1A_Q14` | cuboid cut off at left/top (left part, top face missing) |
| `2025_RafflesGirls_P2_Q16` | "18 cm" label and the right arrow of tank Y clipped at the right edge |
| `2025_Red_Swastika_P1A_Q09` | WRONG figure (Q7 options + the pencil of Q8); the 30 cm2 / 24 cm2 cuboid re-cut |
| `2025_TaoNan_P2_Q10` | left label "h" of Tank X cut off at the left edge |
| `2026_Ai_Tong_P1A_Q12` | stem sentence fragment above the figure ("6 cubes are used...") is not part of the figure; tidy |
| `2026_CH_P2_Q1_01` | bottom of the net (lower rectangle and the 40.8 cm arrow end) cut off at the bottom edge; stem fragment on top removed |
| `2026_HP_P1_25` | the left part of the solid (left cubes and axes) and the bottom cut off |
| `2026_HP_P2_04` | bottom of the net (lower rectangles) cut off at the bottom edge; arrow label 48 cm preserved |
| `2026_NH_P1_29` | top of the right-hand figure (block B, top corner) cut off at the top edge; page margin line at right removed |
| `2026_SN_P1_23` | right end of the 110 cm arrow cut off at the right edge; page margin line removed |

Not fixed / needs a human look:
- `2023_Temasek_P1A_Q10`: stem fragment ("Which of the following solids has...") inside the image and cut at the right edge; PDF match too weak (0.48) to re-cut automatically, minor
- `2024_Rosyth_P1_Q30`: table of solids/nets is cut at the bottom (rows (b)-(c) missing); PDF match too weak (0.44) to re-cut automatically
- `2025_StNicholas_P2_Q1`: top of the jug (rim) is cut at the top edge; automatic re-cut lost the right wall, left as is
- `2022_MGS_P1_Q24`: figure image is blank (a few stray dots); the source page has no figure for this question (text-only). Suggest removing the figure from the editor question; not re-cut.


## Chapter: Data Representation
Checked 274 figures; 127 edge-touch candidates; **48 confirmed cut / wrong / blank and re-cut** (1 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_data_representation_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_ACS_P2_Q08` | x-axis labels (0, 10, 20 ... ) cut off at the bottom edge |
| `2021_AITONG_P1_Q23` | top of the y-axis (label 10) and top of the frame cut off |
| `2021_AITONG_P2_Q01` | right part of the graph frame / gridlines cut off at the right edge |
| `2021_CATHOLIC_P2_Q06` | top of the graph frame (and top gridlines) cut off at the top edge |
| `2021_HENRY_P2_Q03` | top of the table (header "Duration / Charges" line) cut off at the top edge |
| `2021_HENRY_P2_Q12` | left vertex B and the bottom of the triangles cut off at the left/bottom edge |
| `2021_HENRY_P2_Q15` | bottom row of the table (grey squares) and the right frame cut off; stem sentence removed |
| `2021_NANCHIAU_P1_Q29` | bottom of the ink-blotted table cut off at the bottom edge |
| `2021_NANCHIAU_P2_Q14` | label B and the left end of the base cut off at the left edge |
| `2021_NANHUA_P2_Q10` | top of the table header (English / Chinese / Mathematics) clipped at the top edge |
| `2021_PEIHWA_P1_Q29` | bottom of the first graph (x labels January/February/March) and the whole second graph ("Number of Workers" per company) missing; re-cut both graphs |
| `2021_ROSYTH_P2_Q12` | y-axis labels clipped at the left edge (120 and 100 appeared as "20", "00"), left axis title missing; table top clipped |
| `2021_SCGS_P1_Q29` | top and bottom of the chart cut off (y labels 8, 9 and x labels 1-4 missing) |
| `2021_SCGS_P2_Q02` | bottom of the table (Devi row bottom frame) cut off; stem fragment on top removed |
| `2021_TAO_NAN_P2_Q07` | x-axis title "Number of Cars" and the y-axis title clipped at the bottom/left edge |
| `2022_Catholic_High_P1A_Q10` | y-axis title "Number of books sold" clipped at the left edge; stem fragments at top/bottom removed |
| `2022_Henry_P1_Q29` | ink blot and right edge of the table cut off at the right/bottom edge |
| `2022_Nan_Hua_P1A_Q14` | top of the bar chart (top bar and its "2" label) and the bottom axis labels clipped at the top/bottom edge |
| `2022_St_Nicholas_P1_Q20` | last x-axis label "9.00 a.m." clipped at the right edge |
| `2022_St_Nicholas_P1_Q28` | ink blot and the top of the bar graph clipped at the top edge; left axis cut |
| `2022_St_Nicholas_P2_Q5` | y-axis labels (30, 25, 0) and left axis missing (cut off at left/top) |
| `2022_Tao_Nan_P2_Q11` | y-axis top label "20" and the top of the graph cut off at the top edge |
| `2023_ACSJ_P1A_Q13` | right column ("After 6 pm / $2.50 per entry") cut off at the right edge; stem line under the table removed |
| `2023_ACSJ_P1_Q27` | last table row (D 4.60 / 12.50) cut off at the bottom edge |
| `2023_Ai_Tong_P1A_Q09` | right end of the bar graph axis (label 40) and the frame cut off at the right edge |
| `2023_Catholic_High_P1A_Q09` | x-axis month labels (April, May, June, July) cut off at the bottom edge |
| `2023_MarisStella_P2_Q02` | top of the bar graph (y label 350 and top frame) cut off at the top edge; page frame line |
| `2023_Pei_Chun_P1A_Q08` | bottom of the desk legs and the lower shelf cut off at the bottom/left edge |
| `2023_Red_Swastika_P1A_Q15` | table header row ("Day / Amount saved") cut off at the top edge |
| `2023_TAO_P1_Q27` | pie chart cut off at the left, right and bottom edges (circle not complete); stem fragment removed |
| `2024_ACSP_P2_Q11` | bottom of the pie chart (circle bottom) cut off at the bottom edge |
| `2024_Henry_Park_P1A_Q10` | bottom of the bar graph (baseline "0" and the bar bottoms) cut off at the bottom edge |
| `2024_Nanyang_P1A_Q09` | option labels (1), (2) and the tops of the pie charts cut off at the top edge |
| `2024_PeiChun_P2_Q12` | bottom of the pie chart clipped at the bottom edge |
| `2024_Raffles_P1_Q18` | table header row ("Start time / Programme") cut off at the top and right column clipped at the right edge |
| `2024_RedSwastika_P2_Q8` | y-axis labels (80, 40, 20) cut off at the left edge and top of the axis clipped |
| `2024_Rosyth_P1A_Q04` | end of the graph line (at 12 00) and the left axis labels cut off at the right/left edge |
| `2024_SCGS_P2_Q13` | x-axis title "Number of electronic devices" clipped at the bottom edge and top label 90 |
| `2025_MGS_P1_Q20` | pie chart cut off at the right and top/bottom (Blue and White sectors clipped) |
| `2025_Methodist_Girls_P1A_Q04` | x-axis month labels (Jun ... Oct) clipped at the bottom edge |
| `2025_RedSwastika_P2_Q10` | x-axis labels (0, 1, 2, 3) cut off at the bottom edge |
| `2025_Red_Swastika_P1A_Q13` | left of the pie chart (green sector) and the frame clipped at the left edge; right bar edge |
| `2025_Rosyth_P2_Q8` | right side of the pie chart (Toy sector and circle) cut off at the right edge |
| `2025_StNicholas_P1_Q20` | right edge of the last bar (4) and frame cut off at the right edge |
| `2025_Tao_Nan_P1A_Q11` | top of the pie chart (Jogging 30 sector) cut off at the top edge; stem text fragments inside the image removed |
| `2026_Methodist_Girls_P1A_Q15` | bottom of the pie chart (Green/Red sector bottoms) cut off at the bottom edge; stem fragment on top removed |
| `2026_Raffles_Girls_P1A_Q05` | x-axis day labels (Mon ... Fri) and the bottom of the bars cut off at the bottom edge; stem fragment "Friday." removed |
| `2026_SN_P1_21` | rounded frame of the poster (bottom and right) cut off at the bottom/right edge |

Not fixed / needs a human look:
- `2022_MGS_P2_Q17`: image holds no figure (only a page margin line, "Ans: (b)" and the answer box); the question is text-only. Suggest removing the figure in the editor; not re-cut.


## Chapter: Ratio and Rate
Checked 77 figures; 43 edge-touch candidates; **19 confirmed cut / wrong / blank and re-cut** (1 of them were not edge candidates, found by the by-eye pass). Dense sheets covered the figures that did not touch an edge or had no usable re-cut.
Before/after sheets: `before_after/FIXED_ratio_and_rate_000.png` ... in the scratchpad figcut folder (old = shipped bundle image, left; new, right).

| Question id | What was missing / wrong |
|---|---|
| `2021_MGS_P2_Q14` | labels Q and R and the top edge of the square cut off at the top edge |
| `2021_NANYANG_P2_Q13` | right label "21 cm" clipped at the right edge, bottom dashed line cut |
| `2022_Catholic_P2_Q11` | graph cut off at the bottom/left/right (x-axis 0-18 labels and "Time" missing, 10 label); stem fragment removed |
| `2022_Catholic_P2_Q12` | labels "park" and "mall" clipped at the top edge |
| `2022_RedSwastika_P1_Q19` | captions "Tank X / Tank Y" clipped at the bottom edge |
| `2023_CHS_P2_Q8` | titles "Group A" / "Group B" clipped at the top edge |
| `2023_NanHua_P1_Q23` | apex of the triangle and the shape cut off at the top edge; left base tip clipped |
| `2023_PeiChun_P2_Q15` | the two taps (inflow above Tank B, outflow beside Tank A) cut off at the top/left edge |
| `2023_RedSwastika_P2_Q17` | top of the donut tray cut off at the top edge |
| `2024_ACSP_P2_Q15` | bottom of the table (Machine B row frame) cut off at the bottom edge |
| `2024_Catholic_High_P1A_Q10` | right side of the Girls pie chart (circle and "Walk 20%" edge) cut off at the right edge |
| `2024_Catholic_High_P2_Q10` | left end of the route line with label P cut off at the left edge |
| `2025_MGS_P1_Q28` | label "6 cm" clipped at the right edge |
| `2025_Raffles_Girls_P1A_Q11` | pie chart touching the left edge (Car sector circle clipped) and stem fragment "of the Primary 6 students go to school by MRT?" removed |
| `2025_Rosyth_P2_Q13` | graph cut off at the right (x axis only to "10") and bottom (Time axis title missing; 08 00 labels clipped) |
| `2026_AT_P1_27` | top y-axis label "140" clipped at the top edge |
| `2026_AT_P2_01` | top of the tomatoes picture and frame cut off at the top edge |
| `2026_CH_P1_Q19_19` | left part of the poster (S of SPECIAL, "2", muffins) cut off at the left edge |
| `2026_MGS_P2_03` | right end of the necklace (continuing line) cut off at the right edge |

Not fixed / needs a human look:
- `2022_Catholic_P2_Q15`: image holds only the "(a) How many nuts ... (b) What is the mass of the metal box?" text lines, no figure; not a cut. Suggest removing the figure in the editor; not re-cut.


## Notes on specific follow-ups
- `2022_Rosyth_P2_Q15` ("PQST is a rhombus"): the source page does have the P and Q labels at the top corners; the earlier re-cut had cropped them off. Re-cut again from the page at 170 dpi including P and Q (checked by eye).
- Pre-existing verified recrops (185 files from before this audit) were not modified. `2021_AITONG_P1_Q30` was overwritten by mistake
  during chapter work and restored to the committed version (it must keep the full 15-number sequence).
- Image-only issues for the editor, not re-cut: `2022_MGS_P1_Q24`, `2022_MGS_P2_Q17`, `2022_Catholic_P2_Q15` hold no figure (text/blank only).
