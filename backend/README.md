# Backend (student app)

> **Two-project layout (in progress until `scripts/migrate-students.mjs` has run and the Netlify env vars are switched).**
> The student app gets its own Firebase project (working id `catapult-math-students`, Auth + Firestore `(default)` in
> asia-southeast1) holding ALL student data; `primary-math-sg` (db `default`) keeps only the question editor, and the
> backend only reads `questions` and writes `question_reports` there (`editorDb` in `functions/src/admin.ts`). Each
> project has its own 50k reads/day, so app traffic cannot take the editor down. The text below describes the current
> single-project setup, which is what runs until the switch.
>
> Netlify env vars (`functions/src/logic/projects.ts`): `STUDENT_SERVICE_ACCOUNT_B64`, `STUDENT_DATABASE_ID` (default
> `(default)`), `EDITOR_SERVICE_ACCOUNT_B64` (read `questions`, write `question_reports` in primary-math-sg),
> `EDITOR_DATABASE_ID` (default `default`), `LEGACY_AUTH_PROJECT_ID` (e.g. `primary-math-sg`: its ID tokens are also
> accepted while installed APKs still sign in there; same uids in both projects). Without `STUDENT_SERVICE_ACCOUNT_B64`
> the old `BACKEND_SERVICE_ACCOUNT_B64` + `FIRESTORE_DATABASE_ID` single project is used.
>
> Switch-over order: (1) owner creates the project, adds the service account as Owner; (2) `STUDENT_SETUP_SERVICE_ACCOUNT_B64=... node
> backend/scripts/setup-project.mjs --student --project <id>` (APIs, database, Auth, backend service account, student-only rules +
> indexes; web config goes to `backend/reports/firebase.web.student.json`); (3) `node backend/scripts/migrate-students.mjs --dry --to <id>`, then
> without `--dry` (copies Auth incl. password hashes, minus the editor's synthetic accounts, and all student Firestore
> collections; record in `backend/reports/`); (4) `STUDENT_PROJECT_ID=<id> node backend/scripts/deploy-netlify.mjs` (sets the env vars
> above, deploys); (5) point the app's `firebase.web.json` at the new project and ship an OTA/APK; later drop
> `LEGACY_AUTH_PROJECT_ID`. `deploy-rules.mjs --project <id> --student-only` deploys just the student rules/indexes.

