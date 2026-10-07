# Backend (student-app Firebase project)

Separate Firebase project from the editor (`primary-math-sg`), on the free **Spark** plan: Firebase provides sign-in
(email/password, Google, Apple) and Firestore (`asia-southeast1`). The backend code in `functions/` runs on **Netlify**
(free plan, no card) instead of Cloud Functions: `netlify/handler.mjs` calls the same compiled handlers behind
`POST https://<site>.netlify.app/api/<name>` (Firebase ID token as bearer), a scheduled function runs the 00:00
Singapore-time jobs (daily snapshot, monthly close on the 1st), and `/revenuecat` takes the RevenueCat webhook.
The Firestore trigger `syncPublicProfile` is replaced by the `refreshPublicProfile` call the app makes after writing its
profile. The Cloud Functions exports still work if the project ever moves to Blaze.

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

## Setting up the project (once) — no billing anywhere

1. **Create the project** at console.firebase.google.com (Google Analytics not needed). It stays on the free Spark plan.
2. **Turn on Authentication**: Build → Authentication → Get started.
3. **Give the setup service account access**: Google Cloud console → IAM & Admin → Grant access → the service account
   email (the script prints it; the one in `FIREBASE_SERVICE_ACCOUNT_B64` works) → role **Owner**. A different key can
   go in the environment as `SETUP_SERVICE_ACCOUNT_B64`.
4. **Run** `FIREBASE_PROJECT_ID=<id> node backend/scripts/setup-project.mjs` (idempotent; `--dry` shows the plan).
   It enables the APIs, creates Firestore `(default)` in asia-southeast1, turns on email/password sign-in, adds the
   authorized domains (incl. catapult-math-athletes.web.app), creates the web app and writes its public config to
   `apps/mobile/firebase.web.json` (commit it), points `.firebaserc` at the project, creates the `catapult-backend`
   service account the backend runs as (Firestore user + Auth admin) and deploys the Firestore rules and indexes.
5. **Netlify**: sign up at netlify.com (free plan, no card), then User settings → Applications → Personal access
   tokens → New token; put it in the environment settings as `NETLIFY_AUTH_TOKEN`. Run
   `node backend/scripts/deploy-netlify.mjs`: it creates the site (`NETLIFY_SITE_NAME`, default
   `catapult-math-athletes-api`), stores a key for `catapult-backend` and a random RevenueCat secret in the site's
   environment variables, deploys, and writes the site URL to `apps/mobile/backend.json` (commit it).
   `--rotate-key` replaces the service-account key.
6. **Google sign-in**: Firebase console → Authentication → Sign-in method → Add new provider → Google → Enable, pick
   a support email → Save. That creates the web OAuth client; web sign-in works from then on.
   For the native apps, in Google Cloud console → APIs & Services → Credentials create an **iOS** OAuth client
   (bundle id `sg.p6math.app`) and an **Android** one (package `sg.p6math.app` + the signing key's SHA-1 from EAS),
   then set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the "Web client (auto created by Google Service)" id),
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` as EAS environment variables.
7. **Apple sign-in** (needs the Apple Developer Program membership, which the App Store needs anyway):
   Firebase console → Authentication → Sign-in method → Apple → Enable.
   - iOS app: nothing else in Firebase; enable "Sign in with Apple" on the App ID `sg.p6math.app` (EAS does this).
   - Web: Apple Developer → Identifiers → **Services ID** (e.g. `sg.p6math.web`), enable Sign in with Apple, domain
     `<project id>.firebaseapp.com`, return URL `https://<project id>.firebaseapp.com/__/auth/handler`. Then Keys → a
     key with Sign in with Apple. Enter the Services ID, Team ID, Key ID and the private key in the Firebase Apple
     provider (OAuth code flow configuration).
8. **RevenueCat**: webhook URL `https://<site>.netlify.app/revenuecat`, Authorization header = the site's
   `REVENUECAT_WEBHOOK_AUTH` env var (Netlify → Site configuration → Environment variables).
9. Rebuild and redeploy the web app (`apps/mobile/scripts/web-preview.py`, then the hosting deploy).

Limits to keep in mind (free tiers): Firestore 50k reads / 20k writes a day; Netlify 300 credits a month (deploys 15
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
mini games, leaderboard, friends, referrals, quests and the store all run against the local backend.
