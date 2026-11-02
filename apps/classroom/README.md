# Catapult Mathletes Classroom (web)

Students, teachers and the owner (admin) in one web app: `/student`, `/teacher`, `/admin`. Same accounts (student
Firebase project) and the same Netlify backend as the game; questions from the game's content bundle, figures from
Cloudinary. The full guide is the skill (`skills/catapult-math-athletes/SKILL.md`, row "Classroom web app").

```bash
npm start            # dev server; open /?mock=1 for demo data without sign-in or backend
npm run build        # → dist/ (static single-page app for Firebase Hosting)
npm test && npm run typecheck
```
