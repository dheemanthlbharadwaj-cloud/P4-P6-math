# AGENTS.md: Catapult Math Athletes

Instructions for any AI coding agent (Codex, Cursor, Copilot, Gemini CLI, Claude Code, …) and for humans.
The full guide is the skill **`skills/catapult-math-athletes/SKILL.md`**. Read it before changing anything.
The same file is linked from `.claude/skills/` and `.agents/skills/`.

## 1. Set up (automatic)

```bash
npm run setup               # = bash scripts/setup.sh : Node deps (+ figure packs), Python Pillow, then the doctor
npm run doctor              # what this environment can do + live status of every service (never prints secrets)
bash scripts/setup.sh --verify    # + all tests and typechecks
bash scripts/setup.sh --browser   # + Playwright Chromium (browser checks of the web build)
bash scripts/setup.sh --android   # + Android SDK and the release signing key (needs the service account)
bash scripts/setup.sh --quick     # fast, for session-start hooks
```

Requirements: Node 22+, Python 3, git. Android builds also need JDK 17+.

## 2. What this is

Cat-themed Singapore P6 (PSLE) math game. **One Expo React Native codebase** (`apps/mobile`) for the web app, Android
and iOS.
- **Questions:** an offline question bundle built from the question editor's Firestore by `content/`.
- **Live edits:** questions edited in the editor reach apps as patches via the backend's `getQuestionPatches`.
- **Backend:** in `backend/`, running on Netlify.
- **Shared code:** types and rules in `packages/shared`.

| Live | URL | Updated by |
|---|---|---|
| Web app | https://catapult-math-athletes.web.app | GitHub Actions on push (`.github/workflows/deploy-web.yml`, keyless) |
| Backend API | https://catapult-math-athletes-api.netlify.app | `node backend/scripts/deploy-netlify.mjs` |
| Phones (OTA) | Expo `dheems-team/catapult-math-athletes`, channel `preview` | EAS workflow on push (`apps/mobile/.eas/workflows/publish-update.yml`) |
| Android APK | https://catapult-math-athletes-download.netlify.app (team-only for now) | local build, then `node apps/mobile/scripts/deploy-apk.mjs` (`docs/ANDROID.md`) |
| Question editor | https://primary-math-sg.web.app (separate codebase) | — |

## 3. Rules (from the product owner)

**Product changes**
- **Do exactly what is asked.** No unrequested restyling or behaviour changes; ask first.
- **Don't regress agreed behaviour.** Keep everything in the skill's "Current agreed behaviour" table.

**Secrets**
- **Never print, paste or commit secrets.** Never ask the user to paste them into chat.
- Credentials come from environment variables only: `FIREBASE_SERVICE_ACCOUNT_B64`, `NETLIFY_AUTH_TOKEN` /
  `NETLIFY_SECRET`, `CLOUDINARY_SECRET`, optional `EXPO_TOKEN`.

**Editor writes**
- Writes to the editor bank (Firestore `questions`) need a `--dry` run first and an undo manifest in
  `content/reports/`.

**Free-plan budgets**
- **Netlify:** 300 credits a month, and each production deploy costs 15. Deploy the backend only when it changed,
  and batch changes. Check with `node backend/scripts/netlify-budget.mjs`. The deploy scripts refuse when credits
  run low.
- **Expo:** 60 CI minutes a month, and each phone update costs about 15. Put `[eas skip]` in commit messages that
  don't need to reach phones.
- **Firebase:** the Spark plan, no billing. Don't host big files (APKs) there.

**Android**
- **Signing:** every APK must be signed with the release key in Firestore `app_secrets/android-signing`. `setup.sh
  --android` fetches it.
- **Versions:** a native change means bumping `version` in `apps/mobile/app.config.ts` and shipping a new APK.

**Git and reporting**
- Work on the branch you were given. No PR unless asked. No AI model names in commits or code.
- Before saying "done", run the tests, check the web build in a browser, and report honestly what was and wasn't
  verified.
- Larger builds: if your agent supports sub-agents, act as the orchestrator. Define shared types and contracts
  first, delegate parallel pieces, then review and verify yourself.

## 4. Everyday commands

```bash
npm test                                              # all workspaces + backend
cd apps/mobile && npx tsc --noEmit && npx vitest run  # app
python3 apps/mobile/scripts/web-preview.py            # web build → apps/mobile/dist-preview (serve: python3 -m http.server)
cd content && npm run sync -- --grade P6 && npm run build -- --grade P6   # editor → app bundle (needs service account)
```

More: `docs/ANDROID.md` (APK, updates, signing), `backend/README.md` (backend, rules, editor reports),
`docs/WORKFLOW.md` (product spec), `docs/ARCHITECTURE.md` (contracts).
