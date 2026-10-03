# Catapult Math Athletes

Cat-themed Singapore PSLE math game for iOS and Android. P6 ships first; P4 and P5 are added later as data.

- Spec: [docs/WORKFLOW.md](docs/WORKFLOW.md)
- Architecture & contract: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Decisions still needed: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)

| Path | What |
|---|---|
| `packages/shared` | Types, game rules, answer checking |
| `content` | Question bank pipeline (editor Firestore → offline bundle) |
| `backend` | Firebase backend for the student app |
| `apps/mobile` | Expo React Native app |

## Test web app

Live test build (with the 🛠 Dev Tools panel): https://catapult-math-athletes.web.app

To update it:

```
cd apps/mobile && python scripts/web-preview.py               # builds dist-preview/ (Dev Tools on)
cd ../../content && npx tsx ../apps/mobile/scripts/deploy-hosting.ts ../apps/mobile/dist-preview
```

The deploy uses the content-sync service account, which needs the "Firebase Hosting Admin" role on `primary-math-sg`.
The site is separate from the question editor (`primary-math-sg.web.app`).
