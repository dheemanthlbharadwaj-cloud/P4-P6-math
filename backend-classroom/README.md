# Catapult Classroom backend

The API of Catapult Classroom (`apps/classroom`). Separate from the game on purpose (owner, 2 Nov 2026): its own Firebase
project `catapultclassroom` (Auth, Firestore, Hosting; its own free quota) and its own Netlify site in its own Netlify
account (its own 300 credits). Contract: `packages/shared/src/lessons.ts`. Guide: the skill, "Catapult Classroom launch".

```bash
npm install && npm test && npm run typecheck
npm run emulators                                   # terminal 1 (auth 9099, firestore 8080, project demo-classroom)
npm run build && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-classroom node scripts/dev-server.mjs
(same env) node scripts/e2e.mjs                     # 35 checks
node scripts/setup-project.mjs --dry                # project set-up (CLASSROOM_SETUP_SERVICE_ACCOUNT_B64)
node scripts/deploy.mjs --dry                       # deploy (CLASSROOM_NETLIFY_AUTH_TOKEN; refuses the game's account)
node scripts/add-admin.mjs --email … --name "…"     # the owner's admin login
```
