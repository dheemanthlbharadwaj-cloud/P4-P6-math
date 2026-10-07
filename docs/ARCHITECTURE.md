# Architecture & build contract

## Decisions (confirmed with product owner, 2026-10-01)
| Area | Decision |
|---|---|
| Mobile | **Expo React Native (TypeScript)**, expo-router, EAS Build → iOS App Store + Google Play. Dev builds (not Expo Go) because of ads/IAP native modules. |
| Questions | **Bundled in the app, fully offline.** Built from the editor's Firestore bank (`primary-math-sg`, database id `"default"`) by the content pipeline. |
| Map unit | **Subtopic = map node (P6 has 62 subtopics)**, each with 5/5/5. **Editor chapter (`chapter`, `chapter_no`; 12 for P6) = swipeable map.** Chapter 99 "Removed" / `excluded` questions are dropped. |
| Backend | The editor's Firebase project `primary-math-sg` (free Spark plan): Auth + Firestore database `default`, shared with the question bank (rules merged by `backend/scripts/deploy-rules.mjs`). The backend handlers (TypeScript, `backend/functions`) run on Netlify's free plan (`backend/netlify`, `POST /api/<name>`); see backend/README.md. |
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

**The editor team's own pick wins:** questions with `selected: true` fill level N (LV N) of their subtopic in `selected_rank` order. A pick that has `has_error` or can't be auto-marked is replaced by the scorer below and listed in `content/reports/<grade>-audit.md`.
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
- **Callable contract:** `packages/shared/src/api.ts` is the single source of truth for every callable's request/response
  types, error codes and region (`FUNCTIONS_REGION = asia-southeast1`). The app imports it from `@p6/shared`; the functions
  get a copy through `backend/functions/scripts/copy-shared.mjs` (`types`, `gameRules`, `api` → `functions/src/shared`).
  Never hand-type a callable shape on either side.
- **Firestore data model** (rules: `backend/firestore.rules`; Admin SDK writes bypass them). "Owner" = the signed-in uid.
  | Path | Written by | Notes |
  |---|---|---|
  | `users/{uid}` | created by `bootstrapProfile`; owner may update `fullName, school, topicsLearnt, psleDate, cat` | `cat {name,colorId,hatId}`: rules reject an item that is not in `wallets/{uid}.inventory` (`color-black` always allowed, `hatId: null` allowed). This is how equipping works (no callable). |
  | `users/{uid}/progress/{grade}` | owner (shape pinned by rules) | `{grade, unlockedTopics[], levels{"<subtopicId>#<level>": {completed,bestCorrect,completedAt?}}, updatedAt}`, merged by max on the device (`mergeGradeProgress`) |
  | `users/{uid}/wrong/{questionId}` | owner (shape pinned) | `{grade, active, flaggedAt, updatedAt}`; `active=false` keeps the "all wrong ever" history |
  | `users/{uid}/ledger/{entryId}` | server only | star ledger (`level_<attemptId>`, `referral_<referredUid>`, purchases); owner may read |
  | `users/{uid}/attempts/{attemptId}` | server only | idempotency record + response of `submitLevelResult` |
  | `wallets/{uid}` | server only | `{starBalance, totalStars, inventory[]}`; owner may read |
  | `entitlements/{uid}` | RevenueCat webhook | `{unlimited, willRenew, expiresAt, ...}`; owner may read. `subscribed` = `unlimited` and not expired |
  | `publicProfiles/{uid}` | `bootstrapProfile` + `syncPublicProfile` trigger (mirrors `users/{uid}`) | `{uid, displayName, school, grade, cat}`; any signed-in user may read |
  | `friendCodes/{code}` | server only | `{uid}`, 8 chars, no 0/O/1/I; lookups only through callables |
  | `referrals/{referredUid}` | server only | `{referrerUid, referredUid, stars}`; one per referred account |
  | `friendships/{pairId}` | server only | `pairId = sorted(uidA_uidB)`, `{members[2]}`; members may read |
  | `friendRequests/{from_to}` | server only | `{from,to,status}`; from/to may read (the app lists `where to == me, status == pending`) |
  | `leaderboards/daily-{yyyy-mm-dd}/entries/{uid}` | server only | `{uid, stars, questionsDone}` for that SGT day (path is `leaderboards/{boardId}/entries/{uid}`) |
  | `leaderboards/monthly-{yyyy-mm}/entries/{uid}` | server only | monthly stars (the ranking key) and questions done; a new month starts empty |
  | `leaderboardSnapshots/{yyyy-mm-dd}/entries/{uid}` | `dailySnapshot` | `{uid, stars}` monthly stars at 00:00 SGT; last 3 days kept; source of the rank arrows |
  | `leaderboardMeta/monthly-{yyyy-mm}` | `monthlyClose` | marks a month as closed (idempotency) + winners |
  | `medals/{uid}` | `monthlyClose` | previous month's top 3: `{medal, month, stars}`; signed-in users may read |
  | `config/content` | operator | optional `{acceptedVersions: {P6: [...]}}`; absent = every content version accepted |
  No client can write stars, inventory, entitlements, leaderboards, medals, friendships or public profiles.
