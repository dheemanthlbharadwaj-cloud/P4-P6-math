---
name: catapult-math-athletes
description: Everything needed to work on Catapult Math Athletes (cat-themed Singapore P6/PSLE math game; one Expo React Native codebase for web, Android and iOS; offline question bundle from the primary-math-sg editor Firestore with live edits; Netlify backend; Firebase Hosting web app; EAS over-the-air updates). Use for ANY task in this repo (app UI, map, cat, stars, content sync/build, question figures, editor writes, deploys, Android builds) and to learn how to get set up and get credentials in any environment or AI agent.
---

# Catapult Math Athletes — working guide

**Start here, any agent or human:** run `npm run setup` (= `bash scripts/setup.sh`) in the repo root. It installs
everything, checks which credentials are present (never prints them), and `npm run doctor` reports what this
environment can do and the live status of every service. Flags: `--verify` (tests + typecheck), `--browser`
(Playwright Chromium), `--android` (Android SDK + release signing key), `--quick` (session-start hook).
`AGENTS.md` at the repo root is the short version of this guide.

## 0. Ground rules from the product owner (read first)
- **Do exactly what is asked. Never add unrequested changes** (restyling, extra badges, removed behaviours). Past
  mistakes the owner called out: swapping the gold "completed" node for a star, adding lock badges next to levels,
  pinning the cat to the timer board and losing its mood reactions. If something seems worth changing, ask first.
- **Work as the orchestrator** (owner request 2026-10): if your agent can run sub-agents, split the work and delegate
  it (a small/fast model for mechanical tasks, a stronger one when more is needed; Claude Code: Agent tool with
  `haiku` / `sonnet`, definitions in `.claude/agents/`). Fix the shared contract (types, API shapes) yourself first so
  sub-agents can work in parallel without editing the same files; then supervise, review their diffs and verify end
  to end (tests, live checks) yourself before deploying or reporting. Without sub-agents, do the same steps yourself.
- Never edit the owner's mindmap. `docs/WORKFLOW.md` is the spec derived from it.
- Never ask the user to paste tokens/keys/passwords into chat. Credentials go in environment settings (§3).
- Git: work on the branch you were given (historically `ccr-41770098-9l0q6b`; `main` is the default); no PR unless
  asked. No model names in commits/PRs/code. Add your agent's co-author trailer if it has one.
- Any bulk write to the editor bank must have a `--dry` run first and an undo manifest in `content/reports/`.
- **Netlify free plan: 300 credits/month, 15 per production deploy (that is what uses them up).** Deploy the backend only when backend code changed, batch changes into one deploy, and never redeploy the APK page without a new APK. `node backend/scripts/netlify-budget.mjs` shows the period's usage; both deploy scripts refuse when fewer than 45 credits would be left (`--force` overrides). The web app is on Firebase Hosting and costs no Netlify credits.
- **Expo free plan: 60 CI minutes/month** (each OTA update run ≈ 15 min; sandboxes count too). Use `[eas skip]` on commits that don't need to reach phones. **Web deploys run on GitHub Actions** (`.github/workflows/deploy-web.yml`, keyless Google auth); no need to deploy the web app by hand after pushing app changes.
- Before claiming done: run tests, look at the result in a browser (web build), and report honestly.
- **No new APK builds until the owner asks (owner rule, 2026-10-17).** Android changes wait; installed APKs keep
  working through the backend's legacy sign-in (`LEGACY_AUTH_PROJECT_ID=primary-math-sg`, keep it set until a new APK
  that signs in to the student project is out).
- **Keep this skill current (owner rule, 2026-10-17): every change updates this file in the same commit.** New or
  changed behaviour → §1 "Current agreed behaviour"; new files/scripts → §2; credentials/deploys/limits → §0/§3;
  content or figure work → §5/§6; how you tested → §7; anything that went wrong and how it was fixed → §8. Owner
  decisions (and open questions you put to the owner) go in §9. Delegated agents must do the same, or the orchestrator
  does it before committing.
- **Two Firebase projects (LIVE since 18 Oct 2026):** the question editor stays in `primary-math-sg` (db `default`; backend only reads `questions` and writes `question_reports` there, via `editorDb`), all student data + student Auth move to their own project (working id `catapult-math-students`, db `(default)`, asia-southeast1), so app traffic can never use up the editor's quota. Until the switch the backend runs on the single old project.
- **Firebase is on the free Spark plan: 50,000 Firestore reads a day** (per project; before the migration shared with the editor; resets at midnight
  US Pacific = 15:00/16:00 SGT). When it runs out **every backend call returns 500** until the reset (happened
  16 Oct 2026). Design for few reads (the daily leaderboard and the patch cache exist for this), keep test runs small
  (one account per test agent, deleted afterwards), and never loop calls against the live backend.
- **Holding a web release:** a push that touches `apps/mobile/**` or `packages/shared/**` redeploys the web app. To push
  without deploying (e.g. app changes that need a backend deploy first), put `[skip ci]` in the head commit message;
  deploy later with the "Deploy web app" workflow (workflow_dispatch; GitHub MCP `actions_run_trigger`
  `run_workflow`, workflow `deploy-web.yml`, ref = the branch). Order for linked changes: backend first, then web.

## 1. What the product is