The student app shares the question bank editor's Firebase project, **`primary-math-sg`** (free Spark plan), and its
Firestore database **`"default"`** (a named database, not `"(default)"`): the student collections (`users`,
`wallets`, `publicProfiles`, leaderboards, …) sit next to the editor's (`questions`, `meta`, `volunteers`, …).
Firebase provides sign-in (email/password, Google, Apple; the editor's team logins use the same Auth) and Firestore.
The backend code in `functions/` runs on **Netlify** (free plan, no card) instead of Cloud Functions:
`netlify/handler.mjs` calls the same compiled handlers behind `POST https://<site>.netlify.app/api/<name>` (Firebase
ID token as bearer), scheduled functions build the leaderboard once a day at 23:55 Singapore time (`functions/board.mjs`;
`getLeaderboard` serves that board from memory, so a view costs no reads for other players) and close the month at
00:00 on the 1st (`functions/nightly.mjs`), and `/revenuecat` takes the RevenueCat webhook. Profile edits go through `updateProfile`, which also refreshes the public copy (no Firestore trigger needed).

**The app never talks to Firestore directly.** Every read and write (profile, progress, bookmarks, friend requests,
stars, reports, …) goes through the backend, which uses the Admin SDK and is not subject to security rules. So the
student app does not depend on the editor's rules: if the editor's rules are rewritten or redeployed, students are not
affected. `firestore.rules` (student data) is simply "server only". The one thing merged into the editor's live
rules (by `scripts/deploy-rules.mjs`, between BEGIN/END markers, editor rules kept byte-for-byte) is
`firestore.editor-reports.rules`, which lets editors read and resolve student reports; if the editor's rules are
ever deployed without it, only volunteers lose the reports view (the master keeps it through the editor's own
catch-all rule) until `deploy-rules.mjs` is re-run. Reports are kept even if the editor renames or removes a
question (`question_found: false`, visible to the master).

**Question reports**: students tap "⚑ Report" on any question (level, mini game, practice) → `reportQuestion` →
`question_reports/{questionId}__{uid}` (reason, note, their answer, the question's `access_key`). The editor shows
them: a ⚑ badge in the list, a "Student reports (open)" filter, and a box on the question with Resolve / Dismiss
(master sees all, volunteers their scope). The editor part is added by `scripts/editor-reports.mjs`, which patches
the live editor files and publishes them (re-run it if the editor is redeployed from a copy without it).

**Editor edits reach the apps** (apps stay offline-capable on their bundle): `getQuestionPatches {grade, bundleVersion, since}`
(auth, 20/min) is served from the per-instance patch cache (`logic/patchCache.ts`), not a query per call: **0 Firestore reads
while the cache is warm**, and at most one incremental refresh per instance every 10 minutes (it reads `questions` where
`last_edited_at > the last edit already cached`, starting at the bundle's editor snapshot time; one read per edited doc, minimum 1;
the stale list is served while it refreshes; until the first load succeeds the call answers `unavailable` and the app retries).
**An editor edit therefore reaches apps within about 10 minutes.** The list is filtered by `editedAt > max(since, snapshot time)`,
ordered by it, cut at 300 per page and returns, for ids in the server's
bundle only, the question rebuilt by the same transform as the content build (`content/src/question.ts`, copied to
`functions/src/question`), `question: null` when retired (excluded, or un-picked after the build), and `figureUrl` only when
the editor's `figure_url` differs from the one the bundled image came from. `until` = the last patch of a full page, else the last edit the cache has read, `more` =
there are more than 300 matching patches. Served from the server's bundle even when the app's `bundleVersion` differs (one OTA behind). Marking
(`submitLevelResult`, `submitMinigameResult`) uses the edited answers and `activeLevelIds` (retired questions are not part
of a level) from a per-instance cache, refreshed incrementally at most every 10 min; if that fails the bundle's answers are
used. `copy-shared.mjs` takes the bundle's `builtAt` and `source-info.json` (written by `npm run build`/`source-info` in
content/: snapshot time, figure sources, picks) into `src/content`.

- `functions/` is **not** an npm workspace member (Firebase deploys it standalone). Pure shared modules
  (`types.ts`, `gameRules.ts`, `api.ts` = the callable contract) are copied from `packages/shared/src` into `functions/src/shared` by
  `functions/scripts/copy-shared.mjs`, which runs automatically before `build`, `typecheck` and `test`
  (generated, git-ignored). Re-run after changing packages/shared.
- `cd functions && npm install && npm test` — unit tests for the pure logic (no emulator needed).
- `cd backend && npm install && npm run test:rules` — Firestore rules tests (needs Java; starts the emulator).
- RevenueCat webhook secret: the Netlify site's env var `REVENUECAT_WEBHOOK_AUTH` (same value as the Authorization
  header configured in RevenueCat); `deploy-netlify.mjs` creates a random one.
- Optional `config/content` doc `{ acceptedVersions: { P6: ["<bundle version>", ...] } }` makes
  `submitLevelResult` reject unknown content versions; when absent every version is accepted.
