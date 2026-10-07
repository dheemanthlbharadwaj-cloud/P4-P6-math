#!/usr/bin/env node
// Merges the student-app rules into the question bank editor's live Firestore rules (primary-math-sg, database
// "default") and creates the indexes the backend needs there. The editor's own rules are kept as they are.
//
//   node backend/scripts/deploy-rules.mjs [--dry]            merge + deploy (dry: write the merged file only)
//   node backend/scripts/deploy-rules.mjs --restore <ruleset> put a previous ruleset back (undo)
//
// Every deploy saves the previous live rules and ruleset name to backend/reports/ (the undo manifest).
// Needs the setup service account (SETUP_SERVICE_ACCOUNT_B64 / FIREBASE_SERVICE_ACCOUNT_B64). Never prints secrets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { googleClient, loadServiceAccount } from "./gcp.mjs";
import { mergeRules } from "./rules-merge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = process.env.FIREBASE_PROJECT_ID || "primary-math-sg";
const DATABASE = process.env.FIRESTORE_DATABASE_ID || "default";
const DRY = process.argv.includes("--dry");
const restoreAt = process.argv.indexOf("--restore");
const RULES = "https://firebaserules.googleapis.com/v1";
const RELEASE = `projects/${PROJECT}/releases/cloud.firestore/${DATABASE}`;
const log = (...a) => console.log(...a);
const { api, must, wait } = await googleClient(loadServiceAccount());

const release = must(await api("GET", `${RULES}/${RELEASE}`), "live release");
const setRelease = async (rulesetName) => must(await api("PATCH", `${RULES}/${RELEASE}`, { release: { name: RELEASE, rulesetName } }), "update release");

if (restoreAt > 0) {
  const name = process.argv[restoreAt + 1];
  if (!name?.startsWith(`projects/${PROJECT}/rulesets/`)) throw new Error("--restore needs a ruleset name from backend/reports/");
  await setRelease(name);
  log(`restored ${RELEASE} → ${name}`);
  process.exit(0);
}

// 1) Rules
const liveSet = must(await api("GET", `${RULES}/${release.rulesetName}`), "live ruleset");
const live = liveSet.source.files[0].content;
const merged = mergeRules(
  live,
  fs.readFileSync(path.join(ROOT, "backend/firestore.rules"), "utf8"),
  fs.readFileSync(path.join(ROOT, "backend/firestore.editor-reports.rules"), "utf8"),
);
const reports = path.join(ROOT, "backend/reports");
fs.mkdirSync(reports, { recursive: true });
if (merged === live) log("rules: live rules already up to date");
else if (DRY) {
  const out = path.join(reports, "firestore.merged.preview.rules");
  fs.writeFileSync(out, merged);
  log(`rules (dry): merged rules written to ${path.relative(ROOT, out)} (${live.length} → ${merged.length} chars)`);
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(reports, `rules-${stamp}-previous.rules`), live);
  fs.writeFileSync(path.join(reports, `rules-${stamp}-previous.json`), JSON.stringify({ release: RELEASE, rulesetName: release.rulesetName, undo: `node backend/scripts/deploy-rules.mjs --restore ${release.rulesetName}` }, null, 2) + "\n");
  // Creating the ruleset compiles it: a syntax/type error stops here, before anything goes live.
  const created = must(await api("POST", `${RULES}/projects/${PROJECT}/rulesets`, { source: { files: [{ name: "firestore.rules", content: merged }] } }), "compile rules");
  await setRelease(created.name);
  log(`rules: deployed ${created.name} (previous ${release.rulesetName} saved in backend/reports/)`);
}

// 2) Indexes (from firestore.indexes.json) in the named database
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, "backend/firestore.indexes.json"), "utf8"));
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}`;
const existing = must(await api("GET", `${FS}/collectionGroups/-/indexes`), "list indexes").indexes ?? [];
const sig = (cg, scope, fields) => `${cg}|${scope}|${fields.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(",")}`;
const have = new Set(existing.map((i) => sig(i.name.split("/collectionGroups/")[1].split("/")[0], i.queryScope, i.fields.filter((f) => f.fieldPath !== "__name__"))));
for (const i of idx.indexes) {
  if (have.has(sig(i.collectionGroup, i.queryScope, i.fields))) { log(`index ${i.collectionGroup} (${i.fields.map((f) => f.fieldPath).join(", ")}): exists`); continue; }
  log(`index ${i.collectionGroup} (${i.fields.map((f) => f.fieldPath).join(", ")}): creating`);
  if (!DRY) must(await api("POST", `${FS}/collectionGroups/${i.collectionGroup}/indexes`, { queryScope: i.queryScope, fields: i.fields }), "create index");
}
for (const o of idx.fieldOverrides ?? []) {
  const url = `${FS}/collectionGroups/${o.collectionGroup}/fields/${o.fieldPath}`;
  const cur = must(await api("GET", url), "field config");
  const want = o.indexes.map((x) => ({ queryScope: x.queryScope, fields: [{ fieldPath: o.fieldPath, ...(x.order ? { order: x.order } : { arrayConfig: x.arrayConfig }) }] }));
  const curIdx = cur.indexConfig?.indexes ?? [];
  const missing = want.filter((w) => !curIdx.some((c) => c.queryScope === w.queryScope && (c.fields?.[0]?.order ?? c.fields?.[0]?.arrayConfig) === (w.fields[0].order ?? w.fields[0].arrayConfig)));
  if (!missing.length) { log(`field override ${o.collectionGroup}.${o.fieldPath}: in place`); continue; }
  log(`field override ${o.collectionGroup}.${o.fieldPath}: adding ${missing.map((m) => m.queryScope).join(", ")}`);
  if (!DRY) {
    // keep the automatic single-field indexes for normal queries, add the collection-group one
    const keep = [
      { queryScope: "COLLECTION", fields: [{ fieldPath: o.fieldPath, order: "ASCENDING" }] },
      { queryScope: "COLLECTION", fields: [{ fieldPath: o.fieldPath, order: "DESCENDING" }] },
      { queryScope: "COLLECTION", fields: [{ fieldPath: o.fieldPath, arrayConfig: "CONTAINS" }] },
    ];
    const op = must(await api("PATCH", `${url}?updateMask=indexConfig`, { indexConfig: { indexes: [...keep, ...want] } }), "field override");
    if (op.name && !op.done) await wait(op.name, "https://firestore.googleapis.com/v1");
  }
}
log(DRY ? "dry run: nothing deployed" : "done (new indexes take a few minutes to build)");
