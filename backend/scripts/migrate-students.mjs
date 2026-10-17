#!/usr/bin/env node
// One-off migration of the STUDENT data out of the question editor's project (primary-math-sg) into the student's own
// Firebase project, so app traffic can never use up the editor's free Firestore quota again.
//
//   node backend/scripts/migrate-students.mjs [--dry] --to <studentProjectId> [--from primary-math-sg]
//        [--from-database default] [--to-database "(default)"] [--max-reads 20000] [--skip-auth] [--skip-firestore]
//
// 1. Auth: exports every user of the source project WITH password hashes (identitytoolkit accounts:batchGet) plus the
//    project's scrypt hash config (admin/v2 config → signIn.hashConfig) and imports them into the student project
//    (accounts:batchCreate), keeping uid, email, emailVerified, displayName, photo, created/last-login time and the
//    google.com / apple.com provider links. Editor accounts (synthetic emails *@users.primary-math-sg.web.app: the
//    master and the volunteers) are NOT copied: they stay only in primary-math-sg. Existing uids in the target are
//    left alone (allowOverwrite=false), so the script is safe to re-run.
// 2. Firestore: copies every student collection (recursively, all subcollections) from the source database to the
//    target database, same ids, same field types (Timestamps stay Timestamps: documents are copied in Firestore's own
//    REST value format). Editor collections (questions, meta, volunteers, question_reports, ...) are never touched.
//    Re-running overwrites the same documents (idempotent). The source is only READ.
// 3. Writes a record to backend/reports/migrate-students-<time>.json (counts per collection, uids, undo hint) and
//    prints a summary. --dry reads and counts only (it does read the source: ~1 Firestore read per document).
//
// Credentials (env only, never printed): the source needs read on Auth + Firestore of the source project
// (FIREBASE_SERVICE_ACCOUNT_B64 / SETUP_SERVICE_ACCOUNT_B64, Owner of primary-math-sg); the target needs Owner or
// Firebase Admin + Datastore User on the student project (STUDENT_SETUP_SERVICE_ACCOUNT_B64; falls back to the first
// key if that one is also a member of the student project). Outbound HTTPS honours HTTPS_PROXY.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { googleClient, loadServiceAccount } from "./gcp.mjs";

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) { try { http.setGlobalProxyFromEnv?.(); } catch { /* run with NODE_USE_ENV_PROXY=1 */ } }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = flag("--dry");
const FROM = opt("--from", process.env.FIREBASE_PROJECT_ID || "primary-math-sg");
const FROM_DB = opt("--from-database", process.env.FIRESTORE_DATABASE_ID || "default");
const TO = opt("--to");
const TO_DB = opt("--to-database", process.env.STUDENT_DATABASE_ID || "(default)");
const MAX_READS = Number(opt("--max-reads", "20000"));
if (!TO) { console.error("Usage: node backend/scripts/migrate-students.mjs [--dry] --to <studentProjectId>"); process.exit(2); }
if (TO === FROM && TO_DB === FROM_DB) throw new Error("Source and target are the same database.");

/** Student collections (everything else in the source, i.e. the editor's data, is never read or written). */
export const STUDENT_COLLECTIONS = [
  "users", "wallets", "publicProfiles", "friendCodes", "referrals", "friendships", "friendRequests", "leaderboards",
  "leaderboardSnapshots", "leaderboardMeta", "leaderboardDaily", "medals", "entitlements", "config",
];
export const EDITOR_EMAIL_SUFFIX = "@users.primary-math-sg.web.app";
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srcSa = loadServiceAccount();
const dstSa = process.env.STUDENT_SETUP_SERVICE_ACCOUNT_B64 ? loadServiceAccount(process.env.STUDENT_SETUP_SERVICE_ACCOUNT_B64) : srcSa;
const src = await googleClient(srcSa);
const dst = dstSa === srcSa ? src : await googleClient(dstSa);

/** api() with retries on 429/5xx (a daily-quota 429 is reported clearly instead of looping). */
async function call(client, method, url, body, what) {
  for (let i = 0; ; i++) {
    const r = await client.api(method, url, body);
    if (r.status < 300) return r.body;
    if ((r.status === 429 || r.status >= 500) && i < 4) { await sleep(1000 * 2 ** i); continue; }
    if (r.status === 429) throw new Error(`${what}: HTTP 429 (quota exhausted; wait for the reset and re-run)`);
    throw new Error(`${what}: HTTP ${r.status} ${r.error ?? ""}`);
  }
}

