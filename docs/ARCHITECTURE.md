# Architecture & build contract

## Decisions (confirmed with product owner, 2026-10-01)
| Area | Decision |
|---|---|
| Mobile | **Expo React Native (TypeScript)**, expo-router, EAS Build → iOS App Store + Google Play. Dev builds (not Expo Go) because of ads/IAP native modules. |
| Questions | **Bundled in the app, fully offline.** Built from the editor's Firestore bank (`primary-math-sg`, database id `"default"`) by the content pipeline. |
| Map unit | **Subtopic = map node (P6 has 62 subtopics)**, each with 5/5/5. **Topic = swipeable map.** |
| Backend | **New Firebase project** for the student app (separate from the `primary-math-sg` editor project). Auth, Firestore, Cloud Functions (TypeScript). |
| Ads | Google AdMob via `react-native-google-mobile-ads`, rewarded ads for +hearts/+energy. Child-directed settings (see Compliance). |
| Subscription | In-app purchase via RevenueCat (`react-native-purchases`). Apple/Google require store billing for digital subscriptions. Entitlement `unlimited`. |
| Grades | P6 only now. **Every content path, type and screen is keyed by `grade` (`"P4" \| "P5" \| "P6"`)** so P4/P5 drop in as data. |

## Repository layout (npm workspaces)
```
packages/shared/      @p6/shared  : TS types + game rules + pure logic (answer checking, selection). FROZEN contract;
                                    changes go through the integrator.
content/              @p6/content : pipeline: Firestore → raw snapshot → validated bundle + figures   [backend agent]
backend/              Firebase project: firestore.rules, indexes, functions/ (TS), emulator tests  [backend agent]
apps/mobile/          Expo app                                                                     [frontend agent]
  assets/content/<grade>/   generated bundle (questions.json, curriculum.json, figures/)  ← written ONLY by content/
  assets/cats/              optimized cat poses + animations (from the artist's Drive folder)
  assets/ui/                map / toolbar / button art (placeholders until the product owner delivers)
design/source-assets/       originals that are not shipped (PSD, MP4)
docs/                       WORKFLOW.md (spec), ARCHITECTURE.md (this), OPEN_QUESTIONS.md
```

## Content pipeline (content/)
1. `sync` — reads `questions` from Firestore project `primary-math-sg`, **database id `"default"`** (not `(default)`),
   using `FIREBASE_SERVICE_ACCOUNT_JSON` (env var holding the JSON key; read-only role is enough). Writes
   `content/raw/<grade>/questions.snapshot.json`. Never writes to the editor project.
2. `audit` — reports distinct subtopic values and LV1/LV2/LV3 counts per subtopic, flags subtopics with < 5 at any
   level, questions with `has_error`, missing answers, missing figures, and non-canonical topics. Must confirm the
   **62 P6 subtopics**.
3. `build` — produces `apps/mobile/assets/content/<grade>/`:
   - `questions.json` → `QuestionBundle` (see `packages/shared/src/types.ts`)
   - `curriculum.json` → `Curriculum` (topics → subtopics → `main` {L1,L2,L3: 5 ids each} + `pool` ids)
   - `figures/<questionId>.webp` downsized (max 1000px wide); `figures/index.ts` static `require` map (Metro needs
     static requires).
   - Math text pre-tokenized into `RichText` (no KaTeX/WebView at runtime).
4. `mock` — generates a schema-identical fake bundle so the app runs before the real sync.

Selection is deterministic (stable sort by score then id) so rebuilds do not reshuffle a student's map.
Selection order for the main 5/5/5: exclude `has_error`; exclude questions that can't be auto-marked; prefer
`verified`; prefer no multi-part over multi-part for L1/L2; spread across years/schools. Everything else → `pool`.

