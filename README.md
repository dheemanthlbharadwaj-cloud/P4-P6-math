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
