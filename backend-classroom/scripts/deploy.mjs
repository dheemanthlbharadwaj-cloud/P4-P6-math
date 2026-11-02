#!/usr/bin/env node
// Deploys the Catapult Classroom backend to its OWN Netlify site, in the classroom's OWN Netlify account (separate credits
// from the game). Idempotent.   node backend-classroom/scripts/deploy.mjs [--dry] [--rotate-key] [--force]
// Needs CLASSROOM_NETLIFY_AUTH_TOKEN and CLASSROOM_SETUP_SERVICE_ACCOUNT_B64 (scripts/env.mjs); never the game's tokens.
// Steps: site (create if missing) → env var CLASSROOM_SERVICE_ACCOUNT_B64 (a key of classroom-backend@<project>, made once;
// --rotate-key makes a new one and deletes the old) → credit check (15 credits per production deploy) → build → netlify
// deploy --prod → apps/classroom/backend.json {url} → smoke test. Never prints secrets.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { googleClient, loadServiceAccount } from "../../backend/scripts/gcp.mjs";
import { PROJECT, SITE_NAME, netlifyToken, runtimeEmail, setupKeyB64 } from "./env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "backend-classroom");
const DRY = process.argv.includes("--dry");
const ROTATE = process.argv.includes("--rotate-key");
const TOKEN = netlifyToken();
const log = (...a) => console.log(...a);
async function netlify(method, url, body) {
  const res = await fetch(`https://api.netlify.com/api/v1${url}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  return { status: res.status, body: json, error: json?.message ?? json?.errors };
}
const ok = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.error ?? "")}`); return r.body; };

// 0) Guard: this token must NOT be the game's Netlify account
const [acct] = ok(await netlify("GET", "/accounts"), "accounts");
const sites = ok(await netlify("GET", "/sites?filter=all&per_page=100"), "sites");
if (sites.some((s) => s.name === "catapult-math-athletes-api")) throw new Error("This Netlify token can see the GAME's backend site: use the classroom's own Netlify account (separate credits).");
log(`Netlify account: ${acct?.name ?? acct?.slug} (classroom)`);

// 1) Site
let site = sites.find((s) => s.name === SITE_NAME);
if (!site) {
  log(`Netlify: creating site ${SITE_NAME}`);
  if (DRY) { log("dry run: stopping before changes"); process.exit(0); }
  const r = await netlify("POST", "/sites", { name: SITE_NAME });
  if (r.status === 422) throw new Error(`Site name ${SITE_NAME} is taken; set CLASSROOM_NETLIFY_SITE.`);
  site = ok(r, "create site");
} else log(`Netlify: site ${SITE_NAME}`);
const url = site.ssl_url || `https://${SITE_NAME}.netlify.app`;
const account = site.account_slug ?? site.account_id;

// 2) The backend's key
const env = ok(await netlify("GET", `/accounts/${account}/env?site_id=${site.id}`), "env vars");
const have = new Set((Array.isArray(env) ? env : []).map((e) => e.key));
if (!have.has("CLASSROOM_SERVICE_ACCOUNT_B64") || ROTATE) {
  log(`Env: CLASSROOM_SERVICE_ACCOUNT_B64 ← new key for ${runtimeEmail()}`);
  if (!DRY) {
    const { api, must } = await googleClient(loadServiceAccount(setupKeyB64()));
    const keysUrl = `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${runtimeEmail()}/keys`;
    const old = must(await api("GET", `${keysUrl}?keyTypes=USER_MANAGED`), "list keys (run setup-project.mjs first)").keys ?? [];
    const key = must(await api("POST", keysUrl, {}), "create key");
    const full = JSON.parse(Buffer.from(key.privateKeyData, "base64").toString("utf8"));
    const compact = { project_id: full.project_id, client_email: full.client_email, private_key: full.private_key };
    const values = [{ value: Buffer.from(JSON.stringify(compact)).toString("base64"), context: "all" }];
    ok(have.has("CLASSROOM_SERVICE_ACCOUNT_B64")
      ? await netlify("PUT", `/accounts/${account}/env/CLASSROOM_SERVICE_ACCOUNT_B64?site_id=${site.id}`, { key: "CLASSROOM_SERVICE_ACCOUNT_B64", values })
      : await netlify("POST", `/accounts/${account}/env?site_id=${site.id}`, [{ key: "CLASSROOM_SERVICE_ACCOUNT_B64", values }]), "set key");
    for (const k of old) must(await api("DELETE", `https://iam.googleapis.com/v1/${k.name}`), "delete old key");
  }
} else log("Env: CLASSROOM_SERVICE_ACCOUNT_B64 set");
if (DRY) { log("dry run: nothing changed"); process.exit(0); }

// 3) Credits of THIS account (same rules as the game's netlify-budget.mjs)
process.env.NETLIFY_AUTH_TOKEN = TOKEN; delete process.env.NETLIFY_SECRET;
const { assertNetlifyBudget } = await import("../../backend/scripts/netlify-budget.mjs");
await assertNetlifyBudget("classroom backend");

// 4) Build + deploy
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, NETLIFY_AUTH_TOKEN: TOKEN } });
run("npm", ["install", "--no-audit", "--no-fund"], DIR);
run("npm", ["run", "build"], DIR);
run("npm", ["install", "--no-audit", "--no-fund"], path.join(DIR, "netlify"));
run("npx", ["-y", "netlify-cli@27", "deploy", "--prod", "--no-build", "--dir", "public", "--functions", "functions", "--site", site.id, "--message", "classroom backend"], path.join(DIR, "netlify"));

// 5) Point the classroom web app at it + smoke test
fs.writeFileSync(path.join(ROOT, "apps/classroom/backend.json"), JSON.stringify({ url }, null, 2) + "\n");
log(`App: apps/classroom/backend.json → ${url} (commit it)`);
const res = await fetch(`${url}/api/getMyRoles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: {} }) });
const body = await res.json().catch(() => null);
if (res.status !== 401 || body?.error?.status !== "unauthenticated") throw new Error(`Smoke test: expected 401 unauthenticated, got HTTP ${res.status}`);
log(`Smoke test OK. Project ${PROJECT}, ${url}`);
