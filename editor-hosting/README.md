# Question editor hosting files (primary-math-sg.web.app)

The editor is a separate static app (index.html + app.vN.js) deployed to Firebase Hosting in `primary-math-sg`; other
people change it too. This folder keeps what this repo prepared for it:

- `live-2026-10-17/`: the live files as downloaded on 17 Oct 2026 (before our change).
- `delta-v6/`: **read-saving change, not deployed yet**. The editor keeps a local copy of the question bank in the
  browser (Firestore persistent cache) and, after the first load on a device, only reads questions edited since the
  last sync (`last_edited_at`, both Timestamp and ISO-string values). Master reload: ~3,550 reads → ~2–20.
  "Full refresh" button (also automatic weekly). See `delta-v6/CHANGES.md` for the diff, read estimates, the needed
  composite index (`firestore.indexes.add.json`) and the deploy + test checklist.

Before deploying: download the live files again and diff them against `live-2026-10-17/` (merge anything others
changed), deploy the index first and wait until it's ready, then hosting.
