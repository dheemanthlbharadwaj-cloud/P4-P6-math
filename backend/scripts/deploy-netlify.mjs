#!/usr/bin/env node
// Deploys the backend API to Netlify (free plan, no card) and points the app at it. Idempotent: safe to re-run.
//
//   node backend/scripts/deploy-netlify.mjs [--dry] [--rotate-key]
//
// Two-project layout (student data in its own Firebase project): set STUDENT_PROJECT_ID (e.g. catapult-math-students; its
// setup service account is STUDENT_SETUP_SERVICE_ACCOUNT_B64 or the usual one if that is Owner there too). Then the site gets
//   STUDENT_SERVICE_ACCOUNT_B64 (key for catapult-backend@<student project>), STUDENT_DATABASE_ID ("(default)"),
//   EDITOR_SERVICE_ACCOUNT_B64 (a key for catapult-backend@primary-math-sg; it must have read on questions and write on
//   question_reports there, which setup-project.mjs grants), EDITOR_DATABASE_ID ("default"),
//   LEGACY_AUTH_PROJECT_ID (primary-math-sg, unless LEGACY_AUTH_PROJECT_ID=none), and keeps BACKEND_SERVICE_ACCOUNT_B64 until
//   you drop it. Without STUDENT_PROJECT_ID the single-project setup below is unchanged.
//
// Needs NETLIFY_AUTH_TOKEN or NETLIFY_SECRET (Netlify → User settings → Applications → Personal access tokens) and the setup service
// account (SETUP_SERVICE_ACCOUNT_B64 or FIREBASE_SERVICE_ACCOUNT_B64, Owner of the project). Project primary-math-sg
// (FIREBASE_PROJECT_ID overrides), Firestore database "default"; site name NETLIFY_SITE_NAME (default below).
// Never prints secret values.
//
// Steps: Netlify site (create if missing) → site env vars: BACKEND_SERVICE_ACCOUNT_B64 (a key for the
// catapult-backend service account made by setup-project.mjs; created once, new one with --rotate-key),
// FIRESTORE_DATABASE_ID and REVENUECAT_WEBHOOK_AUTH (random, if missing) → build ../functions + copy to netlify/lib → netlify deploy --prod
// → apps/mobile/backend.json {url} → smoke test.
// Each production deploy costs Netlify credits (15 of the free 300/month): deploy when the backend changed.
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { googleClient, loadServiceAccount } from "./gcp.mjs";
import { assertNetlifyBudget } from "./netlify-budget.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NETLIFY_DIR = path.join(ROOT, "backend/netlify");
const DRY = process.argv.includes("--dry");
const ROTATE = process.argv.includes("--rotate-key");
const NETLIFY_CLI = "netlify-cli@27";
const SITE_NAME = process.env.NETLIFY_SITE_NAME || "catapult-math-athletes-api";
const PROJECT = process.env.FIREBASE_PROJECT_ID || "primary-math-sg";
const DATABASE = process.env.FIRESTORE_DATABASE_ID || "default"; // the question bank's named database
const RUNTIME_SA = `catapult-backend@${PROJECT}.iam.gserviceaccount.com`; // created by setup-project.mjs
const STUDENT_PROJECT = process.env.STUDENT_PROJECT_ID || "";
const STUDENT_DATABASE = process.env.STUDENT_DATABASE_ID || "(default)";
const LEGACY_AUTH = (process.env.LEGACY_AUTH_PROJECT_ID || PROJECT) === "none" ? "" : process.env.LEGACY_AUTH_PROJECT_ID || PROJECT;
const NL_TOKEN = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SECRET;
if (!NL_TOKEN) throw new Error("Set NETLIFY_AUTH_TOKEN or NETLIFY_SECRET (Netlify → User settings → Applications → Personal access tokens).");
const log = (...a) => console.log(...a);

