# Figure cut-off audit, 2026-10-16

Testers reported question figures that are cut off at the image edge, mostly in Angles. Scope this run: every figure in the
**Angles in Geometrical Figures** chapter (357) and the **Triangles, Squares, Rectangles** chapter (179). Both chapters are
finished. The remaining ~1,108 figures in other chapters were **not** audited (see "Not done").

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
| Chapter | Figures checked | Edge-touch candidates | Confirmed cut / wrong / blank (fixed) | Of which found only by the by-eye pass | Not a real cut |
|---|---|---|---|---|---|
| Angles in Geometrical Figures | 357 | 190 | **110** | 5 | 85 candidates |
| Triangles, Squares, Rectangles | 179 | 91 | **48** | 0 | 43 candidates |
| All other chapters | 1,108 | 560 | not audited | - | - |

Of the 158 fixed figures, 11 were not clipping but **the wrong image** or a **blank image** (listed below as WRONG/blank):
2021_MGS_P2_Q15, 2022_MGS_P1_Q23 (blank), 2022_Nan_Hua_P2_Q8, 2023_PeiChun_P1_Q18, 2024_TaoNan_P1_Q28, 2025_ACSJ_P1_Q29,
2025_Henry_Park_P1A_Q13 (blank), 2025_NanHua_P1_Q20, 2025_Nan_Hua_P1A_Q06, 2025_RedSwastika_P1_Q27, 2025_Tao_Nan_P1A_Q15.
The reported example `2022_Nanyang_P1A_Q05` is fixed (point D and the top of the vertical line at E are back).

Most candidates that were not fixed legitimately touch an edge after tight trimming (a ruler, grid or frame line ending at
the border) with nothing the question needs missing.

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

## Before / after sheets (old on the left, new on the right)
`/tmp/claude-0/-home-user-p4-p6-math/54c6ba52-9b91-5593-8e31-8984dd453c35/scratchpad/figcut/before_after/angles_000.png` ... `angles_021.png`, `triangles_000.png` ... `triangles_009.png`.

## Not done
The 1,108 figures of all other chapters. The edge-touch pass already ran on them (560 candidates; re-crop matches for about
500 of them exist in the scratchpad) but they were not reviewed by eye, so nothing was changed for them.

## To apply tomorrow
`cd content && npx tsx scripts/apply-recrops.ts recrops/P6 --dry`, review, then run without `--dry`, then sync and build.
Note `recrops/P6` also contains the 185 earlier verified re-crops, which are untouched and will be re-applied unchanged.
