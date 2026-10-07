---
name: catapult-math-athletes
description: Everything needed to work on Catapult Math Athletes (cat-themed Singapore P6/PSLE math game, Expo React Native, offline question bundle from the primary-math-sg editor Firestore). Use for ANY task in this repo — app UI, map, cat, hearts/energy, content sync/build, question figures, editor (Firestore/Cloudinary) writes, web test build deploy, store builds — and to learn how to get credentials/access in each environment.
---

# Catapult Math Athletes — working guide

## 0. Ground rules from the product owner (read first)
- **Do exactly what is asked. Never add unrequested changes** (restyling, extra badges, removed behaviours). Past
  mistakes the owner called out: swapping the gold "completed" node for a star, adding lock badges next to levels,
  pinning the cat to the timer board and losing its mood reactions. If something seems worth changing, ask first.
- Never edit the owner's mindmap. `docs/WORKFLOW.md` is the spec derived from it.
- Never ask the user to paste tokens/keys/passwords into chat. Credentials go in environment settings (§3).
- Git: work on the branch you were given (historically `ccr-41770098-9l0q6b`); no PR unless asked. No model names in
  commits/PRs/code. Commit trailer used in this repo: `Co-Authored-By: Claude <noreply@anthropic.com>` style line.
- Any bulk write to the editor bank must have a `--dry` run first and an undo manifest in `content/reports/`.
- Before claiming done: run tests, look at the result in a browser (web build), and report honestly.

## 1. What the product is
- Name: **Catapult Math Athletes**. iOS + Android (Expo SDK 57, RN 0.86, expo-router, zustand persisted to
  AsyncStorage with key prefix `p6.`), fully offline question bank, AdMob rewarded ads, RevenueCat subscription.
- Grade P6 now (P4/P5 later as data; every path/type is keyed by `grade`).
- Map: each editor **chapter = one swipeable map page** (12 for P6); each **subtopic = a map node group** (62 for P6)
  with levels LV1/LV2/LV3 × 5 questions ("5-5-5").
- Live test web app (with 🛠 Dev Tools panel): **https://catapult-math-athletes.web.app**
  (separate from the question editor site `primary-math-sg.web.app`).

### Current agreed behaviour (do not regress)
| Area | Rule |
|---|---|
| Unlock | LV2 of any subtopic on a map unlocks only when **all LV1s on that map** are done; LV3 likewise needs all LV2s. `src/logic/unlock.ts` (`isLevelUnlocked`, `nextMapLevel`). |
| Level buttons | Colour by level: LV1 blue (`node.default`), LV2 green (`node.l2`), LV3 yellow (`node.l3`, not the star yellow). Completed = the original **gold** node (`uiAssets.node.gold`). Number text `{i+1}`. **No lock badge.** |
| Map theme | Map N shows only island N of the pack on the river (yacht marina, flooded city, suburbia, military base, ice, mountains, volcano, city at night, garbage dump, theme park, industrial platform, space base). |
| Map layout | Even spacing; gaps only between level groups; subtopic labels never overlap buttons/cat (`pickRect` in `TopicMapPage.tsx`). Spots come from `theme/mapPaths.ts` (`spots`): `map-scenes.py` cuts the maps, then `apps/mobile/scripts/map-spots.py` places buttons exactly evenly (level-group jump = 2 steps) in open water. |
| Cat on map | At the **furthest completed level** (`lastDone`), else first; stands **beside** that button and never covers any button (`placeCat` in `src/logic/mapLayout.ts`, tested). |
| Cat in questions | Mood images change for correct ("great job") / wrong; the 5-min board clock (`CatTimer`) shows only while mood is `thinking` (`CatCompanion.tsx`) and **restarts for every question** in a level (the 5-Minute Challenge mini-game keeps one clock for the whole challenge). |
| Hearts & energy | 10 each per day, refilled at local midnight (`src/logic/daily.ts`), +3 per rewarded ad, no recovery timer. Constants in `packages/shared/src/gameRules.ts`. |
| Stars | `packages/shared/src/stars.ts` (app + backend use the same rules). Map level never starred: +1 per question right on the FIRST try in that attempt (skips aren't tries; credited as answered, kept if the level isn't finished). Level already starred (re-attempt): +1 when completed. Mini games: +1 per question right that was never attempted before (levels or mini games), so Unlimited Mistakes gives none. Practice: none. App ledger `src/store/stars.ts` (balance, this month, lifetime); server: submitLevelResult (`firstTryCorrect` per answer), submitMinigameResult, users/{uid}/starredLevels + attempted. |
| Leaderboard | Title "Catapult Math Athletes"; race track (`RaceTrack.tsx`, `logic/raceTrack.ts`): only you + friends, x ∝ this month's stars, right = most, ~5 cats per screen, scrolls, ties in stacked lanes. Tabs Friends / School / Global (ranking = this month's stars). Below: Quests. |
| Quests | Lifetime stars 25/50/75/100/150/200 unlock quest-only looks (Rose, Golden Cap, Ocean, Royal Crown, Galaxy, Star Wizard; `QUESTS` in stars.ts). Claim → inventory (claimQuest callable); shown in the store as "Quest · N★", never sold. Skins: `scripts/cat-colors.py` (from the grey coat); hats: `scripts/quest-hats.py` (recolours). |
| Paywall | Heart + energy icons, title "Unlimited hearts and energy", no cat. |
| Buttons | Full black border all round (no coloured lip). |
| Question figures | Figure only; only text allowed is labels inside the figure. Parts separated by question text are cropped separately and stacked; text that can't be cropped out is whited out. Never under/over-crop. |

