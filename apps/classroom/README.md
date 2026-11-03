# Catapult Classroom (web)

For parents (one family code shows all their children's completed lessons and the teacher's messages) and teachers / the
owner (lessons, students, running a lesson with feedback for WhatsApp, admin). Its own Firebase project (catapultclassroom)
and its own backend (`../../backend-classroom`), separate from the game. The full guide is the skill (`skills/catapult-math-athletes/SKILL.md`, row
"Catapult Classroom (web)").

```bash
npm start            # dev server; /teacher?mock=1 (teacher demo) or /parent?mock=parent (parent demo), no sign-in or backend
npm run build        # → dist/ (static single-page app for Firebase Hosting)
npm test && npm run typecheck
```