### Source schema (editor bank, `questions/{year}_{source_id}`)
`id, year, topic_primary, topic_primaries[], topics[], difficulty (LV1|LV2|LV3), question_type (short|long|mcq),
paper, calculator_allowed, question, question_parts[{part,text}], answer, answer_symbol, answer_fraction, unit,
answer_parts[{part,value,symbol,fraction,unit}], options{"1".."4"}, answer_key, figure{required,filename},
figure_url (Cloudinary), verified, has_error, ...` plus the subtopic field (name to be confirmed by `audit`).
- LaTeX lives inside `$...$`. Currency uses fullwidth `＄` (never treat `＄` as math).
- LV1 = all MCQs (Paper 1 Booklet A).
- 13 canonical topics: Algebra, Angles in Geometric Figures, Area and Perimeter, Arithmetic, Circles, Data
  Representation, Drawing, Fractions, Percentage, Rate, Ratio, Solid Figures and Nets, Volume of Solids and Liquids.

## Backend (new Firebase project, placeholder id `p6-math-game`)
- **Auth:** Email/password, Google, Sign in with Apple (required by Apple if Google sign-in is offered).
- **Firestore** (`users/{uid}` owner-only except public profile fields):
  - `users/{uid}`: profile (fullName, school, grade, topicsLearnt[], psleDate, cat {name,colorId,hatId}), friendCode,
    createdAt.
  - `publicProfiles/{uid}`: displayName, cat look, school — readable by signed-in users (leaderboards, friends on map).
  - `users/{uid}/progress/{grade}`: node/level completion, unlocked topics (synced from the device, merged by max).
  - `users/{uid}/wrong/{questionId}`: wrong-question bookmarks.
  - `users/{uid}/ledger/{entryId}`: star ledger (server-written only).
  - `friendships/{pairId}`, `friendRequests/{id}`.
  - `leaderboards/daily/{yyyy-mm-dd}/entries/{uid}`, `leaderboards/monthly/{yyyy-mm}/entries/{uid}`, `medals/{uid}`.
  - `entitlements/{uid}`: server-written from the RevenueCat webhook.
- **Cloud Functions (TS, region asia-southeast1, timezone Asia/Singapore):**
  - `submitLevelResult` (callable): idempotent per (uid, grade, nodeId, level, attemptId); validates against the bundled
    curriculum manifest hash; awards stars into the ledger and monthly/daily totals.
  - `purchaseItem` (callable): atomic star deduction + inventory grant.
  - `redeemReferral` (callable): +5 stars to the referrer, once per referred account.
  - Friends: `sendFriendRequest`, `respondFriendRequest` (by friend code).
  - Scheduled: daily rank snapshot at 00:00 SGT (rank delta arrows); monthly close at 00:00 on the last day of the
    month (medals top 1–3, new month).
  - `revenuecatWebhook` (HTTPS) → `entitlements/{uid}`.
  - `deleteAccount` (callable): deletes Auth user + all user docs (store requirement).
- Hearts/energy live on the device (offline play); the server is the source of truth only for stars, purchases,
  entitlements and leaderboards. Offline level results are queued and replayed through `submitLevelResult`.

## Mobile app (apps/mobile)
- expo-router routes: `(onboarding)/*`, `(tabs)/map`, `(tabs)/classroom`, `(tabs)/store`, `(tabs)/leaderboard`,
  `(tabs)/profile`, `level/[grade]/[nodeId]/[level]`, `minigame/*`.
- State: zustand + persisted storage (MMKV) for hearts/energy/progress/wrong list/offline queue.
- Content access only through `src/content/` (loads `assets/content/<grade>/*`); screens never import JSON directly.
- Asset registry `src/theme/assets.ts`: every map/toolbar/button image the owner will supply is referenced only here.
- Companion cat (`CatCompanion`) uses `assets/cats/animations/*.webp`: idle = groom-idle, correct = cute-eyes pose,
  wrong = confused-wrong, thinking = laptop-thinking, out-of-hearts = lie-down-sad.
- Math rendering: `RichText` component renders the pre-tokenized tokens (inline stacked fractions, symbols).

## Compliance (P6 students are about 11–12, so this is a children's app)
- AdMob: `tagForChildDirectedTreatment: true`, `tagForUnderAgeOfConsent: true`, `maxAdContentRating: "G"`, no
  personalized ads. Google Play Families policy: only Families-certified ad SDKs. Apple: no ATT prompt (no tracking).
- Leaderboards show display names only. No free-text chat. Friends only by friend code / referral link.
- In-app account deletion (required by both stores).
- Parental gate before purchases/subscription and outbound links.
