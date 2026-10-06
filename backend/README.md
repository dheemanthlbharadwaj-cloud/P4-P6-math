# Backend (student-app Firebase project)

Separate Firebase project from the editor (`primary-math-sg`). Firestore + Functions in `asia-southeast1`, schedules in `Asia/Singapore`.

- `functions/` is **not** an npm workspace member (Firebase deploys it standalone). Pure shared modules
  (`types.ts`, `gameRules.ts`, `api.ts` = the callable contract) are copied from `packages/shared/src` into `functions/src/shared` by
  `functions/scripts/copy-shared.mjs`, which runs automatically before `build`, `typecheck` and `test`
  (generated, git-ignored). Re-run after changing packages/shared.
- `cd functions && npm install && npm test` — unit tests for the pure logic (no emulator needed).
- `cd backend && npm install && npm run test:rules` — Firestore rules tests (needs Java; starts the emulator).
- Secret for the RevenueCat webhook: `firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH`
  (same value as the Authorization header configured in RevenueCat).
- Optional `config/content` doc `{ acceptedVersions: { P6: ["<bundle version>", ...] } }` makes
  `submitLevelResult` reject unknown content versions; when absent every version is accepted.
- Deploy: `firebase deploy --only firestore,functions` (or re-run the setup script below).

## Setting up the project (once)

1. **Create the project** at console.firebase.google.com (Google Analytics not needed). Note its project id.
2. **Blaze plan**: Upgrade (bottom left) → Blaze. Cloud Functions need it; a budget alert is a good idea.
3. **Give the setup service account access**: Google Cloud console → IAM & Admin → Grant access → the service account
   email (the script prints it; the one in `FIREBASE_SERVICE_ACCOUNT_B64` works) → role **Owner**. A different key can
   go in the environment as `SETUP_SERVICE_ACCOUNT_B64`.
4. **Run the script** (idempotent; `--dry` shows what it would do):
   `FIREBASE_PROJECT_ID=<id> node backend/scripts/setup-project.mjs`
   It enables the APIs, adds Firebase, creates Firestore `(default)` in asia-southeast1, turns on email/password
   sign-in, adds the authorized domains (incl. catapult-math-athletes.web.app), creates the web app and writes its
   public config to `apps/mobile/firebase.web.json` (commit it), points `.firebaserc` at the project, creates the
   `REVENUECAT_WEBHOOK_AUTH` secret with a random value and deploys rules, indexes and functions.
5. **Google sign-in**: Firebase console → Authentication → Sign-in method → Add new provider → Google → Enable, pick
   a support email → Save. That creates the web OAuth client; web sign-in works from then on.
   For the native apps, in Google Cloud console → APIs & Services → Credentials create an **iOS** OAuth client
   (bundle id `sg.p6math.app`) and an **Android** one (package `sg.p6math.app` + the signing key's SHA-1 from EAS),
   then set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the "Web client (auto created by Google Service)" id),
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` as EAS environment variables.
6. **Apple sign-in**: Firebase console → Authentication → Sign-in method → Apple → Enable.
   - iOS app: nothing else in Firebase; in the Apple Developer account enable "Sign in with Apple" on the App ID
     `sg.p6math.app` (EAS does this when building).
   - Web: Apple Developer → Identifiers → **Services ID** (e.g. `sg.p6math.web`), enable Sign in with Apple, domain
     `<project id>.firebaseapp.com`, return URL `https://<project id>.firebaseapp.com/__/auth/handler`. Then Keys → a
     key with Sign in with Apple. Enter the Services ID, Team ID, Key ID and the private key in the Firebase Apple
     provider (OAuth code flow configuration).
7. **RevenueCat**: copy the `REVENUECAT_WEBHOOK_AUTH` value from Google Cloud console → Security → Secret Manager into
   the RevenueCat webhook's Authorization header; the webhook URL is the `revenuecatWebhook` function URL.
8. Rebuild and redeploy the web app (`apps/mobile/scripts/web-preview.py`, then the hosting deploy).

## Local end-to-end (emulators)

`cd backend && npx firebase emulators:start --only auth,firestore,functions --project demo-p6-math`, then build the
app with `EXPO_PUBLIC_USE_EMULATORS=1 EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-p6-math EXPO_PUBLIC_FIREBASE_API_KEY=demo-api-key`
(`python3 apps/mobile/scripts/web-preview.py`): sign-up, levels, mini games, leaderboard, friends, quests and the
store all run against the local backend.
