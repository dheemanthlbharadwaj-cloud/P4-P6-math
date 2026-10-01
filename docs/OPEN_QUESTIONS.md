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
| 14 | **Monthly reset moment.** The board says rankings reset "on the last day of every month at midnight". Interpretation A: at 00:00 on the last day (the month is cut one day early, the last day counts toward the next month). Interpretation B: at the midnight that ends the last day = 00:00 on the 1st (the whole calendar month counts). | B, implemented in `backend/functions/src/scheduled.ts` (`monthlyClose`, cron `0 0 1 * *`, Asia/Singapore); the leaderboard footnote says so. A would mean running at 00:00 on the last day and keying the board by a shifted month. |
| 15 | **Stars on a replayed level.** Every completed attempt of a level awards its stars again (so the monthly leaderboard keeps moving), which also means stars can be farmed by replaying. Should stars be awarded only the first time a level is completed (leaderboard then needs another score)? | Every completion awards stars |
| 16 | Stars are computed from the result the app reports (the server has no copy of the curriculum), so a modified client could claim completions. Acceptable for a practice app, or should the backend get the curriculum manifest and per-day caps? | Trusted client, content version checked only |
| 17 | **Unsimplified answers.** PSLE marking usually expects fractions/ratios in simplest form. Should `6/8` be accepted for `3/4`? (Ratios already require exact terms.) | Accepted (equivalent fractions count as correct), see `packages/shared/src/answer.ts` |