/** Netlify REST; returns { status, body } (error bodies reduced to their message). */
async function netlify(method, url, body) {
  const res = await fetch(`https://api.netlify.com/api/v1${url}`, {
    method, headers: { Authorization: `Bearer ${NL_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  return { status: res.status, body: json, error: json?.message ?? json?.errors };
}
const ok = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.error ?? "")}`); return r.body; };

// 1) Site
const found = ok(await netlify("GET", `/sites?name=${encodeURIComponent(SITE_NAME)}&filter=all`), "list sites");
let site = (Array.isArray(found) ? found : []).find((s) => s.name === SITE_NAME);
if (!site) {
  log(`Netlify: creating site ${SITE_NAME}`);
  if (DRY) { log("dry run: stopping before changes"); process.exit(0); }
  const r = await netlify("POST", "/sites", { name: SITE_NAME });
  if (r.status === 422) throw new Error(`Site name ${SITE_NAME} is taken on Netlify; set NETLIFY_SITE_NAME to another name.`);
  site = ok(r, "create site");
} else log(`Netlify: site ${SITE_NAME} exists`);
const url = site.ssl_url || `https://${SITE_NAME}.netlify.app`;
const account = site.account_slug ?? site.account_id;

// 2) Env vars
const env = ok(await netlify("GET", `/accounts/${account}/env?site_id=${site.id}`), "list env vars");
const have = new Set((Array.isArray(env) ? env : []).map((e) => e.key));
async function setEnv(key, value) {
  const values = [{ value, context: "all" }];
  const r = have.has(key)
    ? await netlify("PUT", `/accounts/${account}/env/${key}?site_id=${site.id}`, { key, values })
    : await netlify("POST", `/accounts/${account}/env?site_id=${site.id}`, [{ key, values }]);
  ok(r, `set ${key}`);
  have.add(key);
}

/** Creates a key for catapult-backend@<project> (deleting the old ones) and stores the compact JSON in env var `name`. */
async function ensureKey(name, project, saFile) {
  if (have.has(name) && !ROTATE) { log(`Env: ${name} set`); return; }
  const email = `catapult-backend@${project}.iam.gserviceaccount.com`;
  log(`Env: ${name} ← new key for ${email}`);
  if (DRY) return;
  const { api, must } = await googleClient(loadServiceAccount(saFile));
  const keysUrl = `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${email}/keys`;
  const old = must(await api("GET", `${keysUrl}?keyTypes=USER_MANAGED`), `list keys (run setup-project.mjs${project === STUDENT_PROJECT ? " --student" : ""} first)`).keys ?? [];
  const key = must(await api("POST", keysUrl, {}), "create key");
  const full = JSON.parse(Buffer.from(key.privateKeyData, "base64").toString("utf8"));
  // Only what firebase-admin needs: function env vars share a 4 KB limit.
  const compact = { type: full.type, project_id: full.project_id, client_email: full.client_email, private_key: full.private_key };
  await setEnv(name, Buffer.from(JSON.stringify(compact)).toString("base64"));
  // Two env vars may hold keys of the same service account (BACKEND_ and EDITOR_ for primary-math-sg): then old keys
  // are not deleted automatically, or one variable would lose its key.
  if (STUDENT_PROJECT && project === PROJECT) { if (old.length) log(`Env: ${old.length} older key(s) of ${email} kept (shared by two variables); prune them in IAM → Service accounts → Keys`); return; }
  for (const k of old) must(await api("DELETE", `https://iam.googleapis.com/v1/${k.name}`), "delete old key");
  if (old.length) log(`Env: deleted ${old.length} old key(s)`);
}
const envValue = (k) => (Array.isArray(env) ? env : []).find((e) => e.key === k)?.values?.[0]?.value;
async function ensureVar(key, value) {
  if (envValue(key) === value) { log(`Env: ${key} = ${value}`); return; }
  log(`Env: ${key} ← ${value}`);
  if (!DRY) await setEnv(key, value);
}
await ensureKey("BACKEND_SERVICE_ACCOUNT_B64", PROJECT); // the editor-side/legacy key (stays until the switch is proven)
if (STUDENT_PROJECT) {
  await ensureKey("STUDENT_SERVICE_ACCOUNT_B64", STUDENT_PROJECT, process.env.STUDENT_SETUP_SERVICE_ACCOUNT_B64);
  await ensureKey("EDITOR_SERVICE_ACCOUNT_B64", PROJECT);
  await ensureVar("STUDENT_DATABASE_ID", STUDENT_DATABASE);
  await ensureVar("EDITOR_DATABASE_ID", DATABASE);
  if (LEGACY_AUTH) await ensureVar("LEGACY_AUTH_PROJECT_ID", LEGACY_AUTH);
}
const dbVar = (Array.isArray(env) ? env : []).find((e) => e.key === "FIRESTORE_DATABASE_ID");
if (dbVar?.values?.[0]?.value !== DATABASE) {
  log(`Env: FIRESTORE_DATABASE_ID ← ${DATABASE}`);
  if (!DRY) await setEnv("FIRESTORE_DATABASE_ID", DATABASE);
} else log(`Env: FIRESTORE_DATABASE_ID = ${DATABASE}`);
if (!have.has("REVENUECAT_WEBHOOK_AUTH")) {
  log("Env: REVENUECAT_WEBHOOK_AUTH ← random value (copy it from the Netlify site's environment variables into RevenueCat)");
  if (!DRY) await setEnv("REVENUECAT_WEBHOOK_AUTH", `Bearer ${randomBytes(24).toString("hex")}`);
} else log("Env: REVENUECAT_WEBHOOK_AUTH set");
if (DRY) { log("dry run: nothing changed"); process.exit(0); }

// 3) Build + deploy (free plan: 15 of the 300 monthly credits per production deploy; refuses near the limit)
await assertNetlifyBudget("backend");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, NETLIFY_AUTH_TOKEN: NL_TOKEN } });
run("npm", ["--prefix", path.join(ROOT, "backend/functions"), "install", "--no-audit", "--no-fund"], ROOT);
run("npm", ["install", "--no-audit", "--no-fund"], NETLIFY_DIR);
run("npm", ["run", "build"], NETLIFY_DIR);
log("Deploy: netlify deploy --prod");
run("npx", ["-y", NETLIFY_CLI, "deploy", "--prod", "--no-build", "--dir", "public", "--functions", "functions", "--site", site.id, "--message", "backend"], NETLIFY_DIR);

// 4) Point the app at it
fs.writeFileSync(path.join(ROOT, "apps/mobile/backend.json"), JSON.stringify({ url }, null, 2) + "\n");
log(`App: wrote apps/mobile/backend.json → ${url}`);

// 5) Smoke test: no token → 401 unauthenticated from the handler
const res = await fetch(`${url}/api/getLeaderboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { scope: "global" } }) });
const body = await res.json().catch(() => null);
if (res.status !== 401 || body?.error?.status !== "unauthenticated") throw new Error(`Smoke test: expected 401 unauthenticated, got HTTP ${res.status}`);
log(`Smoke test OK: ${url}/api/* answers. Done.`);