// ---------- 1) Auth ----------
export function isEditorAccount(u) { return (u.email ?? "").toLowerCase().endsWith(EDITOR_EMAIL_SUFFIX); }

/** Maps an exported account to a batchCreate user (password provider is implied by the hash; others are kept). */
export function toImportUser(u) {
  const providers = (u.providerUserInfo ?? []).filter((p) => p.providerId && p.providerId !== "password");
  const out = {
    localId: u.localId, email: u.email, emailVerified: !!u.emailVerified, displayName: u.displayName, photoUrl: u.photoUrl,
    passwordHash: u.passwordHash, salt: u.salt, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, disabled: u.disabled,
    phoneNumber: u.phoneNumber, customAttributes: u.customAttributes,
    providerUserInfo: providers.map((p) => ({ providerId: p.providerId, rawId: p.rawId, email: p.email, displayName: p.displayName, photoUrl: p.photoUrl, federatedId: p.federatedId })),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  return out;
}

async function migrateAuth(summary) {
  const a = (summary.auth = { exported: 0, editorAccountsSkipped: 0, toImport: 0, withPassword: 0, providerOnly: 0, imported: 0, alreadyThere: 0, failed: 0, uids: [] });
  const cfg = await call(src, "GET", `https://identitytoolkit.googleapis.com/admin/v2/projects/${FROM}/config`, undefined, "read auth config");
  const hc = cfg.signIn?.hashConfig;
  if (!hc?.signerKey) log("Auth: WARNING no scrypt hashConfig found; password users cannot be imported with their passwords");
  const users = [];
  let page = "";
  do {
    const r = await call(src, "GET", `https://identitytoolkit.googleapis.com/v1/projects/${FROM}/accounts:batchGet?maxResults=1000${page ? `&nextPageToken=${encodeURIComponent(page)}` : ""}`, undefined, "export users");
    for (const u of r.users ?? []) {
      a.exported++;
      if (isEditorAccount(u)) { a.editorAccountsSkipped++; continue; }
      users.push(toImportUser(u));
    }
    page = r.nextPageToken ?? "";
  } while (page);
  a.toImport = users.length;
  a.withPassword = users.filter((u) => u.passwordHash).length;
  a.providerOnly = a.toImport - a.withPassword;
  log(`Auth: ${a.exported} accounts in ${FROM}; ${a.editorAccountsSkipped} editor accounts stay there; ${a.toImport} student accounts (${a.withPassword} with password, ${a.providerOnly} Google/Apple only)`);
  if (DRY) return;
  for (let i = 0; i < users.length; i += 500) {
    const chunk = users.slice(i, i + 500);
    const hasPw = chunk.some((u) => u.passwordHash);
    const body = { users: chunk, allowOverwrite: false, sanitizeEmail: false, ...(hasPw && hc ? { hashAlgorithm: hc.algorithm ?? "SCRYPT", signerKey: hc.signerKey, saltSeparator: hc.saltSeparator, rounds: hc.rounds, memoryCost: hc.memoryCost } : {}) };
    const r = await call(dst, "POST", `https://identitytoolkit.googleapis.com/v1/projects/${TO}/accounts:batchCreate`, body, "import users");
    const errs = new Set((r.error ?? []).map((e) => Number(e.index ?? -1)));
    for (const e of r.error ?? []) {
      if (/exist|already|DUPLICATE/i.test(e.message ?? "")) a.alreadyThere++; else { a.failed++; log(`Auth: ${chunk[e.index]?.localId}: ${e.message}`); }
    }
    chunk.forEach((u, j) => { if (!errs.has(j)) { a.imported++; a.uids.push(u.localId); } });
  }
  log(`Auth: imported ${a.imported}, already in ${TO} ${a.alreadyThere}, failed ${a.failed}`);
}

// ---------- 2) Firestore ----------
const SRC_ROOT = `projects/${FROM}/databases/${FROM_DB}/documents`;
const DST_ROOT = `projects/${TO}/databases/${TO_DB}/documents`;
const FS = "https://firestore.googleapis.com/v1";

/** Rewrites document references that point into the source database (rare; the student data has none today). */
export function retarget(v) {
  if (Array.isArray(v)) return v.map(retarget);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = k === "referenceValue" && typeof x === "string" && x.startsWith(SRC_ROOT) ? DST_ROOT + x.slice(SRC_ROOT.length) : retarget(x);
    return o;
  }
  return v;
}

