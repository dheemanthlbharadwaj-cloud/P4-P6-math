#!/usr/bin/env node
// Prepares the Firebase project the student app shares with the question bank editor (primary-math-sg, free Spark
// plan) for student accounts. Idempotent: safe to re-run.
//
//   node backend/scripts/setup-project.mjs [--dry] [--no-deploy]      (FIREBASE_PROJECT_ID overrides the project)
//
// Needs a service account that is Owner of the project, as base64 JSON in SETUP_SERVICE_ACCOUNT_B64 (falls back to
// FIREBASE_SERVICE_ACCOUNT_B64). Never prints secret values.
//
// Steps: enable APIs → check Firestore database "default" (the question bank's; student data lives next to it) →
// Auth (email/password on, authorized domains incl. the app's web domain) → the project's web app config into
// apps/mobile/firebase.web.json (+ databaseId) → service account the backend runs as (catapult-backend: Firestore
// + Auth admin) → merged security rules + indexes (deploy-rules.mjs; the editor's rules are kept).
// Google and Apple sign-in are switched on in the Firebase console (see backend/README.md).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { googleClient, loadServiceAccount } from "./gcp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DRY = process.argv.includes("--dry");
const NO_DEPLOY = process.argv.includes("--no-deploy");
const PROJECT = process.env.FIREBASE_PROJECT_ID || "primary-math-sg";
const DATABASE = "default"; // the question bank's named database (not "(default)")
const WEB_APP_NAME = "Catapult Math Athletes (web)";
const AUTH_DOMAINS = ["localhost", "catapult-math-athletes.web.app", "catapult-math-athletes.firebaseapp.com"];
const APIS = [
  "firebase.googleapis.com", "firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com",
  "firebaserules.googleapis.com", "iam.googleapis.com", "cloudresourcemanager.googleapis.com",
];
const RUNTIME_SA_ID = "catapult-backend"; // same id in deploy-netlify.mjs
const RUNTIME_ROLES = ["roles/datastore.user", "roles/firebaseauth.admin"];

const sa = loadServiceAccount();
const log = (...a) => console.log(...a);

const { api, must, wait } = await googleClient(sa);

// 0) Access
const proj = await api("GET", `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
if (proj.status === 403 || proj.status === 404) {
  throw new Error(`Can't see project ${PROJECT}. Create it, then add ${sa.client_email} as Owner (IAM & Admin → Grant access).`);
}
must(proj, "project");
log(`project ${PROJECT} (#${proj.body.projectNumber}) as ${sa.client_email}`);

// 1) APIs
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

// 2) Firebase
const fb = await api("GET", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}`);
if (fb.status === 404 || fb.status === 403) {
  log("Firebase: adding to project");
  if (!DRY) {
    const op = must(await api("POST", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}:addFirebase`, {}), "addFirebase");
    await wait(op.name, "https://firebase.googleapis.com/v1beta1");
  }
} else { must(fb, "firebase project"); log("Firebase: already added"); }

// 3) Firestore: the question bank's database must be there (student collections are added next to its own)
const dbGet = must(await api("GET", `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}`), `Firestore database "${DATABASE}"`);
log(`Firestore: database "${DATABASE}" in ${dbGet.locationId}`);

// 4) Auth: email/password on, authorized domains
const authBase = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
let cfg = await api("GET", authBase);
if (cfg.status === 404 || (cfg.status === 400 && /CONFIGURATION_NOT_FOUND/.test(cfg.error ?? ""))) {
  // Firebase Auth (not the paid Identity Platform upgrade) is switched on once from the console.
  throw new Error("Auth isn't set up yet: Firebase console → Build → Authentication → Get started, then re-run.");
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

// 5) Web app config (public: it identifies the project to the client SDK). Reuses the app's own web app if there
//    is one, else the project's existing one (the editor's); nothing is created.
const apps = must(await api("GET", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`), "list web apps");
const active = (apps.apps ?? []).filter((a) => a.state === "ACTIVE");
const app = active.find((a) => a.displayName === WEB_APP_NAME) ?? active[0];
if (!app) throw new Error("No web app in the project: add one in Firebase console → Project settings → Your apps.");
const conf = must(await api("GET", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps/${app.appId}/config`), "web app config");
// The Google provider's OAuth client (public; created when Google sign-in is switched on): the native apps' web client id.
const googleWebClientId = (idps.body.defaultSupportedIdpConfigs ?? []).find((i) => i.enabled && i.name.endsWith("/google.com"))?.clientId;
const out = { apiKey: conf.apiKey, authDomain: conf.authDomain, projectId: conf.projectId, storageBucket: conf.storageBucket, messagingSenderId: conf.messagingSenderId, appId: conf.appId, databaseId: DATABASE, ...(googleWebClientId ? { googleWebClientId } : {}) };
const webPath = path.join(ROOT, "apps/mobile/firebase.web.json");
const same = fs.existsSync(webPath) && fs.readFileSync(webPath, "utf8") === JSON.stringify(out, null, 2) + "\n";
log(`Web app: "${app.displayName ?? app.appId}" → apps/mobile/firebase.web.json ${same ? "(up to date)" : DRY ? "(would update)" : "(written)"}`);
if (!same && !DRY) fs.writeFileSync(webPath, JSON.stringify(out, null, 2) + "\n");

// 7) The service account the backend (Netlify) runs as: Firestore read/write + Auth admin (delete account), nothing else.
const runtimeEmail = `${RUNTIME_SA_ID}@${PROJECT}.iam.gserviceaccount.com`;
const saGet = await api("GET", `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${runtimeEmail}`);
if (saGet.status === 404 || (DRY && saGet.status === 403)) {
  log(`Backend service account: creating ${runtimeEmail}`);
  if (!DRY) {
    must(await api("POST", `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`, {
      accountId: RUNTIME_SA_ID, serviceAccount: { displayName: "Catapult Math Athletes backend (Netlify)" },
    }), "create service account");
  }
} else { must(saGet, "service account"); log(`Backend service account: ${runtimeEmail} exists`); }
if (!DRY) {
  const crm = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`;
  for (let attempt = 0; ; attempt++) {
    const policy = must(await api("POST", `${crm}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } }), "get IAM policy");
    const member = `serviceAccount:${runtimeEmail}`;
    let changed = false;
    for (const role of RUNTIME_ROLES) {
      let b = (policy.bindings ??= []).find((x) => x.role === role && !x.condition);
      if (!b) { b = { role, members: [] }; policy.bindings.push(b); }
      if (!b.members.includes(member)) { b.members.push(member); changed = true; }
    }
    if (!changed) { log(`Backend service account: roles ${RUNTIME_ROLES.join(", ")} in place`); break; }
    const r = await api("POST", `${crm}:setIamPolicy`, { policy });
    if (r.status < 300) { log(`Backend service account: granted ${RUNTIME_ROLES.join(", ")}`); break; }
    // A just-created account can take a few seconds to be visible to IAM; a concurrent edit gives 409.
    if (attempt >= 5) must(r, "set IAM policy");
    await new Promise((s2) => setTimeout(s2, 5000));
  }
}

// 8) Security rules (merged with the editor's) + indexes
if (NO_DEPLOY) { log("skipping rules (--no-deploy)"); process.exit(0); }
execFileSync(process.execPath, [path.join(ROOT, "backend/scripts/deploy-rules.mjs"), ...(DRY ? ["--dry"] : [])], { stdio: "inherit", env: { ...process.env, FIREBASE_PROJECT_ID: PROJECT } });
log(DRY ? "dry run: nothing changed" : "Done. Next: node backend/scripts/deploy-netlify.mjs");
