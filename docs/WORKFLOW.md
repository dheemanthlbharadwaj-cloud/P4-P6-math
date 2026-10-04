# Product workflow (from the mindmap)

Source: the mindmap.so board the product owner shared, decrypted on 2026-10-01. This file is the
functional spec every agent builds against. Lines tagged **[ASSUMPTION]** are calls made where the
board says nothing; each one is a constant in `packages/shared/src/gameRules.ts` or flagged in
`docs/OPEN_QUESTIONS.md`.

## 1. Starting page / onboarding (first launch only)
1. Log in / Sign up
2. Full name
3. School
4. Topics learnt (multi-select of the current grade's topics)
5. Name your cat (short explainer of the cat companion)
6. Days to PSLE (countdown shown to the student)
→ goes to the Game Level Map.

## 2. Game Level Map (home)
- **Top bar:** hearts and energy (10 each per day, refilled at midnight, +3 per ad), and the current topic name.
- **One map per topic.** Swipe left/right to change topic (each topic is its own map).
- **Nodes on the map = subtopics.** Tapping a node button shows the subtopic name.
- **Map features:** friends shown on the map (mini cat avatars with their full name).
- **Locked mechanics:**
  - Topics the student marked as learnt during onboarding start open.
  - Other topics are covered with clouds/faded with a lock at the bottom. Tapping the lock = "Find the key": answer
    **1 basic MCQ**. Correct = topic unlocked.
- Map art and button art are supplied by the product owner. Until then the app uses placeholders behind one asset registry.

## 3. Inside a subtopic node: Levels
- Select Level: **Level 1 → Level 2 → Level 3** (sequential, each unlocks the next).
- Each level = **5 questions** ("5-5-5"): Level 1 = 5 LV1 questions (MCQ), Level 2 = 5 LV2, Level 3 = 5 LV3.
- Starting a level costs **energy** (− Energy).

## 4. Question flow
- Question types: **MCQ** → select an answer; **Open-ended** → write the answer in the answer box.
- **Auto-marked** against pre-defined answers.
  - Correct → next question.
  - Wrong → **− heart**, and the question is **bookmarked as wrong** (it shows in "Previously Wrong").
- **Out of hearts** → pop-up: **Watch Ad** (→ +3 hearts) or **Give up**.
- **Skip** button.
- **Calculator button:** shown when the question's paper allows a calculator (Paper 2). Paper 1 questions show a
  "no calculator" button instead.
- Internal features: progress bar, picture button (view/zoom the figure), built-in calculator, and the
  companion cat ("desktop pet") that reacts to answers.
- **Level complete** → the level button turns gold and the student moves on to the next level.
  Stars earned: **LV1 = 1 star, LV2 = 2 stars, LV3 = 3 stars.**

## 5. Bottom toolbar (5 buttons, art supplied by the product owner)
1. **Game / Map icon** → back to the game map.
2. **Book icon → Classroom / Mini Games**
   - Mini Game A: **5-Minute Challenge**: as many LV1 questions as possible in 5 minutes, with 5 hearts (round-only).
   - Mini Game B: **Unlimited Mistakes**: only previously-wrong questions, no timer, no hearts. Getting one right un-flags it (plus "test all wrong ever").
     A second button tests **all wrong questions ever done**.
3. **Cat icon → Cat Store**
   - Visible: star balance, the cat in its outfit, and the store.
   - Use stars to buy **hats** and **cat colours**; stars are deducted on purchase. The student previews before/after.
   - Hat + colour change the student's character on the game map (seen by them and by friends).
   - Cat colour changes the companion cat's colour (seen by the student).
4. **Trophy icon → Leaderboards**
   - **Daily leaderboard (friends)** and **Monthly leaderboard (global)**.
   - Friends race: cats running on a moving track, scrollable left and right. Each cat's colour and hat match that
     user's choice, with the number of questions done and the friend's name. *(The running-cat GIF still has to come
     from the artist.)*
   - Table under the daily leaderboard: one row per user, refreshed at **12 midnight**. An arrow and number beside
     each name show how many places they rose or fell since yesterday.
   - Highlight the student, their friends and the top 3. Show a bronze/silver/gold medal beside anyone who finished
     top 1–3 the previous month.
   - Ranking = **monthly stars**. Rankings reset on the **last day of every month at midnight**.
5. **Person icon → Profile + Ads**
   - Edit name, school and other details. **Delete account and data.**
   - Ads: +Heart / +Energy (rewarded).
   - **Subscribe: $15/month for unlimited hearts and energy.**
   - **Refer friends to get 5 stars.**

## 6. Question allocation rule ("5-5-5")
- For each **subtopic**: choose 5 LV1 + 5 LV2 + 5 LV3 questions for the main map.
- **All remaining questions** go to the Classroom / Mini Games pool (timed LV1 game, practice, wrong-question review)
  and to the "Find the key" unlock MCQs.
- P6 only for now. P4 and P5 will be added later: every data path and screen is keyed by `grade`.
