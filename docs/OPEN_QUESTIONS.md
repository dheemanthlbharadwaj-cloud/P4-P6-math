# Open questions for the product owner

Defaults are already in code (`packages/shared/src/gameRules.ts`) so building is not blocked. Change them there.

| # | Question | Current default |
|---|---|---|
| 1 | Max hearts, and how fast does a heart recover? | 5 hearts, +1 every 30 min |
| 2 | Max energy, cost per level, recovery rate, energy per ad? | 10 energy, 1 per level, +1 every 20 min, +3 per ad |
| 3 | When is a level "complete": all 5 correct, or all 5 attempted? | Student must get all 5 right; wrong ones come back at the end of the level |
| 4 | Does Skip cost anything, and does a skipped question count as wrong? | Skip is free, the question goes to the end of the queue, and it is not bookmarked |
| 5 | Timed LV1 mini game: total time or per question? Does it give stars? | 60 s per question, no stars (practice) |
| 6 | Store prices and catalogue of hats/colours (and the artist's art) | 4 hats, 5 colours, placeholder prices |
| 7 | "Desktop pet": the companion cat on the question screen, or a home-screen widget? | In-app companion cat that reacts to answers |
| 8 | Do Mini Games / Classroom use subtopic pools or the whole grade? | Student picks a topic, or all topics |
| 9 | Friends on the map: how are friends added? | Friend code + referral link |
| 10 | PSLE date source | Defaults to the first PSLE written paper date of the current year (editable) |
| 11 | Subtopics with < 5 questions at a level: borrow from a sibling subtopic, or show a shorter level? | Shorter level, reported in the audit |
| 12 | Questions that can't be auto-marked (Drawing, explain-why): exclude from the main path? | Excluded from main 5/5/5; shown in Classroom with "show answer" self-marking |
| 13 | Ad unit IDs, RevenueCat keys, the new Firebase project id, bundle id / package name | Placeholders in `apps/mobile/app.config.ts` and `backend/.firebaserc` |