## 2. Repo map
```
packages/shared/   @p6/shared   types.ts, gameRules.ts, answer.ts (answer checking), api.ts (callable contract)
content/           @p6/content  editor Firestore → raw snapshot → app bundle
  src/sync.ts        sync + credentials (loadCredentials, accessToken, makeDispatcher for HTTPS_PROXY)
  src/build.ts       build bundle; figure lookup = raw/<grade>/figures/<sanitizedId>.{webp,png,jpg,jpeg,gif} (first hit wins)
  scripts/apply-recrops.ts   upload re-cropped figures to Cloudinary + PATCH figure_url (dry run + undo manifest)
  scripts/fix-options.ts     example of a targeted editor fix (π options)
  recrops/P6/        verified re-cropped figure PNGs named <questionId>.png (input for apply-recrops)
  reports/           audit + undo manifests for every editor write
  raw/               (git-ignored) snapshot + downloaded figures + figures/.sources.json URL manifest
backend/           student-app Firebase project (Spark: Auth + Firestore, asia-southeast1); functions/ = backend code, run on Netlify via netlify/ (see backend/README.md)
apps/mobile/       Expo app
  app/               routes: (onboarding)/, (tabs)/map|classroom|leaderboard|store|profile, level/[grade], practice/[topicId], minigame/[mode]
  src/components/    TopicMapPage, CatCompanion, CatTimer, CatAvatar, QuestionPanel, Paywall, Calculator, ui.tsx, FigureViewer, RichText…
  src/logic/         unlock, daily, timer, calculator, psle, strokes, levelSession (vitest tests alongside)
  src/store/         player (hearts/energy), progress, profile, cosmetics, friends, queue, wrong…
  src/dev/           DevToolsPanel (on in dev builds and when EXPO_PUBLIC_DEV_TOOLS=1): simulate midnight, set meters, unlock,
                     stars/quests (lifetime → 24/49/…, lock/unlock quests), star rules (forget starred levels / attempted
                     questions), leaderboard (0/2/8 friends, set/clear school)…; samples.ts = sample friends, school
                     mates and global players (shown while the backend isn't live; your own stars are real)
  src/theme/         assets.ts (uiAssets), cats.ts (catMoodImage), mapPaths.ts (generated), colors.ts
  assets/content/P6/ GENERATED bundle: questions.json, curriculum.json, figures/*.webp + index.ts (only content/ writes here)
  scripts/web-preview.py   build dist-preview/ (packed figures, Dev Tools on)
  scripts/deploy-hosting.ts  deploy a folder to Firebase Hosting site via REST
  scripts/map-layers.py    one-off: render river + 12 themed islands from the pack PSD into map-pack/layers/ (committed)
  scripts/map-scenes.py    map-bg-N.webp = river + ONLY chapter N's island (1 yacht marina … 12 space base), + route, aspects
  scripts/map-spots.py     even button spots per map from map-bg-N.webp (run after map-scenes.py)
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
| Cloudinary signed uploads | `CLOUDINARY_SECRET` (key defaults to `465242564664612`, override with `CLOUDINARY_KEY`) | uploading figures (`apply-recrops.ts`) | Cloud name `n9gn4u6k`. Edited figures live at `p6maths/figures_edited/<id>_recrop`; source PDFs at `p6maths/pdfs<year>/…` (raw resources, public URLs `https://res.cloudinary.com/n9gn4u6k/raw/upload/<public_id>`). |
| App runtime config | `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_REVENUECAT_*_KEY`, `EXPO_PUBLIC_ADMOB_*` (app ids + rewarded unit ids), `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`, `EXPO_PUBLIC_BUNDLE_ID` | real builds | Placeholders (Google test ad ids, `PLACEHOLDER`) keep builds working; see `app.config.ts`. |
| Dev tools in a build | `EXPO_PUBLIC_DEV_TOOLS=1` | test web build / internal APKs | `web-preview.py` sets it. |
| EAS / stores | `eas login` (Expo account), Apple/Google accounts | store builds | Profiles in `apps/mobile/eas.json` (development / preview / production). |
| Backend | `SETUP_SERVICE_ACCOUNT_B64`/`FIREBASE_SERVICE_ACCOUNT_B64` (Owner of the student project), `NETLIFY_AUTH_TOKEN` | `backend/scripts/setup-project.mjs`, `backend/scripts/deploy-netlify.mjs` | Firebase stays on Spark (no billing); the API runs on Netlify's free plan. Steps in backend/README.md. |

