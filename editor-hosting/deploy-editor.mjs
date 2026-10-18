#!/usr/bin/env node
// Deploys files to the QUESTION EDITOR's hosting site (primary-math-sg.web.app) without touching anything else:
// the new version keeps the live version's config (no-cache headers incl. "/") and every live file, and only adds or
// replaces the files you pass. Firebase's own /__/ files are left to Firebase.
//
//   node editor-hosting/deploy-editor.mjs [--dry] <localFile>=<sitePath> ...
//   e.g. node editor-hosting/deploy-editor.mjs editor-hosting/delta-v6/index.html=/index.html \
//          editor-hosting/delta-v6/app.v6.js=/app.v6.js editor-hosting/delta-v6/syncdelta.v1.js=/syncdelta.v1.js
//
// ALWAYS download the live files first and diff them against your base (other people change the editor).
// Needs FIREBASE_SERVICE_ACCOUNT_B64 (Hosting Admin on primary-math-sg). Never prints secrets.
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { googleClient, loadServiceAccount } from "../backend/scripts/gcp.mjs";

const SITE = "primary-math-sg";
const DRY = process.argv.includes("--dry");
const pairs = process.argv.slice(2).filter((a) => a.includes("=")).map((a) => { const [local, path] = a.split("="); return { local, path }; });
if (!pairs.length) throw new Error("usage: deploy-editor.mjs [--dry] <localFile>=<sitePath> ...");
const { api, token } = await googleClient(loadServiceAccount());
const H = "https://firebasehosting.googleapis.com/v1beta1";
const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`); return r.body; };

const live = must(await api("GET", `${H}/sites/${SITE}/releases?pageSize=1`), "releases").releases[0].version;
const liveFiles = must(await api("GET", `${H}/${live.name}/files?pageSize=1000`), "files").files ?? [];
const keep = Object.fromEntries(liveFiles.filter((f) => !f.path.startsWith("/__/")).map((f) => [f.path, f.hash]));
const upload = {};
for (const { local, path } of pairs) {
  const gz = zlib.gzipSync(fs.readFileSync(local), { level: 9 });
  const hash = crypto.createHash("sha256").update(gz).digest("hex");
  keep[path] = hash; upload[hash] = gz;
  console.log(`${path} ← ${local} (${gz.length} bytes gz)`);
}
console.log(`live ${live.name}: ${liveFiles.length} files; new version: ${Object.keys(keep).length} files: ${Object.keys(keep).sort().join(" ")}`);
console.log(`config kept: ${JSON.stringify(live.config)}`);
if (DRY) { console.log("dry run: nothing deployed"); process.exit(0); }

const ver = must(await api("POST", `${H}/sites/${SITE}/versions`, { config: live.config }), "create version");
const pop = must(await api("POST", `${H}/${ver.name}:populateFiles`, { files: keep }), "populate");
for (const h of pop.uploadRequiredHashes ?? []) {
  const r = await fetch(`${pop.uploadUrl}/${h}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: upload[h] });
  if (!r.ok) throw new Error(`upload ${h}: HTTP ${r.status}`);
}
must(await api("PATCH", `${H}/${ver.name}?update_mask=status`, { status: "FINALIZED" }), "finalize");
must(await api("POST", `${H}/sites/${SITE}/releases?versionName=${ver.name}`, { message: "editor: " + pairs.map((p) => p.path).join(", ") }), "release");
console.log(`released ${ver.name}`);