- Deploy: rules/indexes `firebase deploy --only firestore`; backend `node backend/scripts/deploy-netlify.mjs`
  (each production deploy costs 15 of Netlify's 300 free credits a month, so deploy when the backend changed).

## Setting up (once) — no billing anywhere

Scripts use the service account in `FIREBASE_SERVICE_ACCOUNT_B64` (Owner on primary-math-sg; `SETUP_SERVICE_ACCOUNT_B64`
overrides). Each takes `--dry` to show what it would do; all are idempotent.

1. `node backend/scripts/setup-project.mjs` — enables the APIs, checks the `default` database, turns on email/password
   sign-in (already on for the editor), adds the authorized domains (incl. catapult-math-athletes.web.app), writes the
   project's public web config to `apps/mobile/firebase.web.json` (with `databaseId: "default"`), creates the
   `catapult-backend` service account the backend runs as (Firestore user + Auth admin), then runs step 2.
2. `node backend/scripts/deploy-rules.mjs` — merges the student rules into the editor's live rules and creates the
   leaderboard indexes in `default`. The previous rules are saved in `backend/reports/` with the undo command
   (`--restore <ruleset>`). It only adds the editor's report access (see above).
3. `node backend/scripts/editor-reports.mjs` — adds student reports to the editor (publishes a clone of the live
   editor with `index.html` and a bumped `app.vN.js`; the previous Hosting version is recorded in `backend/reports/`,
   undo with `--restore <version>`).
4. **Netlify**: sign up at netlify.com (free plan, no card), then User settings → Applications → Personal access
   tokens → New token; put it in the environment settings as `NETLIFY_AUTH_TOKEN`. Run
   `node backend/scripts/deploy-netlify.mjs`: it creates the site (`NETLIFY_SITE_NAME`, default
   `catapult-math-athletes-api`), stores a key for `catapult-backend`, `FIRESTORE_DATABASE_ID=default` and a random
   RevenueCat secret in the site's environment variables, deploys, and writes the site URL to
   `apps/mobile/backend.json` (commit it). `--rotate-key` replaces the service-account key.
5. **Google sign-in**: Firebase console (primary-math-sg) → Authentication → Sign-in method → Add new provider →
   Google → Enable, pick a support email → Save. That creates the web OAuth client; web sign-in works from then on.
   For the native apps, in Google Cloud console → APIs & Services → Credentials create an **iOS** OAuth client
   (bundle id `sg.catapultmathathletes.app`) and an **Android** one (package `sg.catapultmathathletes.app` + the signing key's SHA-1 from EAS),
   then set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the "Web client (auto created by Google Service)" id),
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` as EAS environment variables.
6. **Apple sign-in** (needs the Apple Developer Program membership, which the App Store needs anyway):
   Firebase console → Authentication → Sign-in method → Apple → Enable.
   - iOS app: nothing else in Firebase; enable "Sign in with Apple" on the App ID `sg.catapultmathathletes.app` (EAS does this).
   - Web: Apple Developer → Identifiers → **Services ID** (e.g. `sg.p6math.web`), enable Sign in with Apple, domain
     `primary-math-sg.firebaseapp.com`, return URL `https://primary-math-sg.firebaseapp.com/__/auth/handler`. Then
     Keys → a key with Sign in with Apple. Enter the Services ID, Team ID, Key ID and the private key in the
     Firebase Apple provider (OAuth code flow configuration).
7. **RevenueCat**: webhook URL `https://<site>.netlify.app/revenuecat`, Authorization header = the site's
   `REVENUECAT_WEBHOOK_AUTH` env var (Netlify → Site configuration → Environment variables).
8. Rebuild and redeploy the web app (`apps/mobile/scripts/web-preview.py`, then the hosting deploy).

Student sign-up refuses the editor's login domain (`@users.primary-math-sg.web.app`). Student accounts have no
access to editor data (the editor's rules require `admins/` or an active `volunteers/` doc).

Limits to keep in mind (free tiers): Firestore 50k reads / 20k writes a day, shared with the editor; Netlify 300 credits a month (deploys 15
each, requests and compute cost credits; when they run out the site pauses until next month, nothing is billed);
Netlify scheduled functions stop after 30 seconds, plenty for the nightly jobs at school scale.

## Classroom (teachers, classes, worksheets, marks, analytics)

Contract: `packages/shared/src/classroom.ts` (callable names in `api.ts` `CallableName`, all listed in `netlify/handler.mjs`).
Code: `functions/src/classroom.ts` (callables, Firestore), pure rules in `functions/src/logic/` (`classroom.ts` validation, access,
diagnostic picking, mark planning, Cloudinary signature; `levelStars.ts` the star bookkeeping shared with `submitLevelResult`;
`qstats.ts`; `milestones.ts`; `classAnalytics.ts`; `feedCache.ts`). Tests: `functions/test/classroom.test.ts`.

- **Data** (student project, server only; `firestore.rules` already denies every client): `teachers/{uid}`, `classes/{id}`
  (+ `posts/{id}`, `tasks/{id}`, `tasks/{id}/marks/{studentUid}`), `users/{uid}/qstats/{grade}`, `users/{uid}.classIds|birthday`.
  No new indexes (single-field filters only). Extra server-only fields beyond the contract: `qstats.homework` ({questionId: true},
  teacher-marked wrong and not yet right), `qstats.tasksDone` (in-app task ids submitted).
- **Teachers**: `node backend/scripts/add-teacher.mjs --project catapult-math-students --email … --name "…" [--dry]` creates the
  Auth user (generated password written once to a 0600 file in `--out-dir`, never printed) and `teachers/{uid}`; `--disable` turns a
  teacher off; `--reset-password` re-issues a password. Disabled teachers are refused within 60 s (cached teacher doc).
- **Marking** (`applyTaskMarks`, used by `teacherMarkTask` and by `submitTaskAnswers` for in-app diagnostics): stars exactly as in the app
  (`stars.ts` through the shared `resolveLevelStars`: one star per question ever; the replay bonus once per level, never for a correction),
  wrong marks become `users/{uid}/wrong/{id}` bookmarks (`{grade, active, flaggedAt, updatedAt}`, what `syncProgress` pull returns) and
  go on the student's homework list; idempotent per (task, student, question).
- **qstats**: `submitLevelResult`, `submitMinigameResult` and marks add ONE merge write each (blind: `increment`, no read). Map questions only.
  Attempts of an MCQ retried until right are one answer (the app sends only the final pick), so `a`/`w` undercount retries.
  Levels completed before this feature have no qstats (analytics start from the first answer after the deploy).
- **Automatic posts**: first completion of a level (and the level-up of a map group) in `submitLevelResult` / marks → `levelCompleted`;
  birthdays in `nightly()` (`netlify/handler.mjs`, 00:00 SGT) via `postBirthdays` which reads every class once. Fixed post ids make
  retries safe.
- **Cloudinary**: `teacherUploadSignature` needs `CLOUDINARY_SECRET` on the Netlify site; `deploy-netlify.mjs` sets it from the local env
  (not printed). Cloud `n9gn4u6k`, key `465242564664612` (override `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_KEY`), folder `p6maths/classroom/<classId>`.
- **Reads** (per-instance caches: class docs 60 s, class feed 60 s with incremental refresh, analytics 5 min, teacher doc 60 s, user info
  60 s): table at the top of `functions/src/classroom.ts`. Rule of thumb: a warm `getMyClassroom` = 1 read (the student's qstats);
  `teacherMarkTask` = about 4 reads; analytics = one read per student per 5 minutes.
- **Deploy**: only with the other backend changes (15 Netlify credits per deploy); nothing here needs `deploy-rules.mjs` (rules unchanged
  in behaviour for both projects).

## Security (shared test link)

Anyone with the link can sign up; nothing a student does on their own device can change stars, the leaderboard or
another account:
- **The server marks every answer.** Level and mini-game results carry what the student entered; the backend checks it
  against its own answer key (generated from the app's question bundle at build time, `functions/scripts/copy-shared.mjs`
  → `functions/src/content`, `logic/marking.ts`). Only a level's own questions count, each star is paid once
  (`users/{uid}/levelStars`), the replay bonus once per level. Dev Tools and a modified app only change their own device.
- **No direct database access.** The security rules deny students everything; all data goes through the backend.
- **Limits.** Netlify's edge allows 300 API calls a minute per IP (`netlify/functions/api.mjs`); per account each
  function has its own per-minute limit (`functions/src/logic/rateLimit.ts`); requests over 64 KB are refused; answers
  are bounded in count and length. This protects the free Firestore quota shared with the editor.
- **Only the app's websites** may call the API from a browser (`ALLOWED_ORIGINS` adds more); native apps send no origin.
- **Public names** (full name on leaderboards, cat name for friends) refuse links, phone numbers and rude words
  (`packages/shared/src/names.ts`, checked in the app and on the server). Question reports: 20 per student per day.
- **Website headers**: no framing, no MIME sniffing, strict referrer, no camera/mic/location, HTTPS only
  (`apps/mobile/scripts/deploy-hosting.ts`).

## Local end-to-end (emulators)

```
cd backend && npx firebase emulators:start --only auth,firestore --project demo-p6-math
cd backend/netlify && npm install && npm run build && \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-p6-math node dev-server.mjs
cd apps/mobile && EXPO_PUBLIC_USE_EMULATORS=1 EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-p6-math \
  EXPO_PUBLIC_FIREBASE_API_KEY=demo-api-key python3 scripts/web-preview.py
```
The dev server (port 8888) runs the same handler as Netlify; `POST /nightly` runs the nightly jobs. Sign-up, levels,
mini games, leaderboard, friends, referrals, quests, the store and question reports all run against the local
backend. `npm run test:rules` also checks the merged editor + student rules (`test-rules/merged.rules.test.ts`,
editor rules snapshot in `test-rules/editor.fixture.rules`).
