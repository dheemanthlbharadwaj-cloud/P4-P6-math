#!/usr/bin/env node
// One-shot setup of the student-app Firebase project (separate from the editor project). Idempotent: safe to re-run.
//
//   FIREBASE_PROJECT_ID=<new project id> node backend/scripts/setup-project.mjs [--dry] [--no-deploy]
//
// Needs a service account that is Owner of the new project, as base64 JSON in SETUP_SERVICE_ACCOUNT_B64 (falls back
// to FIREBASE_SERVICE_ACCOUNT_B64). The project must exist and be on the Blaze plan (Cloud Functions need billing).
// Never prints secret values.
//
// Steps: enable APIs → add Firebase → Firestore (default) in asia-southeast1 → Auth (email/password on, authorized
// domains) → web app + its public config into apps/mobile/firebase.web.json → .firebaserc → REVENUECAT_WEBHOOK_AUTH
// secret (random, if missing) → deploy Firestore rules/indexes + Cloud Functions.
// Google and Apple sign-in are switched on in the Firebase console (see backend/README.md): Google needs the OAuth
// client the console creates, Apple needs keys from the Apple Developer account.
import { createSign, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DRY = process.argv.includes("--dry");
const NO_DEPLOY = process.argv.includes("--no-deploy");
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const REGION = "asia-southeast1";
const WEB_APP_NAME = "Catapult Math Athletes (web)";
const AUTH_DOMAINS = ["localhost", "catapult-math-athletes.web.app", "catapult-math-athletes.firebaseapp.com"];
const APIS = [
  "firebase.googleapis.com", "firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com",
  "cloudfunctions.googleapis.com", "cloudbuild.googleapis.com", "artifactregistry.googleapis.com", "run.googleapis.com",
  "eventarc.googleapis.com", "pubsub.googleapis.com", "cloudscheduler.googleapis.com", "secretmanager.googleapis.com",
  "firebaserules.googleapis.com", "firebasehosting.googleapis.com", "cloudbilling.googleapis.com", "logging.googleapis.com",
];

if (!PROJECT) throw new Error("Set FIREBASE_PROJECT_ID to the new project's id.");
const saB64 = process.env.SETUP_SERVICE_ACCOUNT_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_B64;
if (!saB64) throw new Error("Set SETUP_SERVICE_ACCOUNT_B64 (or FIREBASE_SERVICE_ACCOUNT_B64).");
const sa = JSON.parse(Buffer.from(saB64, "base64").toString("utf8"));
const log = (...a) => console.log(...a);

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`token: HTTP ${res.status}`);
  return (await res.json()).access_token;
}
const TOKEN = await accessToken();

/** JSON request; returns { status, body }. Error bodies are reduced to their message (never echoed wholesale). */
async function api(method, url, body, extraHeaders = {}) {
  const res = await fetch(url, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  return { status: res.status, body: json, error: json?.error?.message };
}
const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${r.error ?? ""}`); return r.body; };

/** Long-running operation → wait until done. */
async function wait(opName, base) {
  for (let i = 0; i < 90; i++) {
    const r = must(await api("GET", `${base}/${opName}`), `operation ${opName}`);
    if (r.done) { if (r.error) throw new Error(`${opName}: ${r.error.message}`); return r.response; }
    await new Promise((s) => setTimeout(s, 4000));
  }
  throw new Error(`${opName}: timed out`);
}

// 0) Access + billing
const proj = await api("GET", `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
if (proj.status === 403 || proj.status === 404) {
  throw new Error(`Can't see project ${PROJECT}. Create it, then add ${sa.client_email} as Owner (IAM & Admin → Grant access).`);
}
must(proj, "project");
log(`project ${PROJECT} (#${proj.body.projectNumber}) as ${sa.client_email}`);

// 1) APIs (billing check needs cloudbilling, so it comes after)
const enabled = new Set();
{
  let page = "";
  do {
    const r = must(await api("GET", `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services?filter=state:ENABLED&pageSize=200${page ? `&pageToken=${page}` : ""}`), "list services");
    (r.services ?? []).forEach((s) => enabled.add(s.config.name));
    page = r.nextPageToken ?? "";
  } while (page);
}
const missing = APIS.filter((a) => !enabled.has(a));
log(`APIs: ${missing.length ? `enabling ${missing.join(", ")}` : "all enabled"}`);
if (missing.length && !DRY) {
  const op = must(await api("POST", `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services:batchEnable`, { serviceIds: missing }), "enable APIs");
  if (!op.done) await wait(op.name, "https://serviceusage.googleapis.com/v1");
}

const billing = await api("GET", `https://cloudbilling.googleapis.com/v1/projects/${PROJECT}/billingInfo`);
if (billing.status < 300 && !billing.body.billingEnabled) {
  throw new Error("Billing is off. Upgrade the project to the Blaze plan in the Firebase console, then re-run.");
}
log(`billing: ${billing.status < 300 ? "on (Blaze)" : `unknown (HTTP ${billing.status}); continuing`}`);

// 2) Firebase
const fb = await api("GET", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}`);
if (fb.status === 404 || fb.status === 403) {
  log("Firebase: adding to project");
  if (!DRY) {
    const op = must(await api("POST", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}:addFirebase`, {}), "addFirebase");
    await wait(op.name, "https://firebase.googleapis.com/v1beta1");
  }
} else { must(fb, "firebase project"); log("Firebase: already added"); }