async function migrateFirestore(summary) {
  const f = (summary.firestore = { reads: 0, writes: 0, perCollection: {}, collectionIds: [] });
  let pending = [];
  const docPaths = [];
  const flush = async () => {
    if (!pending.length) return;
    if (!DRY) await call(dst, "POST", `${FS}/${DST_ROOT}:commit`, { writes: pending }, "write documents");
    f.writes += pending.length;
    pending = [];
  };
  const guard = () => { if (f.reads > MAX_READS) throw new Error(`Stopped: more than --max-reads ${MAX_READS} reads (raise it if this is expected)`); };

  async function walk(colPath, top) {
    let token = "";
    do {
      const r = await call(src, "GET", `${FS}/${SRC_ROOT}/${colPath}?pageSize=300&showMissing=true${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, undefined, `read ${colPath}`);
      const docs = r.documents ?? [];
      f.reads += Math.max(docs.length, 1);
      guard();
      for (const d of docs) {
        const rel = d.name.slice(SRC_ROOT.length + 1);
        if (d.createTime) { // missing docs (only subcollections below) have no createTime and no fields
          f.perCollection[top] = (f.perCollection[top] ?? 0) + 1;
          docPaths.push(rel);
          pending.push({ update: { name: `${DST_ROOT}/${rel}`, fields: retarget(d.fields ?? {}) } });
          if (pending.length >= 200) await flush();
        }
        const ids = await call(src, "POST", `${FS}/${SRC_ROOT}/${rel}:listCollectionIds`, { pageSize: 100 }, `list subcollections of ${rel}`);
        f.reads++;
        for (const sub of ids.collectionIds ?? []) await walk(`${rel}/${sub}`, top);
      }
      token = r.nextPageToken ?? "";
    } while (token);
  }
  for (const c of STUDENT_COLLECTIONS) {
    await walk(c, c);
    f.perCollection[c] ??= 0;
    log(`Firestore: ${c}: ${f.perCollection[c]} documents (incl. subcollections)`);
  }
  await flush();
  f.totalDocuments = Object.values(f.perCollection).reduce((s, n) => s + n, 0);
  log(`Firestore: ${f.totalDocuments} documents ${DRY ? "would be copied" : "copied"} to ${TO} (${TO_DB}); source reads used about ${f.reads}`);
  return docPaths;
}

// ---------- run ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = { when: new Date().toISOString(), dry: DRY, from: { project: FROM, database: FROM_DB }, to: { project: TO, database: TO_DB } };
  log(`${DRY ? "DRY RUN: " : ""}Migrating student data ${FROM} (${FROM_DB}) → ${TO} (${TO_DB})`);
  let docPaths = [];
  if (!flag("--skip-auth")) await migrateAuth(summary);
  if (!flag("--skip-firestore")) docPaths = await migrateFirestore(summary);
  summary.undo = DRY ? "nothing was written" : `Auth: delete the uids listed in auth.uids from ${TO} (accounts:batchDelete or console); Firestore: delete the documents listed in ${TO}'s ${TO_DB} database (paths in the .paths.txt next to this file). The source ${FROM} was only read.`;
  const dir = path.join(ROOT, "backend/reports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(dir, `migrate-students-${DRY ? "dry-" : ""}${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(summary, null, 2) + "\n");
  if (!DRY && docPaths.length) fs.writeFileSync(`${base}.paths.txt`, docPaths.join("\n") + "\n");
  log(`Record: ${path.relative(ROOT, base)}.json`);
  log(DRY ? "dry run: nothing written to the target" : "Done. Next: deploy student rules (deploy-rules.mjs --student-only), then set the Netlify env vars (deploy-netlify.mjs with STUDENT_PROJECT_ID).");
}
