# Editor delta loading (app.v5.js -> app.v6.js)

Files in new/: index.html (import ./app.v6.js + "Full refresh" button), app.v6.js, syncdelta.v1.js (pure logic, new),
syncdelta.test.mjs (node test, not deployed), firestore.indexes.add.json (merge into firestore.indexes.json), app.diff.
Deploy index.html, app.v6.js, syncdelta.v1.js to hosting (all under the existing no-cache `**/*.@(html|js)` + `/` rules).

## Diff summary
- Imports: `initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getDocsFromCache, Timestamp, terminate, clearIndexedDbPersistence` (same 10.14.1 URL) and `./syncdelta.v1.js` (static relative import inside the module; the single dynamic `import()` in index.html is still the entry).
- `db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})}, "default")`; on exception falls back to `getFirestore(app,"default")` and disables markers (always full load).
- `startListening()`: master's `onSnapshot(collection(db,"questions"))` and the volunteers' per-key onSnapshot replaced by `loadScope()` per scope ("all" for master, each access_key for volunteers):
  - marker `qsync:<uid>:<scope>` = `{ts, str, full}` in localStorage. `ts` = max Timestamp-typed last_edited_at (ms), `str` = max ISO-string last_edited_at, `full` = time of last full load.
  - marker present, < 7 days old, cache non-empty: `getDocsFromCache(scope query)` renders the list, then two delta listeners per scope: `last_edited_at > Timestamp(ts-60s)` and `last_edited_at > "<str-60s ISO>"`. Two are needed because Firestore range queries only match the same value type and the bank has both (editor saves use serverTimestamp(); content scripts write ISO strings).
  - otherwise full load: `onSnapshot(scope query, includeMetadataChanges)`, first server-confirmed snapshot replaces the scope's docs, marker is computed, listener is detached and the delta listeners attach.
  - delta listeners ignore "removed" (a doc leaving a delta query is a type/scope change, not a deletion). Marker only advances from docs without pending local writes; saved to localStorage when it moves. Own edits flow back through the delta listener as before (same applyChange/toast code).
- Full refresh button (before Sign out, same `btn` style): removes this user's `qsync:` markers, `terminate()` + `clearIndexedDbPersistence()` (ignored if another tab is open), reloads -> full load.
- Reports listeners, auth, meta reads, saving: unchanged.

## Read estimates (billed doc reads per page load; an empty query is billed 1)
| | before | after, first load on device | after, later loads |
|---|---|---|---|
| master | ~3,547 (+~4 meta/auth docs) + open reports | same (3,547) + 2 delta queries on top | 2 + edits since marker (+60s overlap) + ~4 meta/auth + open reports. Typically < 20 |
| volunteer, K keys, S docs in slice | S (+ ~4) + open reports | S + 2K | 2K + recent edits in slice + ~4 + open reports |
Budget: 50k/day = ~14 master loads before; after the first load, hundreds. Volunteers gain less in absolute terms (slices are small) but no longer re-read the slice each load. SDK resume tokens (within ~30 min) can reduce further. Real numbers need measuring (Firebase usage tab) after deploy.

## Index (needed for volunteers only)
firestore.indexes.add.json: `questions` (access_key ASC, last_edited_at ASC), COLLECTION scope, database `default`. Master's single-field range uses the automatic index. Until the index is READY, volunteer delta listeners error ("Sync error: ... requires an index") - deploy and wait for READY before hosting.
Deploy: merge into the project's firestore.indexes.json, then `firebase deploy --only firestore:indexes --project primary-math-sg` (check `firebase.json` has `"database": "default"` for firestore so it targets the named db).

## Deploy checklist
1. Create the index first; wait until it is Ready (console or `firebase firestore:indexes`).
2. Pull LIVE index.html and app.v5.js again; diff against live/ here. If anything changed (other people edit), re-apply our changes to the new live version before continuing.
3. Copy index.html, app.v6.js, syncdelta.v1.js into hosting; keep firebase.json no-cache headers incl. `/`. `firebase deploy --only hosting --project primary-math-sg`.
4. Test with the quota restored: (a) master login: full load, list complete (count vs 3,547); (b) reload: Usage tab / DevTools Network shows only a few reads; list identical; (c) volunteer login (first, then reload); (d) Full refresh: full load again; (e) edit a question in browser A, it shows in browser B within seconds and after B reload (Timestamp path); run a script edit with ISO last_edited_at, it shows after B reload (string path); (f) a script edit WITHOUT last_edited_at will not show until Full refresh.

## Verified / not verified
Verified: `node --check` on app.v6.js (ESM copy); `node syncdelta.test.mjs` (kinds, mixed-type markers, fallbacks, parse/stale, skew floors, removed handling); Chromium via Playwright with Firestore/Auth blocked: page serves from the real URL, SDK imports resolve, `initializeFirestore` runs, no JS errors, Full refresh button present, login screen shown.
Not verified (no live Firestore): actual query results, composite index, cache rendering, resume behaviour, Full refresh against a populated IndexedDB, multi-tab, read counts.

## Risks
- Docs without last_edited_at, or edited by scripts that don't stamp it (or stamp a type other than Timestamp/ISO string), are invisible to delta loads until Full refresh or the 7-day auto full reload. Scripts must set last_edited_at. Scripts using a non-ISO string (e.g. "2026-10-17 10:00") compare lexicographically and may be missed.
- Deletions and a volunteer's question moved out of scope by a script are only noticed by Full refresh / 7-day reload (editor itself never deletes questions).
- Persistent cache stays in the browser after Sign out (shared computers); Full refresh clears it. Sign out does not.
- If IndexedDB is blocked (private mode) the SDK may log errors; markers are then ignored only if init throws. Cache-empty with a marker falls back to full load.
- Stale-cache ghost docs (deleted server-side) could appear on fast loads until a full refresh.
- Related finding: the app repo's backend patches query (`last_edited_at > floor`, string compare) will not see editor saves stored as Timestamps; worth checking separately.
- First load per device is unchanged (full); the 7-day timer means ~1 full load/week/device.