// 3) Firestore (default) in asia-southeast1
const dbGet = await api("GET", `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`);
if (dbGet.status === 404) {
  log(`Firestore: creating (default) in ${REGION}`);
  if (!DRY) {
    const op = must(await api("POST", `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases?databaseId=(default)`, {
      locationId: REGION, type: "FIRESTORE_NATIVE", concurrencyMode: "PESSIMISTIC", deleteProtectionState: "DELETE_PROTECTION_ENABLED",
    }), "create Firestore");
    if (!op.done) await wait(op.name, "https://firestore.googleapis.com/v1");
  }
} else {
  const d = must(dbGet, "Firestore");
  log(`Firestore: (default) exists in ${d.locationId}${d.locationId !== REGION ? ` (expected ${REGION}; functions still work, just farther away)` : ""}`);
}

// 4) Auth: email/password on, authorized domains
const authBase = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
let cfg = await api("GET", authBase);
if (cfg.status === 404 || (cfg.status === 400 && /CONFIGURATION_NOT_FOUND/.test(cfg.error ?? ""))) {
  log("Auth: initialising");
  if (!DRY) must(await api("POST", `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/identityPlatform:initializeAuth`, {}), "initialise Auth");
  cfg = DRY ? { status: 200, body: {} } : await api("GET", authBase);
}
const c = must(cfg, "Auth config");
const domains = [...new Set([...(c.authorizedDomains ?? []), `${PROJECT}.firebaseapp.com`, `${PROJECT}.web.app`, ...AUTH_DOMAINS])];
log(`Auth: email/password ${c.signIn?.email?.enabled ? "already on" : "→ on"}; authorized domains → ${domains.join(", ")}`);
if (!DRY) {
  must(await api("PATCH", `${authBase}?updateMask=signIn.email.enabled,signIn.email.passwordRequired,authorizedDomains`, {
    signIn: { email: { enabled: true, passwordRequired: true } }, authorizedDomains: domains,
  }), "update Auth config");
}
const idps = await api("GET", `${authBase.replace("/config", "")}/defaultSupportedIdpConfigs`);
const on = new Set((idps.body.defaultSupportedIdpConfigs ?? []).filter((i) => i.enabled).map((i) => i.name.split("/").pop()));
log(`Auth: Google ${on.has("google.com") ? "on" : "OFF (enable in console)"}, Apple ${on.has("apple.com") ? "on" : "OFF (enable in console)"}`);

// 5) Web app + public config (the web config is not secret: it identifies the project to the client SDK)
const apps = must(await api("GET", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`), "list web apps");
let app = (apps.apps ?? []).find((a) => a.displayName === WEB_APP_NAME && a.state === "ACTIVE");
if (!app) {
  log(`Web app: creating "${WEB_APP_NAME}"`);
  if (!DRY) {
    const op = must(await api("POST", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`, { displayName: WEB_APP_NAME }), "create web app");
    app = await wait(op.name, "https://firebase.googleapis.com/v1beta1");
  }
} else log(`Web app: "${WEB_APP_NAME}" exists`);
if (app && !DRY) {
  const conf = must(await api("GET", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps/${app.appId}/config`), "web app config");
  const out = { apiKey: conf.apiKey, authDomain: conf.authDomain, projectId: conf.projectId, storageBucket: conf.storageBucket, messagingSenderId: conf.messagingSenderId, appId: conf.appId };
  fs.writeFileSync(path.join(ROOT, "apps/mobile/firebase.web.json"), JSON.stringify(out, null, 2) + "\n");
  log("Web app: wrote apps/mobile/firebase.web.json");
}

// 6) .firebaserc
const rcPath = path.join(ROOT, "backend/.firebaserc");
const rc = JSON.parse(fs.readFileSync(rcPath, "utf8"));
if (rc.projects.default !== PROJECT) {
  log(`.firebaserc: default ${rc.projects.default} → ${PROJECT}`);
  if (!DRY) { rc.projects.default = PROJECT; fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + "\n"); }
}

// 7) RevenueCat webhook secret (random if missing; copy it into RevenueCat from Secret Manager in the console)
const SECRET = "REVENUECAT_WEBHOOK_AUTH";
const secretBase = `https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets`;
const sec = await api("GET", `${secretBase}/${SECRET}`);
if (DRY && sec.status === 403) {
  log(`Secret ${SECRET}: can't check yet (Secret Manager API not enabled); would create if missing`);
} else if (sec.status === 404) {
  log(`Secret ${SECRET}: creating with a random value`);
  if (!DRY) {
    must(await api("POST", `${secretBase}?secretId=${SECRET}`, { replication: { automatic: {} } }), "create secret");
    must(await api("POST", `${secretBase}/${SECRET}:addVersion`, { payload: { data: Buffer.from(`Bearer ${randomBytes(24).toString("hex")}`).toString("base64") } }), "add secret version");
  }
} else { must(sec, "secret"); log(`Secret ${SECRET}: exists`); }

// 8) Deploy rules, indexes, functions
if (DRY || NO_DEPLOY) { log(DRY ? "dry run: nothing changed" : "skipping deploy (--no-deploy)"); process.exit(0); }
const keyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sa-")), "key.json");
fs.writeFileSync(keyFile, JSON.stringify(sa), { mode: 0o600 });
try {
  log("Deploy: firestore rules + indexes + functions (takes a few minutes)");
  execFileSync("npx", ["firebase", "deploy", "--only", "firestore,functions", "--project", PROJECT, "--non-interactive", "--force"], {
    cwd: path.join(ROOT, "backend"), stdio: "inherit", env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: keyFile },
  });
} finally {
  fs.rmSync(path.dirname(keyFile), { recursive: true, force: true });
}
log("Done.");