- **Backend handlers (TS, written as Cloud Functions, served from Netlify; timezone Asia/Singapore):**
  - `bootstrapProfile` (callable): creates `users`, `publicProfiles`, `wallets`, `friendCodes` once. Always returns
    `{profile, created} + AccountState` (stars, monthly stars, lifetime stars, claimed quests, owned items, equipped look,
    subscribed). `{restoreOnly: true}`
    returns `profile: null` instead of creating (used right after sign-in on a new device).
  - `submitLevelResult` (callable): idempotent per `attemptId`; checks `contentVersion` against `config/content` (when set);
    stars per `packages/shared/src/stars.ts`: a level that never gave a star → +1 per answer with `firstTryCorrect`
    (finished or not); a level already starred (`users/{uid}/starredLevels`) → +1 when completed. Into wallet
    (`starBalance`, `totalStars`), ledger and the daily + monthly entries; marks the questions in `users/{uid}/attempted`.
    A replay of an attempt returns the current balances with `duplicate: true`.
  - `submitMinigameResult` (callable): idempotent per round; +1 star per question answered right that was never
    attempted before (`users/{uid}/attempted`), so Unlimited Mistakes rounds earn none.
  - `claimQuest {questId}` (callable): wallet `totalStars` ≥ the quest's goal → reward into the inventory, once
    (`claimedQuests`).
  - `purchaseItem` (callable): atomic star deduction + inventory grant → `{starBalance, ownedItems}`.
  - `redeemReferral` (callable, `{friendCode}`): the caller is the referred user; the referrer gets +5 stars once per referred
    account and both become friends.
  - `sendFriendRequest {friendCode}` / `respondFriendRequest {requestId, accept}`.
  - `getLeaderboard {scope: "friends" | "school" | "global"}` → `{scope, periodKey, selfUid, friendUids, friends: PublicProfile[], entries}`;
    entries carry `rank, rankDelta, medal, school`. All ranked by this month's stars: friends = me + friends; school =
    everyone whose public profile has my school (up to 200); global = top 100 (+ me). The app's race track uses the
    friends board.
  - Scheduled: `dailySnapshot` 00:00 SGT (rank arrows); `monthlyClose` 00:00 SGT on the 1st (see OPEN_QUESTIONS #14).
  - `revenuecatWebhook` (HTTPS) → `entitlements/{uid}`.
  - `updateProfile`, `syncProgress`, `listFriendRequests` (callables): the app has no direct Firestore access; profile,
    map progress (merged by max), "previously wrong" bookmarks and incoming friend requests go through these.
  - `reportQuestion` (callable): a student reports a problem with a question → `question_reports/{questionId}__{uid}`
    (reason, note, answer given, the question's `access_key`); max 20 a day. The editor shows and resolves them.
  - `deleteAccount` (callable): deletes Auth user + every document that belongs to them (incl. leaderboard entries/snapshots,
    friendships, requests, referrals, wallet, medals, entitlement, friend code).
- **Restore on a new device / reinstall:** after sign-in the app calls `bootstrapProfile({restoreOnly: true})`. If a profile
  exists it rebuilds profile, look, stars, inventory and entitlement from the response, then reads
  `users/{uid}/progress/{grade}` + `users/{uid}/wrong/*` and merges them by max/union (`services/cloudSync.ts`); onboarding is
  skipped. While playing, progress and bookmarks are pushed (debounced) and re-pushed at every launch.
- Hearts/energy live on the device (offline play); the server is the source of truth only for stars, purchases,
  entitlements and leaderboards. Offline level results are queued (with a fixed `attemptId`) and replayed through
  `submitLevelResult`.

## Mobile app (apps/mobile)
- expo-router routes: `(onboarding)/*`, `(tabs)/map`, `(tabs)/classroom`, `(tabs)/store`, `(tabs)/leaderboard`,
  `(tabs)/profile`, `level/[grade]/[nodeId]/[level]`, `minigame/*`.
- State: zustand + persisted storage (MMKV) for hearts/energy/progress/wrong list/offline queue.
- Content access only through `src/content/` (loads `assets/content/<grade>/*` via the generated `assets/content/index.ts`
  `contentFor(grade)`); screens never import JSON directly. `LevelResult.contentVersion` = `QuestionBundle.version`.
- Classroom: 5-Minute Challenge, Unlimited Mistakes (previously-wrong questions), and "Practice (show answer)" (`app/practice/[topicId]`): browse a
  topic's pool (the not-auto-markable questions first), reveal the answer, self-mark; no hearts/stars/bookmarks.
- Asset registry `src/theme/assets.ts`: every map/toolbar/button image the owner will supply is referenced only here.
- Companion cat (`CatCompanion`) uses `assets/cats/animations/*.webp`: idle = groom-idle, correct = cute-eyes pose,
  wrong = confused-wrong, thinking = laptop-thinking, out-of-hearts = lie-down-sad.
- Math rendering: `RichText` component renders the pre-tokenized tokens (inline stacked fractions, symbols).

## Compliance (P6 students are about 11–12, so this is a children's app)
- AdMob: `tagForChildDirectedTreatment: true`, `tagForUnderAgeOfConsent: true`, `maxAdContentRating: "G"`, no
  personalized ads. Google Play Families policy: only Families-certified ad SDKs. Apple: no ATT prompt (no tracking).
- Leaderboards show display names only. No free-text chat. Friends only by friend code / referral link.
- In-app account deletion (required by both stores).
- Grown-ups check (parental gate) only before deleting the account; subscribing shows a "tell a grown-up" notice.