### Live services (what exists, where)
| Service | Where | Deployed by |
|---|---|---|
| Web app (test build, 🛠 Dev Tools) | https://catapult-math-athletes.web.app (Firebase Hosting site in `primary-math-sg`) | **automatic**: GitHub Actions `.github/workflows/deploy-web.yml` on push (keyless auth); by hand: `web-preview.py` + `deploy-hosting.ts` |
| Backend API | https://catapult-math-athletes-api.netlify.app/api/<callable> (Netlify free plan) | `node backend/scripts/deploy-netlify.mjs` (15 Netlify credits each; guarded) |
| Database / auth | **Since 18 Oct 2026:** student project `catapult-math-students` (Auth + all student data, db `(default)`); `primary-math-sg` keeps only the editor (`questions` read, `question_reports` write) and, during the transition, still holds the sign-ins of installed APKs, which the backend accepts (`LEGACY_AUTH_PROJECT_ID`; keep until a new APK is out) | rules: `backend/scripts/deploy-rules.mjs` (merged, primary-math-sg) or `--project <id> --student-only`; setup `setup-project.mjs --student`; data move `migrate-students.mjs` |
| Question editor (source of truth) | https://primary-math-sg.web.app (separate codebase; student reports patched in by `backend/scripts/editor-reports.mjs`) | — |
| Phone updates (OTA) | Expo project dheems-team/catapult-math-athletes (id `ea8a1c9d-c3dd-4cac-903d-78956443efe9`), channel `preview` | **automatic**: EAS workflow `apps/mobile/.eas/workflows/publish-update.yml` on push (60 Expo CI min/month) |
| Android APK | **Sent to the owner directly as a file** (owner's choice: they share it themselves). The Netlify page https://catapult-math-athletes-download.netlify.app is archived (team-only). Current: **0.3.0 build 2** (`versionCode` 2, 17 Oct 2026) | built locally (`npm run setup -- --android`, docs/ANDROID.md); deliver the signed APK file to the owner; `deploy-apk.mjs` only if they ask for the page |
| Figures / PDFs | Cloudinary cloud `n9gn4u6k` | content scripts |
- Name: **Catapult Math Athletes**. iOS + Android (Expo SDK 57, RN 0.86, expo-router, zustand persisted to
  AsyncStorage with key prefix `p6.`), fully offline question bank, AdMob rewarded ads, RevenueCat subscription.
- Grade P6 now (P4/P5 later as data; every path/type is keyed by `grade`).
- Map: each editor **chapter = one swipeable map page** (12 for P6; arrows, swipe, or the **Topics** button → side drawer listing every topic with levels done/total, tap = jump; `TopicPicker.tsx`, `logic/topicPicker.ts`); each **subtopic = a map node group** (62 for P6)
  with levels LV1/LV2/LV3 × 5 questions ("5-5-5").
- Live test web app (with 🛠 Dev Tools panel): **https://catapult-math-athletes.web.app**
  (separate from the question editor site `primary-math-sg.web.app`).

### Current agreed behaviour (do not regress)
| Area | Rule |
|---|---|
| Unlock | Maps open for the topics marked learnt at sign-up; **none marked → topic 1's map opens** (`ensureGrade` in `src/store/progress.ts`). LV2 of any subtopic on a map unlocks only when **all LV1s on that map** are complete (5 stars); LV3 likewise needs all LV2s. `src/logic/unlock.ts` (`isLevelUnlocked`, `nextMapLevel`). |
| Key question | "Find the key" (`KeyModal.tsx`): the question is picked once per locked topic map and **stays the same until the key is earned**; "Not now"/closing/reopening shows the same one. Remembered in `useProgress.keyQuestions[grade][topicId]` (persisted, cleared by `reset`, i.e. per account), forgotten when the topic unlocks; if the remembered question is retired/missing from the content a new one is picked. After a **wrong answer** (owner decision 18 Oct 2026) an MCQ can be **tried again** ("Try again", same question, as often as they like; each wrong try costs **1 heart**, 0 hearts → the out-of-hearts pop-up with "Not now"); tried options stay red and can't be picked again; the right one is never shown. "Try another question" still swaps to a new random one and "Not now" stays. Typed key questions keep one try. Pure logic `logic/keyQuestion.ts` (tested). |
| Wrong answers | A wrong answer **never reveals the right answer** (owner rule, 18 Oct 2026, so students cannot copy it): no green correct MCQ option (only the picked wrong one is red), no "Answer: ..." line, no worked solution. Wrong message / -1 heart / cat mood unchanged. **MCQ retry (owner decision 18 Oct 2026, map levels and the key question only):** after a wrong MCQ pick the student gets "Try again" (same question, the wrong option stays red and is disabled, the right one still not revealed) or "Skip" (moves on); every wrong try costs 1 heart (spent once per pick in `submit`; the level-end result does not touch hearts); a right pick on a retry is green with the normal +1 star. Typed questions and mini games: one try, unchanged. Applies to levels, mini games (5-Minute Challenge, Unlimited Mistakes, all-wrong) and the KeyModal. Right answers unchanged (green, +1 star, answer line in mini games). **Exception:** Classroom "Practice (show answer)" (`app/practice/[topicId].tsx`) reveals then self-marks. Pure rule `logic/feedback.ts` (`showCorrectOption`, `showAnswerLines`, tested), used by `QuestionPanel`. |
| Level buttons | Colour by level: LV1 blue (`node.default`), LV2 green (`node.l2`), LV3 yellow (`node.l3`, not the star yellow). Under each button a row of **5 small stars** (`LevelStars`, one per question answered right). With all 5 the button becomes the original raised **gold star** (`uiAssets.node.gold`, from the map pack). Never a flat star icon. Number text `{i+1}`. **No lock badge.** |
| Map theme | Map N shows only island N of the pack on the river (yacht marina, flooded city, suburbia, military base, ice, mountains, volcano, city at night, garbage dump, theme park, industrial platform, space base). |
| Map layout | Even spacing; gaps only between level groups; subtopic labels never overlap buttons/cat (`pickRect` in `TopicMapPage.tsx`). Spots come from `theme/mapPaths.ts` (`spots`): `map-scenes.py` cuts the maps, then `apps/mobile/scripts/map-spots.py` places buttons exactly evenly (level-group jump = 2 steps) in open water. |
| Cat on map | At the **furthest completed level** (`lastDone`), else first; stands **beside** that button and never covers any button (`placeCat` in `src/logic/mapLayout.ts`, tested). |
| Friends on map | Up to 8 friends' cats, each beside the **furthest level that friend completed on that map** (same order as yours); none completed there → not shown. Server: `getLeaderboard` friends scope returns `friendSpots` (`logic/friendSpots.ts`, topics from `copy-shared.mjs`); app: `useFriends().spots` → `TopicMapPage` `friendSpots`. Real users only: no sample players anywhere. |
| Cat in questions | Mood images change for correct ("great job") / wrong; the 5-min board clock (`CatTimer`) shows only while mood is `thinking` (`CatCompanion.tsx`) and **restarts for every question** in a level (the 5-Minute Challenge mini-game keeps one clock for the whole challenge). |
| Board clock everywhere | Any `thinking` cat is at its board (`CatCompanion` → `CatTimer`), never the looping laptop animation: floating (portrait), top-bar cat in landscape/desktop (size 88), KeyModal, mini games (timed: round length via `timerTotal`). |
| Sketch pad | `Scratchpad.tsx`: web uses raw Pointer Events (coalesced Pencil samples, pointer capture, live path set via ref, no React render per point); palm rejection = touches ignored within 5 s of pen activity; native uses PanResponder with memoized layers. |
| Hearts | 10 per day, refilled at local midnight (`src/logic/daily.ts`), +3 per rewarded ad, no recovery timer. Constants in `packages/shared/src/gameRules.ts`. |
| Stars | `packages/shared/src/stars.ts` (app + backend use the same rules). Level = 5 questions, 5 stars. Typed questions get **one try per attempt**: right → its star (+1, once ever); wrong → −1 heart and it moves on (doesn't come back in that attempt). **MCQs can be retried until right** (owner decision 18 Oct 2026): each wrong try −1 heart, "Skip" moves on, and a right pick on a retry still earns the star (`logic/levelSession.ts`: one answer per question, the latest pick; the server marks that final response, so backend and `stars.ts` are unchanged and an old server/app works too). The next attempt shows **only the questions without a star** (`levelQuestionsToPlay`). All 5 → complete (star button). A complete level replays all 5; the first replay with all 5 right pays **one bonus star per level** (not shown by the button). Mini games: +1 per question right that was never attempted before. Practice: none. **The server marks every answer itself** (answer key generated from the bundle by `backend/functions/scripts/copy-shared.mjs`; `logic/marking.ts`); clients send responses, never "correct". Server records: users/{uid}/levelStars/{grade}_{level} {correct, bonus}, attempted. App: progress `correctIds` per level (merged with the server's `levelCorrectIds`), ledger `src/store/stars.ts`. |
| Leaderboard | Title "Catapult Math Athletes"; race track (`RaceTrack.tsx`, `logic/raceTrack.ts`): only you + friends, x ∝ this month's stars, right = most, ~5 cats per screen, scrolls, ties in stacked lanes. Tabs Friends / School / Global (ranking = this month's stars). **Updates once a day at 23:55 SGT** (owner's choice, to save Firestore reads): `dailyBoardBuild` (Netlify `functions/board.mjs`) writes `leaderboardDaily/{date}/parts/*` + `leaderboardDaily/current`; `getLeaderboard` serves it from memory (`logic/dailyBoard.ts`), the caller's own row included; friends who joined since are read live. Below: Quests. |
| Daily quests | Leaderboard tab, above Quests (`DailyQuestsCard.tsx`, `DAILY_QUESTS` in gameRules.ts): answer 5/15/25 questions (any answer counts) → +1/+2/+3 stars, add a friend → +2; tap Claim (getDailyQuests / claimDailyQuest, SGT day). |
| Referral | Sign-up "Friend's code (optional)" (`store/referral.ts`); redeemed after bootstrap: inviter +5 (`REFERRAL_STARS`), new student +3 (`REFERRAL_WELCOME_STARS`), they become friends; map popup tells the result. |
| Quests | Lifetime stars 25/50/75/100/150/200 unlock quest-only looks (Rose, Golden Cap, Ocean, Royal Crown, Galaxy, Star Wizard; `QUESTS` in stars.ts). Claim → inventory (claimQuest callable); shown in the store as "Quest · N★", never sold. Skins: `scripts/cat-colors.py` (from the grey coat); hats: `scripts/quest-hats.py` (recolours). |
| Paywall | Heart icon, title "Unlimited hearts", no cat. |
| Buttons | Full black border all round (no coloured lip). |
| Screen sizes | Fill the whole window; layout by size class (`src/logic/screenClass.ts`, `useLayout()` in `theme/layout.ts`): phone (bottom tabs, one column, unchanged), tablet ≥700×500 (left icon rail, 2 card columns), desktop ≥1100×560 (left side menu with names, 3 card columns). Map: several topic maps side by side, each ≥380 wide, one title per map. Two panes side by side (Leaderboard ranking │ quests, Shop preview │ items, sign-in/onboarding cat │ form) only when the area is ≥900 wide. Questions: side by side in landscape, question over working space on portrait tablets; bigger picture/text on big screens. Never a centred phone column. |
| Editor edits | Edits in the question editor reach apps without a new bundle: `getQuestionPatches` (backend/functions/src/patches.ts) returns bundle questions edited after the bundle's snapshot (`last_edited_at`) from the per-instance patch cache (0 reads while warm, one incremental refresh per instance every 10 min, so editor edits reach apps in about 10 minutes), built by the same `content/src/question.ts` `docToQuestion` the build uses; retired = `excluded` or un-picked; `last_edited_at` is a Firestore Timestamp when saved by the editor app but an ISO string when written by our scripts, and a range query only matches its own type, so the backend runs both queries and merges (`mergeEditedPages`); the server marks with edited answers and `activeLevelIds` (`logic/patchCache.ts`). Content `npm run build` also writes `source-info.json` (snapshot time, figure sources, picks) that the backend needs: commit it with the bundle. |
| Notifications | Phone apps only (Android now, iOS later); the web app has none and never bundles `expo-notifications` (`src/services/notifications.ts` is the web no-op, `.native.ts` the real one; rules in `src/logic/notifications.ts`, tested). **Hearts full:** ONE notification (id `hearts-full`) at the next local midnight while hearts < 10 and not subscribed; cancelled when full/subscribed/off. **Practice reminder** (Profile > Reminders, **off by default**, then preselects 5:00 pm; time = −/+ buttons in 30-min steps 7:00 am to 9:30 pm; "hearts are full" toggle **on** by default): one notification per day (ids `practice-YYYY-MM-DD`) for the next 7 days at that time, never a repeating trigger; **today is skipped once the kid has answered a question today** (`lastPracticeDay` in `p6.notifications`, set by levels, mini games and practice). Rotating cat-themed lines using the cat's name, no guilt. Re-planned on start, on returning to the foreground, and when hearts, subscription, settings, cat name or practice change (`_layout.tsx` → `startNotifications`); signed out → all cancelled. **Permission** is asked only when a reminder is turned on or the first time hearts run out, never at first launch; denied → "Notifications are off for this app. Turn them on in your phone's Settings." Channel `reminders`. Tap opens the Map tab. Store `p6.notifications` is per account (reset with the others). No exact-alarm permissions. |
| Answer boxes | Typed answers are marked forgivingly (`packages/shared/src/answer.ts`: case, punctuation, labels like "Row 96, Column C" vs "96 C", key tokens in order; never looser on numbers; number + unit answers such as "22 cupcakes" accept the number). Under each open-ended box a small muted **format hint** (`answerFormatHint` in `answerHint.ts`: "Type a number (cupcakes)", "Type like: Row __, Column _"); hidden for MCQ, locked/view-only, and fraction answers (their helper row already explains). |
| Maths text | `RichText.tsx` + `logic/richLayout.ts`: fractions stacked with signs and whole numbers full size and centred on the bar; text wraps word by word; spaces around × ÷ + − = become no-break spaces between operands (`glueOperators`) so "2 ÷ 7" never splits. Litres show as capital **L** and millilitres as **mℓ** (owner, 18 Oct 2026; `litreSymbol` in `content/src/tokenizer.ts`, re-exported by question.ts; only right after a number, plain text only, never inside `$…$`; bare answer units l → L, ml → mℓ); typed answers accept l, L or ℓ (ml or mℓ). |
| Calculator | Calculator-allowed questions only. Portrait: bottom-sheet modal over the question (`CalculatorModal`). Landscape (question │ working space): `CalculatorPanel` covers the **working space, never the question**; panes under 420 px tall (landscape phones) use a compact layout (close + display left, keypad right) so every key fits. |
| Classroom (teachers) — backend | Contract `packages/shared/src/classroom.ts`; code `backend/functions/src/classroom.ts` (+ `logic/classroom|classAnalytics|milestones|qstats|levelStars|feedCache.ts`, tests `test/classroom.test.ts`). Teachers are Auth users of the STUDENT project with a `teachers/{uid}` doc (`node backend/scripts/add-teacher.mjs --project catapult-math-students --email … --name …`, password goes to a 0600 file, never to the terminal; `--disable`). All data is server-only (rules deny clients): `classes/{id}` (roster with birthdays, ≤60), `/posts`, `/tasks`, `/tasks/{id}/marks/{uid}`, `users/{uid}/qstats/{grade}` (+ `users/{uid}.classIds`, `.birthday`). **Teacher marks count like app answers** (`applyTaskMarks`): right → the question's star by `stars.ts` via the same `resolveLevelStars` as `submitLevelResult` (once ever, replay bonus once and never for a correction), wrong → `users/{uid}/wrong/{id}` bookmark (what Unlimited Mistakes reads) + qstats + the student's `homework` list; idempotent per (task, student, question); first mark = one attempt (`attempted/…`, leaderboard questionsDone). **qstats** (attempts, wrong, completed per map question) is one merge write in `submitLevelResult`, `submitMinigameResult` and marks. Diagnostics: one question per subtopic, level cycling LV1–3, max 12, deterministic (`pickDiagnostic`); in-app diagnostics are marked by `submitTaskAnswers` (unanswered = wrong, one submission per student). Auto posts: milestone on the first completion of a level and "levelled up to LVn" when the last LV(n−1) of a map completes (rule ported from `unlock.ts` to `logic/milestones.ts`), written to every class in `classIds` with fixed ids (never duplicated); birthday posts in the 00:00 SGT nightly from the class rosters (no user reads). Reads are cached per instance (class docs 60 s, feeds 60 s incremental, analytics 5 min); the reads-per-call table is at the top of `classroom.ts`. Uploads: `teacherUploadSignature` signs Cloudinary params with `CLOUDINARY_SECRET` (Netlify env, set by `deploy-netlify.mjs` from the local env) into folder `p6maths/classroom/<classId>`. |
| Classroom (student side) — app | Classroom tab → **My class** section on top (`src/components/MyClass.tsx`; keeps the mini games/practice below unchanged). Data: `getMyClassroom` on focus, at most every 2 min, cached per account in zustand `p6.classroom` (`store/classroom.ts`, cleared by `reset`), offline shows the cache; `services/classroom.ts`. **Not in a class** → card "You're not in any class yet. Ask your teacher to add you (your friend code is in Profile)." **Feed** newest first: teacher posts (attachments open in the browser, http(s) only), milestone ⭐ and birthday 🎂 posts. **Tasks**: in-app diagnostic → "Take test" → `app/test/[taskId].tsx` (QuestionPanel, one try, no hearts, no feedback, no right answer; all answers sent with `submitTaskAnswers`; summary shows the score only; the card then shows "Done: x out of y"); worksheets/paper tests are info only ("Worksheet from your teacher: Fractions · Level 1"). **Homework** = ids from `getMyClassroom.homework` → `/minigame/homework?ids=…` (Unlimited Mistakes rules; reported to the server as a "mistakes" round; a right answer hides it locally until the next fetch, the server drops it). On every fetch the homework ids are also flagged in `useWrong` (mergeWrong ignores server bookmarks for ids the device knows) and `pullAndMerge` runs, so teacher stars/wrong marks reach the map and Unlimited Mistakes. Pure helpers + tests `logic/classroom.ts`. **Dev mock** (no backend): `EXPO_PUBLIC_CLASSROOM_MOCK=1` or `?mock=1` on web (`?mock=empty` = in no class), `services/classroomFlag.ts` (read at load via `app/_layout.tsx`) + `classroomMock.ts`. |
| Classroom (teacher dashboard) — web | **/teacher** (web only; phones show "Open the teacher dashboard on a computer"). Own sign-in (email/password, same Firebase Auth as students) then `teacherGetDashboard`; `permission-denied` → "This account isn't a teacher account". `app/_layout.tsx` skips the student set-up (profile reset, account restore, server sync, route guard, Dev Tools button) while `segments[0] === "teacher"`, so a teacher login never creates or syncs a student profile. Code: `app/teacher/` (`_layout` = `TeacherGate`, `index` = dashboard, `print/[classId]/[taskId]`) and `src/teacher/`. Side nav: **Classes** (create / rename / delete, roster: add by friend code, remove, birthday MM-DD), **Posts** (text + PDF/image attachments uploaded straight to Cloudinary `…/v1_1/<cloud>/auto/upload` with the `teacherUploadSignature` fields, optional "Answers for …" task link, list + delete, milestone/birthday badges), **Worksheets & tests** (worksheet = topic → subtopic → level from the bundled curriculum; diagnostic = topic, paper or in-app, optional due date; per task Print, Answer key, Mark, Post answers), **Marking** (grid students × questions; click/Space cycles ✓ ✗ blank, keys 1/y 2/n 0, arrows move; save per student or Save all via `teacherMarkTask`, shows ★ awarded and the saved marks), **Analytics** (class % completed per topic and per question type, hardest questions filterable by topic/level, per-student topic bars + every question tried; the question text is in the row's tooltip and expands on click). **Print view** (`PrintSheet.web.tsx`): renders into a plain DOM node on `<body>` (the app root is hidden), A4 `@page` margins, header (class, title, date, Name/Class/Score line), questions numbered with the app's `RichText` + `FigureImg` (figures = Cloudinary via the web figure map), MCQ options + answer box, open questions "Ans: ____ unit" + dashed working box, `break-inside: avoid` per question, "Page n of N" footer, "Print / Save as PDF" = `window.print()` (disabled while pictures load); modes Worksheet / Worksheet + answer key / Answer key only (`?answers=1`). API: typed wrappers `teacherApi` appended to `src/services/api.ts`; `src/teacher/client.ts` picks the real backend or the **dev mock** (`?mock=1` on web or `EXPO_PUBLIC_TEACHER_MOCK=1`; flag read once at load; `mock.ts` keeps classes/posts/tasks/marks in localStorage `p6.teacherMock.v1`, stats and analytics generated from the real bundle). Pure helpers + tests: `helpers.ts`, `analytics.ts`. Past posts load with `teacherListPosts {classId; before?} → {posts}` (newest 30). **Live since 21 Oct 2026:** backend deployed, full flow checked live with a test teacher and a throwaway student (17/17 checks: sign-in, class, roster, birthday, post + list, upload signature, worksheet, marking + stars + idempotent, diagnostic, student feed/test/homework, analytics), test data deleted, test teacher `classroom-test@catapult-test.invalid` disabled. Real teachers: `add-teacher.mjs` (owner runs it). Test `test/classroom.test.ts` "callable wiring" checks every callable in `netlify/handler.mjs` is exported from `src/index.ts` (a missing export answers "internal"). |
| Classroom admin — backend | Owner dashboard backend (UI is built separately under `app/admin`). Contract `packages/shared/src/admin.ts`; code `backend/functions/src/adminDashboard.ts` (named so because `src/admin.ts` is the Firebase Admin SDK setup), pure rules `logic/admin.ts`, tests `test/admin.test.ts` (+ the wiring check). Ten callables `adminGetOverview, adminSaveTeacher, adminSetTeacherActive, adminResetPassword, adminFindUser, adminSetUserDisabled, adminSaveClass, adminDeleteClass, adminAddStudent, adminRemoveStudent`, all listed in `netlify/handler.mjs` and exported from `index.ts`. Admins are Auth users of the STUDENT project with an `admins/{uid}` doc (`active`), created only by `node backend/scripts/add-admin.mjs --project catapult-math-students --email … --name … [--disable] [--reset-password] [--out-dir] [--dry]` (an email that already has a login, e.g. the owner's Google account, is reused and gets NO password unless `--reset-password`; a generated password goes to a 0600 file, never the terminal). `requireAdmin` reads `admins/{uid}` (cached 60 s per instance); `permission-denied` "Not an admin". Passwords (teacher create, reset) are 16+ readable chars from `crypto.randomInt`, set through `auth`, returned once in the response, never logged or stored. Class/roster work reuses the teacher code (`deleteClassCascade`, `addStudentToClassByCode`, `removeStudentFromClass` exported from `classroom.ts`, so `CLASS_LIMITS`, `users/{uid}.classIds` and the caches behave identically); admin reads the class fresh (1 read) before roster writes. `adminSaveClass` with a new/changed teacher requires that teacher to exist, be active and have < 30 classes. `adminSetTeacherActive` / `adminSetUserDisabled` refuse the caller's own uid and revoke refresh tokens when disabling. `adminFindUser` takes a friend code (`friendCodes/{CODE}`), an email (`getUserByEmail`) or a uid and returns at most one row (+ `users/{uid}`, `teachers/{uid}`); no "list all users". Every write appends an `adminLog` doc (`at, adminUid, action, target, detail`; no secrets; a failed log write is only reported on the server). Rules: `admins` and `adminLog` are covered by the deny-all catch-all (listed in `test-rules`). Reads-per-call table at the top of `adminDashboard.ts`. Caveat: in the old single-project mode (no `STUDENT_*` vars) `admins` is the question editor's own collection; run the dashboard only with the split projects (live since 18 Oct 2026). |
| Classroom admin — web | **/admin** (web only; phones show "Open the admin dashboard on a computer"), for the owner. Contract `packages/shared/src/admin.ts`. Same sign-in as the teacher dashboard (email/password), then `adminGetOverview`; `permission-denied` → "This account isn't an admin account". `app/_layout.tsx` treats `segments[0] === "admin"` exactly like `"teacher"` (`inTeacher` flag: no student set-up, route guard or Dev Tools). Code: `app/admin/` (`_layout` = `AdminGate`, `index`) and `src/admin/` (`client.ts` real callables or the **dev mock** via `?mock=1` / `EXPO_PUBLIC_ADMIN_MOCK=1`, `mock.ts` in localStorage `p6.adminMock.v1`, `store.ts`, `Gate/Shell/ui`, `sections/{Teachers,Classes,Logins}`, `helpers.ts` pure + tested); reuses `src/teacher/ui.tsx` components so it looks the same. Typed wrappers `adminApi` appended to `src/services/api.ts`. **Teachers:** list (name, email, active, classes), Add teacher (name + email → `adminSaveTeacher`), rename, Disable/Enable and Reset password (two-step confirm). **Classes:** all classes (name, level, teacher, students), filter by teacher, New class (name, level, teacher dropdown), per class rename, Move to teacher (dropdown + confirm), Delete (type the class name), roster add by friend code / remove. **Logins:** one search box (friend code, email or uid → `adminFindUser`, max 5) showing name, email, sign-in method, friend code, level, class names (from the overview), teacher/disabled badges, created and last sign-in dates; actions Disable/Enable sign-in, Reset password (only for `password` logins), Add to class (their friend code → `adminAddStudent`), Remove from a class, Make teacher (`adminSaveTeacher` with their email + name). **Passwords** (new teacher login, reset) are shown ONCE in `SecretBox` with Copy and "Give this to the teacher privately. It won't be shown again."; they live only in the opened box's state, are dropped on Close/next search, and are never logged or stored. Changes are patched into the store locally (no re-read; the backend overview is cached 60 s). Tested 22 Oct 2026 with the mock only (no live backend calls): Playwright Chromium 1280x800 on a scratch `web-preview.py` build. |
| Practice (Classroom) | "Practice (show answer)": reveal, then self-mark "I got it right / wrong". **No hearts, stars or wrong-answer bookmarks** (by design); it only counts as today's practice for reminders. |
| Content level rules | Per-subtopic picking rules in `content/src/subtopicRules.ts`: "Addition and Subtraction of Fractions and Mixed Numbers" levels exclude algebra and ×/÷ questions, prefer real add/subtract ones, and fill short levels from the nearest difficulty (build prints which). |
| Friends / profile | Entering your own friend code says "That's your own code. Ask your friend for theirs." Delete account (grown-up gate + type DELETE) deletes everything server-side, on every device, and takes the player off the saved daily leaderboard at once. Profile > Reminders shows on phones only. |
| Dev Tools 🛠 | On in the live web app and the tester APKs (`EXPO_PUBLIC_DEV_TOOLS=1`) for testers; the floating button can cover a card corner on phones. Turn off only when the owner says (open question, §9). |
| Question figures (web) | The web app ships NO figure bytes (Firebase Hosting transfer): `web-preview.py` writes `figures-<hash>.json` {question id → [Cloudinary URL, w, h]} from the committed `assets/content/P6/source-info.json` `figureSources` (the editor `figure_url` each bundled figure came from; kept in sync because `content build` rewrites it with the bundle) plus the pixel size of the committed `figures/*.webp`. URL = `…/image/upload/f_auto,q_auto,w_1200,c_limit/<version…>`; the page's `__P6_LOAD__` looks an id up in the map, `__P6_RELOAD__` (tap to retry) re-requests with a cache-busting `?retry=`; an id missing from the map shows the "Picture didn't load" box. Live patches with `figureUrl` still override. Phones keep their bundled packs (offline). |
| Question figures | Figure only; only text allowed is labels inside the figure. Parts separated by question text are cropped separately and stacked; text that can't be cropped out is whited out. Never under/over-crop. |

## 2. Repo map
```
packages/shared/   @p6/shared   types.ts, gameRules.ts, answer.ts (answer checking), api.ts (callable contract), classroom.ts (classroom contract: teachers, classes, posts, tasks, marks, analytics), admin.ts (owner dashboard contract)
content/           @p6/content  editor Firestore → raw snapshot → app bundle
  src/sync.ts        sync + credentials (loadCredentials, accessToken, makeDispatcher for HTTPS_PROXY)
  src/build.ts       build bundle; figure lookup = raw/<grade>/figures/<sanitizedId>.{webp,png,jpg,jpeg,gif} (first hit wins)
  scripts/apply-recrops.ts   upload re-cropped figures to Cloudinary + PATCH figure_url (dry run + undo manifest)
  scripts/fix-options.ts     example of a targeted editor fix (π options)
  recrops/P6/        verified re-cropped figure PNGs named <questionId>.png (input for apply-recrops)
  reports/           audit + undo manifests for every editor write
  raw/               (git-ignored) snapshot + downloaded figures + figures/.sources.json URL manifest
backend/           student backend in the editor project primary-math-sg (Spark; Firestore db "default", rules merged with the editor's); functions/ = backend code, run on Netlify via netlify/ (see backend/README.md)
apps/mobile/       Expo app
  app/               routes: (onboarding)/, (tabs)/map|classroom|leaderboard|store|profile, level/[grade], practice/[topicId], minigame/[mode] (incl. homework), test/[taskId]
  app/teacher/       /teacher teacher dashboard (web): _layout (TeacherGate), index (side nav + sections), print/[classId]/[taskId] (A4 print view)
  src/teacher/       dashboard code: client.ts (real callables or ?mock=1), mock.ts, store.ts, Gate/Shell/ui, sections/{Classes,Posts,Tasks,Marking,Analytics}, PrintSheet(.web), helpers.ts + analytics.ts (pure, tested)
  app/admin/         /admin owner dashboard (web): _layout (AdminGate), index (side nav + Teachers / Classes / Logins)
  src/admin/         dashboard code: client.ts (real callables or ?mock=1), mock.ts, store.ts, Gate/Shell/ui, sections/{Teachers,Classes,Logins}, helpers.ts (pure, tested); reuses src/teacher/ui.tsx
  src/components/    TopicMapPage, CatCompanion, CatTimer, CatAvatar, QuestionPanel, Paywall, Calculator, ui.tsx, FigureViewer, RichText…
  src/logic/         unlock, daily, timer, calculator, psle, strokes, levelSession (vitest tests alongside)
  src/store/         player (hearts), progress, profile, cosmetics, friends, queue, wrong…
  src/dev/           DevToolsPanel (on in dev builds and when EXPO_PUBLIC_DEV_TOOLS=1): simulate midnight, set meters, unlock,
                     stars/quests (lifetime → 24/49/…, lock/unlock quests), star rules (forget starred levels / attempted
                     questions), leaderboard (set/clear school)…. There are no sample players: friends, school and
                     global boards show only real users from the backend
  src/theme/         assets.ts (uiAssets), cats.ts (catMoodImage), mapPaths.ts (generated), colors.ts
  assets/content/P6/ GENERATED bundle: questions.json, curriculum.json, source-info.json, figures/*.webp + manifest.json (only content/ writes here); figpacks/ = packs built on npm install (gitignored)
  scripts/web-preview.py   build dist-preview/ (Dev Tools on; web pictures come from Cloudinary via figures-<hash>.json, no figure files)
  scripts/deploy-hosting.ts  deploy a folder to Firebase Hosting site via REST
  scripts/map-layers.py    one-off: render river + 12 themed islands from the pack PSD into map-pack/layers/ (committed)
  scripts/map-scenes.py    map-bg-N.webp = river + ONLY chapter N's island (1 yacht marina … 12 space base), + route, aspects
  scripts/map-spots.py     even button spots per map from map-bg-N.webp (run after map-scenes.py)
editor-hosting/    the question editor's hosting files: live copy (17 Oct 2026) + delta-v6 = read-saving change (local cache,
                   only edits since last sync; DEPLOYED 18 Oct 2026, index access_key+last_edited_at built). Deploy editor
                   files ONLY with editor-hosting/deploy-editor.mjs (keeps the live config + every live file; pull + diff live first)
docs/              WORKFLOW.md (spec), ARCHITECTURE.md (contract), OPEN_QUESTIONS.md
design/source-assets/  originals not shipped; map-pack/pack.zip = the artist's map pack ("Game Level Map for Water Games":
                   full river map PNG/PSD, per-island PNGs, separated object layers); map-pack/layers/ = river.png,
                   island-N.png, layers.json rendered from its PSD (what map-scenes.py uses).
.claude/agents/    backend-builder, frontend-builder, integrator agent definitions
```

## 3. Access & credentials (by environment)
Never commit keys. `.gitignore` already covers `.env*`, `service-account*.json`, `*-firebase-adminsdk-*.json`.

| What | Env var(s) the code reads | Needed for | Role / notes |
|---|---|---|---|
| Editor Firestore + Hosting service account | `FIREBASE_SERVICE_ACCOUNT_B64` (base64 of key JSON, preferred: single line), or `FIREBASE_SERVICE_ACCOUNT_JSON`, or `GOOGLE_APPLICATION_CREDENTIALS` (path) | `content sync`, editor writes (apply-recrops, fix-options), `deploy-hosting.ts` | Project `primary-math-sg`. Read-only (Cloud Datastore Viewer) is enough for sync; editor writes need Datastore User; deploy needs **Firebase Hosting Admin**. |
| Cloudinary signed uploads | `CLOUDINARY_SECRET` (key defaults to `465242564664612`, override with `CLOUDINARY_KEY`) | uploading figures (`apply-recrops.ts`); **also on Netlify** for the classroom's `teacherUploadSignature` (answer sheets → `p6maths/classroom/<classId>`): `deploy-netlify.mjs` copies it from the local env (never printed); without it the callable answers `failed-precondition` | Cloud name `n9gn4u6k`. Edited figures live at `p6maths/figures_edited/<id>_recrop`; source PDFs at `p6maths/pdfs<year>/…` (raw resources, public URLs `https://res.cloudinary.com/n9gn4u6k/raw/upload/<public_id>`). |
| App runtime config | `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_REVENUECAT_*_KEY`, `EXPO_PUBLIC_ADMOB_*` (app ids + rewarded unit ids), `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`, `EXPO_PUBLIC_BUNDLE_ID` | real builds | Placeholders (Google test ad ids, `PLACEHOLDER`) keep builds working; see `app.config.ts`. |
| Dev tools in a build | `EXPO_PUBLIC_DEV_TOOLS=1` | test web build / internal APKs | `web-preview.py` sets it. |
| EAS / stores | `EXPO_TOKEN` (Expo access token, environment settings), Apple/Google accounts | store builds | One codebase for web, Android, iOS. App ID `sg.catapultmathathletes.app` (permanent once in a store). Profiles in `apps/mobile/eas.json` (development / preview = installable APK / production). Test ads (Google sample ids) until real AdMob ids are set. Android blocks storage/overlay/camera/mic permissions (Families policy). Phones lock portrait outside questions; tablets rotate freely. Placeholder icon `assets/ui/app-icon.png` + `adaptive-icon.png`. Google sign-in on Android is native (`@react-native-google-signin/google-signin`, `src/services/googleNative.android.ts`): `configure({webClientId})` with the web client id, plus an Android OAuth client registered for the release key SHA-1 (a new signing key needs its SHA-1 added in Firebase). iOS needs `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (also enables the library's config plugin). Native change shipped as version 0.2.0. |
| Android signing key | Firestore `app_secrets/android-signing` (master-only by rules): `keystore_p12_b64`, `password`, `alias` (catapult), SHA-1 95:5C:9B:…:4F:E3, SHA-256 4D:FB:23:…:22:2A | every APK/AAB | Same key forever, or installs/updates break. Read it with the setup service account into a 0700 dir outside the repo (never print it); local builds inject it via `android.injected.signing.*` Gradle properties (`node scripts/android-key.mjs`, then `--write-gradle-props`; check it printed "wrote signing properties"; `--remove-gradle-props` afterwards). **Always check the built APK with `apksigner verify --print-certs`: SHA-256 must be 4dfb2351…cff9222a.** Without the properties Gradle silently signs with the debug key (17 Oct 2026: caught before sending); for EAS upload it as the Android keystore. Netlify/Secret Manager are not options (free plan / no billing). |
| Android APK + updates | `docs/ANDROID.md` | testers | Expo project dheems-team/catapult-math-athletes (id ea8a1c9d-…, GitHub linked, base dir apps/mobile). Push touching apps/mobile or packages/shared → `.eas/workflows/publish-update.yml` publishes an OTA update to channel `preview` (`[eas skip]` to skip). Native change → bump `version`, build APK locally. Same native code but OTA unavailable (Expo CI minutes used up until 1 Nov 2026) → new APK with the **same `version`** and a higher `android.versionCode` (installs over the old one; all copies keep taking OTA updates). Then `node apps/mobile/scripts/deploy-apk.mjs` → https://catapult-math-athletes-download.netlify.app. Figures ship as packs (`build-figpacks.mjs`, postinstall): EAS updates allow max 1000 assets. |
| Student project (in progress) | `STUDENT_PROJECT_ID`, `STUDENT_SETUP_SERVICE_ACCOUNT_B64` (Owner on the student project); on Netlify: `STUDENT_SERVICE_ACCOUNT_B64`, `STUDENT_DATABASE_ID` (`(default)`), `EDITOR_SERVICE_ACCOUNT_B64`, `EDITOR_DATABASE_ID` (`default`), `LEGACY_AUTH_PROJECT_ID` (`primary-math-sg`) | `migrate-students.mjs`, `setup-project.mjs --student`, `deploy-rules.mjs --student-only`, `deploy-netlify.mjs` | Without the STUDENT_* vars the backend uses `BACKEND_SERVICE_ACCOUNT_B64` + `FIRESTORE_DATABASE_ID` as before. |
| Backend | `FIREBASE_SERVICE_ACCOUNT_B64` (Owner on primary-math-sg), `NETLIFY_AUTH_TOKEN` | `backend/scripts/setup-project.mjs`, `deploy-rules.mjs` (merges student rules into the editor's), `editor-reports.mjs` (student reports in the editor), `deploy-netlify.mjs`, `add-teacher.mjs` (classroom teacher logins in the student project) | Same project as the editor, Spark (no billing); API on Netlify's free plan. Steps in backend/README.md. |

### Cloud agent containers (Claude Code on the web, Codex cloud, other hosted agents)
- `npm run setup` works there too; `npm run doctor` shows what is missing. Cloud setup scripts can call
  `bash scripts/setup.sh` (Claude Code: `.claude/settings.json` runs `--quick` on session start).
- Add secrets in the environment settings (Claude Code: session title bar → cloud environment menu → **Edit** →
  environment variables; Codex / others: their environment's secret settings) (`FIREBASE_SERVICE_ACCOUNT_B64`, `CLOUDINARY_SECRET`, …). **Only sessions started after the change see
  them** — an already-running session must spawn a new session (same environment) or the user starts one.
- Check presence without printing values: `env | cut -d= -f1 | grep -x CLOUDINARY_SECRET`.
- Outbound HTTPS goes through `HTTPS_PROXY` (CA: `NODE_EXTRA_CA_CERTS`). Node code must use `makeDispatcher()`
  (undici `ProxyAgent`) — already done in sync/deploy/apply scripts. The network policy must allow
  `firestore.googleapis.com`, `oauth2.googleapis.com`, `firebasehosting.googleapis.com`, `api.cloudinary.com`,
  `res.cloudinary.com`. A 403 from the proxy = host not allowed → change the environment's network setting.
- The safety layer blocks typing a secret literally into a command (e.g. `curl -u key:secret`). Always read it from
  the env var inside the script.
- Chromium for Playwright: `/opt/pw-browsers/chromium` (never `playwright install`); playwright module may be at
  `/opt/node-tools/node_modules/playwright`.
- GitHub access depends on the agent (Claude Code cloud: no `gh`, use GitHub MCP tools). Push: `git push -u origin <branch>` with retries on network errors.
- Disk is a fixed allowance; delete `dist-web-raw/`, `dist-preview/`, caches if "no space left".

### Local machine (Mac/Linux)
- Node 22 (`.nvmrc`), Python 3 with `pillow numpy scipy` (+ `pymupdf opencv-python-headless pytesseract` for figure work, `tesseract` binary).
- Put the service-account key outside the repo and `export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json`
  (or `FIREBASE_SERVICE_ACCOUNT_B64=$(base64 -w0 key.json)`); `export CLOUDINARY_SECRET=…` in your shell profile or a
  git-ignored `.env` you `source`.
- No proxy needed (code only uses one when `HTTPS_PROXY` is set).
- Phone builds need a dev client (ads/IAP native modules): `cd apps/mobile && npx expo run:ios|run:android` or
  `eas build --profile development`.

### Desktop agents (Claude desktop/Cowork, Cursor, Copilot, Gemini CLI, Codex CLI …)
- Same env var names. If the agent can't hold env secrets, the user runs the one credentialed command locally
  (e.g. `CLOUDINARY_SECRET=… npx tsx scripts/apply-recrops.ts recrops/P6`) — prepare everything else and the exact
  command. The `anthropic-skills:p6-maths-editor` skill covers the editor web app (primary-math-sg) itself.

## 4. Everyday commands
```bash
npm run setup                                 # install + checks (bash scripts/setup.sh; --verify --browser --android)
npm run doctor                                # what works here + live service status
npm test                                      # all workspaces (vitest) + backend functions
cd apps/mobile && npm test && npx tsc --noEmit
cd content && npm test

# content
cd content && npm run sync -- --grade P6      # editor → content/raw/P6 (snapshot + figures; re-downloads a figure only when its URL changed)
cd content && npm run audit -- --grade P6     # → content/reports/P6-audit.md
cd content && npm run build -- --grade P6     # → apps/mobile/assets/content/P6 (prints "Built P6: N questions … 62 subtopics …")

# web test build + deploy (needs Hosting Admin service account)
cd apps/mobile && python3 scripts/web-preview.py
cd ../../content && npx tsx ../apps/mobile/scripts/deploy-hosting.ts ../apps/mobile/dist-preview
# serve locally instead: cd apps/mobile/dist-preview && python3 -m http.server 8080

# map scenes (after new map art or chapter changes)
cd apps/mobile && python3 scripts/map-scenes.py   # from map-pack/layers; rewrites map-bg-N.webp, mapPaths.ts, aspects in assets.ts (~20 s)
cd apps/mobile && python3 scripts/map-spots.py assets/content/P6/curriculum.json   # then: even button spots (~2 min)
```

## 5. The editor question bank (source of truth for content)
- Firestore project `primary-math-sg`, **database id `default`** (literally, not `(default)`), collection
  `questions`, doc id `{year}_{source_id}`. REST base:
  `https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents/questions/<id>`.
- Writes: REST `PATCH …?updateMask.fieldPaths=<field>` with a service-account JWT (scope `cloud-platform`), stamp
  `last_edited_by` (e.g. `"app-recrop"`), always re-read live before writing, save `{id, old, new}` undo JSON in
  `content/reports/`. Pattern: `content/scripts/apply-recrops.ts`, `fix-options.ts`.
- Schema highlights: `difficulty` LV1|LV2|LV3 (LV1 = all MCQ), `question_type`, `question`, `question_parts`,
  `answer*`, `options{"1".."4"}`, `answer_key`, `figure_url` (Cloudinary), `verified`, `has_error`, `selected`,
  `selected_rank`, `chapter`, `chapter_no` (99 = removed), `source_pdf_url`, `source_pdf_page`. LaTeX in `$…$`;
  currency uses fullwidth `＄`.
- Editor's own `selected: true` picks fill the levels first; the rest is deterministic scoring (see ARCHITECTURE.md).

## 6. Question figure workflow (what "fixed" means and how it was done)
Goal: image shows only the figure (+ its labels). Method used for the 2026-10 clean-up (188 flagged → 184 re-cropped):
1. Find figures containing question text: OCR every figure (`pytesseract image_to_data`, run with
   `OMP_THREAD_LIMIT=1` and 4 processes — otherwise extremely slow; write results incrementally to jsonl).
   Flag lines that match the question stem/options or page furniture ("Go on to the next page", "[2 marks]", sgexam…).
2. **Review every flagged figure by eye** on gridded contact sheets (grid in tenths) next to its stem/options;
   automatic cleaning was unreliable (removed table rows, left half sentences) — do not trust it.
3. Decide per figure: list of crop boxes (stacked top→bottom with a white gap), `[]` keep, `pdf` (re-cut from source
   PDF because the scan itself is cut off), or `drop` (figure not needed). Add white-out rectangles for text that
   can't be cropped away.
4. Re-cut from PDF: download the source PDF (Cloudinary raw `p6maths/pdfs<year>/…` or `source_pdf_url`), locate the
   page by OpenCV template matching (`cv2.matchTemplate` TM_CCOEFF_NORMED over scales) of the old figure against
   pages rendered with PyMuPDF at ~50 dpi, then crop at 170 dpi.
5. Build: trim to ink (+10px), stack parts, save PNG; make 4×4 contact sheets and zoom views; fix any clipped label
   or leftover text; repeat until clean. Answer options that the app already shows as text/fractions must NOT be in
   the image (visual-option MCQs keep them).
6. Ship: copy PNGs to `content/raw/P6/figures/<id>.png` (png beats jpg in lookup), `npm run build`, commit bundle;
   save PNGs to `content/recrops/P6/<questionId>.png`; push to editor with
   `npx tsx scripts/apply-recrops.ts recrops/P6 --dry` then without `--dry` (needs `CLOUDINARY_SECRET` + service
   account). Then `npm run sync && npm run build` so raw/bundle match the editor.
Note: scratch tools for this (OCR scan, gridded sheets, zoom, crop builder) lived in the session scratchpad and are
not in the repo — recreate from the description above if needed.

**Cut-off audit, 16–17 Oct 2026** (testers: "many photos are cut, esp. angles"): all 1,644 bundle figures checked,
**421 re-cut and applied** (report + per-chapter fixed-id tables: `content/reports/figure-cut-audit-2026-10-16.md`;
undo: `content/reports/figure-cut-recrops-undo-2026-10-17.json`). Method:
- Candidates = dark ink within 3 px of an image edge (841); then **every figure reviewed by eye** (the by-eye pass also
  found wrong/blank images, ~90 of the 421). OCR was too noisy on scans.
- Before/after sheets: "before" must be the image the app ships, `git show HEAD:apps/mobile/assets/content/P6/figures/<id>.webp`,
  never `content/raw/...` (it gets overwritten by the new file).
- PDFs: `source_pdf_url` is null for many 2024–2026 questions; match the PDF by year + school name and check by eye.
  Template-match scores below ~0.5 are unreliable: leave those for a human.
- Apply **only the new recrops**: copy just those PNGs into a scratch folder and run apply-recrops on that folder
  (`recrops/P6` holds every recrop ever made; re-applying old ones re-uploads them). `git diff --name-only
  --diff-filter=A <before> HEAD -- content/recrops/P6` lists the new ones.
- After applying, the live API serves the new `figureUrl`s as patches within ~10 min; but **deploy the backend with
  the rebuilt bundle the same day** (see §8: otherwise every cold start re-reads all the edits). Also run `npm run sync && npm run build` so the offline bundle/APK carry them (content version
  stays the same when only figures change).
- Left for a human (see the report): 2023_Temasek_P1A_Q10, 2024_Rosyth_P1_Q30 (cut, PDF match too weak);
  2022_MGS_P1_Q24, 2022_MGS_P2_Q17, 2022_Catholic_P2_Q15 (image has no figure: remove it in the editor);
  2026_TN_P1_25, 2024_RedSwastika_P1_Q20 (label cut in the scan itself).
- **Non-figure editor edits** (answer key, option texts, stems) go through `content/scripts/apply-edits.ts`: it applies a JSON list
  `[{id, field, old, new, reason}]` (e.g. `content/reports/tester-fixes-2026-10-18.json`; `field` = `answer_key`, `question`,
  `options.2` …). Run `npx tsx scripts/apply-edits.ts <file> --dry` first; it re-reads each doc live, refuses everything when
  live != `old`, stamps `last_edited_by` "app-tester-fix" + `last_edited_at`, and writes `reports/edits-undo-<stamp>.json`.
  Prepared 18 Oct 2026 (tester round, NOT yet applied: editor over read quota): 2026_Raffles_Girls_P1A_Q09 key 2 -> 3 (marking
  scheme Q9 = 3; M's V is a right angle), Catholic High Q09 / MGS Paya Lebar Q10 picture-option texts -> "Visual option N",
  Ai Tong Q06 stem loses "Use the information below to answer Questions 6 and 7." Re-cuts in `content/recrops/P6/`: Red Swastika 2025 Q11
  and Ai Tong 2026 Q11 (full grid border), ACS Junior 2025 Q07 (prism + 3 cm + incomplete net), Catholic High 2026 Q09,
  MGS Paya Lebar 2025 Q10 (nets (1)-(4)); apply with apply-recrops on a folder holding just those five.

**Mismatch review, 18 Oct 2026** (reviewers looked at each question next to its figure; ~33 flagged, 16 re-cut, 3 figures removed, 2 text fixes; table per id in
`content/reports/figure-cut-audit-2026-10-16.md` "Mismatch review 18 Oct", fixes in `content/reports/figure-mismatch-fixes-2026-10-18.json`, not yet applied). Method:
find the question's page by OCR of its text (word overlap per page, not by template-matching the old figure: a low match score is a false alarm as often as a real
mismatch), look at page and shipped figure side by side, then decide: ok / re-cut (wrong or incomplete picture, also stacked parts such as Figure A + B or table + graph) /
remove (`figure_url` null + `figure.required` false in the edit list; the paper really has no picture) / text fix (only when OUR text differs from the paper).
Lessons: "figure" shown can be another question's (Nan Hua 2026 Q7/Q8 carried Q12/Q13; SCGS 2021 reused 2022's pictures); a question whose paper
figure exists is NOT text only (Catholic 2022 Q15 bolt/nut); the editor can hold text copied from another school (2026_RG_P2_10 = Red Swastika's muffin question);
ids with spaces (`2023_St Nicholas_P2_Q2`) keep the space in `recrops/P6/` and `apply-edits` but `_` in `raw/P6/figures/`. After removing a figure delete its raw file
before `npm run build`. Recrops that overwrote earlier ones (`git status` shows them as modified) must be applied too.

## 7. Testing the app in a browser
- `web-preview.py` → `dist-preview/`; serve with `python3 -m http.server PORT`; drive with Playwright
  (Chromium path above). Use the Dev Tools panel to unlock levels, set hearts, simulate midnight.
- Check: map colours/gold nodes/no lock badges, cat position, label overlap, level flow, cat moods, paywall,
  question figures.
- **Without an account or backend** (fast, no Firestore reads): `npx expo export --platform web --output-dir <scratch>`,
  serve with a static server that falls back to `index.html`, seed localStorage (`p6.profile` guest profile,
  `p6.progress` with topics unlocked), block non-localhost requests in Playwright. Used to check the Topics picker and
  the landscape calculator (17 Oct 2026). Don't leave build output in the repo.
- **Teacher dashboard** (no backend needed): open `/teacher?mock=1`, click through the five sections; print view at `/teacher/print/c1/<taskId>?mock=1` (task ids in the mock: `tk1`, `tk2`, `tk3`); check pagination with Playwright `page.emulateMedia({media:"print"})` + `page.pdf({format:"A4", preferCSSPageSize:true})`. To build into a scratch folder copy `web-preview.py` with `EXPORT`/`OUT` changed. Gotcha: the script writes and then **deletes** `assets/content/P6/figures/index.web.ts`, which is tracked: run `git checkout -- apps/mobile/assets/content/P6/figures/index.web.ts` afterwards.
- **QA sweep of the live web app** (owner asked for it): several small-model test agents in parallel, one area each
  (sign-up/profile/delete; map/topics/levels; leaderboard/quests/shop/friends; classroom/practice/calculator), **one
  account each** (`qa-<area>-<digits>@example.com`, credentials saved in the scratchpad) deleted through Profile at
  the end; screenshots at 390×844, 844×390 and 1280×800; report bugs with screenshots, no code changes. The
  orchestrator verifies each finding (several were by design) before fixing.

## 8. Troubleshooting
- Editor UI edits never reach apps (live edits missing) -> `last_edited_at` type mismatch: the editor saves a Timestamp, our scripts an ISO string; `getQuestionPatches` must query both types (fixed in `patches.ts`; keep it when touching the patch code).
- `No Firebase credentials found` → set one of the §3 env vars (new session in cloud).
- Proxy 403 / ECONNRESET in cloud → host not in network allowlist; see `/root/.ccr/README.md`.
- `sharp` install issues → optionalDependencies pin linux/darwin binaries; reinstall in `content/`.
- Bundle contains stale figure → raw file still old; check `content/raw/P6/figures/.sources.json` and that the
  editor `figure_url` changed; delete the raw file and re-sync.
- Background shell commands time out at 30 min by default; long OCR/render jobs must save progress incrementally.
- **Firebase Hosting "8 GB of 10 GB monthly"** (18 Oct 2026) = download transfer of the web app, not Firestore. Cause:
  the web start-up downloaded ALL figure packs (~29 MB) on every first visit (every test browser too). Fixed first by Range requests (first visit ~1.5 MB); since 18 Oct 2026 the web build
  ships no figure bytes at all: pictures load from Cloudinary (see "Question figures (web)"; start-up fetches only `figures-<hash>.json`, ~26 KB gzipped).
  Cloudinary free plan: 25 credits/month (1 credit = 1 GB delivery or 1,000 transformations); each distinct f_auto URL is transformed once, then cached. Watch it if web traffic grows.
  Hosting keeps at most 10 versions of catapult-math-athletes (`maxVersions`). Test the web app on LOCAL builds
  (`expo export` / web-preview.py + a local server) and keep live-site test runs few: each fresh browser downloads the app.
- **Every backend call returns 500, or the question editor won't let you sign in** → check the Firestore daily read
  quota first (Spark plan; the editor needs reads to log in too). Quick test: any REST read returns 429 "Quota limit
  exceeded". Per-source read counts (Cloud Monitoring) need billing, so they can't be checked on Spark.
- **Big editor edits make every backend cold start expensive** (17 Oct 2026: 421 figure fixes → quota gone again the
  same day). Each fresh Netlify instance reads every question edited since the backend's bundled snapshot
  (`patchCache`). After any bulk editor write: `cd content && npm run sync && npm run build`, commit, then deploy the
  backend once so its snapshot is newer than the edits (cold start back to ~1 read).
- **Every backend call returns 500** → check the Firestore daily read quota first (Spark plan). Wait for the reset
  (~15:00 SGT) or enable billing; nothing else fixes it.
- **APK signed with the wrong key** (SHA-256 not 4dfb2351…) → the signing Gradle properties were missing; fetch the
  key (`node scripts/android-key.mjs`), `--write-gradle-props`, rebuild (incremental, a few minutes), verify again.
- **Gradle `createBundleReleaseJsAndAssets` fails with no error** → something rewrote app files (e.g. a content build)
  while Metro was bundling; just run it again with nothing else writing.
- Test agents report "BackHandler is not supported on web", "useNativeDriver is not supported" and `net::ERR_ABORTED`
  on `/`: harmless web noise, not bugs.

## 9. Owner decisions and open questions (keep up to date)
| Date | Decision / question | Status |
|---|---|---|
| 2026-10-16 | Leaderboard updates once a day at 23:55 SGT to save Firestore reads | done (§1 Leaderboard) |
| 2026-10-16 | Map: a way to jump to any topic (tester) → Topics side drawer | done |
| 2026-10-16 | APKs go to the owner directly; the Netlify download page stays archived | in force |
| 2026-10-17 | Update this skill with every change | in force (§0) |
| 2026-10-17 | Daily quests count questions only when a level is finished (answers in a quit level don't count). Keep or count every answer? | asked, awaiting owner |
| 2026-10-17 | Shop: no "you need N stars" message for unaffordable items; some hat names truncated | asked, awaiting owner |
| 2026-10-17 | Dev Tools button visible in the live web app / tester APK. Turn off before launch? | asked, awaiting owner |
| 2026-10-17 | Editor and student app in separate Firebase projects (own 50k reads/day each); same web address kept | **student project `catapult-math-students` (#310686010335) created by the owner and set up 17 Oct**: Firestore `(default)` asia-southeast1, email + Google sign-in, authorized domains incl. catapult-math-athletes.web.app, web app 1:310686010335:web:237d76dcb76e24c729d26a, Android app (SHA-256 added; SHA-1 refused because the Android OAuth client for package + release SHA-1 already lives in primary-math-sg → the app keeps primary-math-sg's Google web client id `762269301954-vt974…` for Google sign-in, which must be **safelisted** in the student project: Auth → Google → "Safelist client IDs from external projects"), runtime SA catapult-backend@catapult-math-students, rules + indexes deployed. App config ready in `apps/mobile/firebase.web.students.json` (swap in at the switch). Auth dry run: 9 students to move, 2 editor accounts stay. **SWITCHED 18 Oct 2026 07:30 UTC:** 9 students (5 password, 4 Google) + 327 docs migrated (`backend/reports/migrate-students-2026-10-18*`), backend deployed with STUDENT_PROJECT_ID (LEGACY_AUTH_PROJECT_ID=primary-math-sg kept for installed APKs), first daily board built there, web app config swapped (`apps/mobile/firebase.web.json` = student project; Google client stays primary-math-sg's, safelisted). Re-run `migrate-students.mjs --skip-firestore` later to pick up accounts made on old APKs. |
| 2026-10-17 | No new APKs until the owner asks; Google client 762269301954-vt974… safelisted in catapult-math-students by the owner | in force / done |
| 2026-10-17 | Leaving sign-up halfway restarts it at the name step | reported to owner |
| 2026-10-17 | Student data and Auth move to their own Firebase project (separate free quota; editor stays in primary-math-sg) | in progress; migration script written, not yet run |
| 2026-10-18 | MCQ retry until right in map levels and the key question: each wrong try −1 heart, "Skip"/"Not now"/"Try another question" any time, tried options stay red, right answer never revealed, a right pick on a retry still earns the star; typed questions and mini games unchanged | done (app only; no backend change) |
| 2026-10-16 | Enable Blaze billing on primary-math-sg so the read quota can't take the backend down | recommended, awaiting owner |