### Claude Code on the web (cloud container)
- Add secrets in the environment settings: session title bar → cloud environment menu → **Edit** → environment
  variables (`FIREBASE_SERVICE_ACCOUNT_B64`, `CLOUDINARY_SECRET`, …). **Only sessions started after the change see
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
- No `gh` CLI; use GitHub MCP tools. Push: `git push -u origin <branch>` with retries on network errors.
- Disk is a fixed allowance; delete `dist-web-raw/`, `dist-preview/`, caches if "no space left".

### Local machine (Mac/Linux)
- Node 22 (`.nvmrc`), Python 3 with `pillow numpy scipy` (+ `pymupdf opencv-python-headless pytesseract` for figure work, `tesseract` binary).
- Put the service-account key outside the repo and `export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json`
  (or `FIREBASE_SERVICE_ACCOUNT_B64=$(base64 -w0 key.json)`); `export CLOUDINARY_SECRET=…` in your shell profile or a
  git-ignored `.env` you `source`.
- No proxy needed (code only uses one when `HTTPS_PROXY` is set).
- Phone builds need a dev client (ads/IAP native modules): `cd apps/mobile && npx expo run:ios|run:android` or
  `eas build --profile development`.

### Claude desktop / Cowork / other agents
- Same env var names. If the agent can't hold env secrets, the user runs the one credentialed command locally
  (e.g. `CLOUDINARY_SECRET=… npx tsx scripts/apply-recrops.ts recrops/P6`) — prepare everything else and the exact
  command. The `anthropic-skills:p6-maths-editor` skill covers the editor web app (primary-math-sg) itself.

## 4. Everyday commands
```bash
npm install                                   # root (workspaces: packages/*, content, apps/*)
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

## 7. Testing the app in a browser
- `web-preview.py` → `dist-preview/`; serve with `python3 -m http.server PORT`; drive with Playwright
  (Chromium path above). Use the Dev Tools panel to unlock levels, set hearts/energy, simulate midnight.
- Check: map colours/gold nodes/no lock badges, cat position, label overlap, level flow, cat moods, paywall,
  question figures.

## 8. Troubleshooting
- `No Firebase credentials found` → set one of the §3 env vars (new session in cloud).
- Proxy 403 / ECONNRESET in cloud → host not in network allowlist; see `/root/.ccr/README.md`.
- `sharp` install issues → optionalDependencies pin linux/darwin binaries; reinstall in `content/`.
- Bundle contains stale figure → raw file still old; check `content/raw/P6/figures/.sources.json` and that the
  editor `figure_url` changed; delete the raw file and re-sync.
- Background shell commands time out at 30 min by default; long OCR/render jobs must save progress incrementally.
