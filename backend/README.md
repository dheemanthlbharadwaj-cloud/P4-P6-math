# Backend (student-app Firebase project)

Placeholder project id `p6-math-game` (`.firebaserc`), Firestore + Functions in `asia-southeast1`, schedules in `Asia/Singapore`.

- `functions/` is **not** an npm workspace member (Firebase deploys it standalone). Pure shared modules
  (`types.ts`, `gameRules.ts`) are copied from `packages/shared/src` into `functions/src/shared` by
  `functions/scripts/copy-shared.mjs`, which runs automatically before `build`, `typecheck` and `test`
  (generated, git-ignored). Re-run after changing packages/shared.
- `cd functions && npm install && npm test` — unit tests for the pure logic (no emulator needed).
- `cd backend && npm install && npm run test:rules` — Firestore rules tests (needs Java; starts the emulator).
- Secret for the RevenueCat webhook: `firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH`
  (same value as the Authorization header configured in RevenueCat).
- Optional `config/content` doc `{ acceptedVersions: { P6: ["<bundle version>", ...] } }` makes
  `submitLevelResult` reject unknown content versions; when absent every version is accepted.
- Deploy: `firebase deploy --only firestore,functions` (after creating the real project and updating `.firebaserc`).
