# Backend (student app)

The student app shares the question bank editor's Firebase project, **`primary-math-sg`** (free Spark plan), and its
Firestore database **`"default"`** (a named database, not `"(default)"`): the student collections (`users`,
`wallets`, `publicProfiles`, leaderboards, …) sit next to the editor's (`questions`, `meta`, `volunteers`, …).
Firebase provides sign-in (email/password, Google, Apple; the editor's team logins use the same Auth) and Firestore.
The backend code in `functions/` runs on **Netlify** (free plan, no card) instead of Cloud Functions:
`netlify/handler.mjs` calls the same compiled handlers behind `POST https://<site>.netlify.app/api/<name>` (Firebase
ID token as bearer), a scheduled function runs the 00:00 Singapore-time jobs (daily snapshot, monthly close on the
1st), and `/revenuecat` takes the RevenueCat webhook. Profile edits go through `updateProfile`, which also refreshes the public copy (no Firestore trigger needed).

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
   (bundle id `sg.p6math.app`) and an **Android** one (package `sg.p6math.app` + the signing key's SHA-1 from EAS),
   then set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the "Web client (auto created by Google Service)" id),
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` as EAS environment variables.
6. **Apple sign-in** (needs the Apple Developer Program membership, which the App Store needs anyway):
   Firebase console → Authentication → Sign-in method → Apple → Enable.
   - iOS app: nothing else in Firebase; enable "Sign in with Apple" on the App ID `sg.p6math.app` (EAS does this).
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
