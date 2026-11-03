#!/usr/bin/env node
// Prepares the CLASSROOM Firebase project (Spark, its own limits; never the game's). Idempotent: safe to re-run.
//   node backend-classroom/scripts/setup-project.mjs [--dry]
// Before: the owner creates the project (console → Add project, id catapultclassroom (done 3 Nov 2026), no Analytics), opens
// Build → Authentication → Get started, switches on Google sign-in there, and gives the setup service account the Owner role.
// Steps: APIs → Firebase → Firestore (default) in asia-southeast1 → Auth (email/password on, authorized domains) → web app
// "Catapult Classroom (web)" (created if missing) → its config into apps/classroom/firebase.web.json → the backend's service
// account classroom-backend (Firestore user + Auth admin) → deny-all security rules. Never prints secrets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { googleClient, loadServiceAccount } from "../../backend/scripts/gcp.mjs";
import { PROJECT, RUNTIME_SA_ID, runtimeEmail, setupKeyB64 } from "./env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DRY = process.argv.includes("--dry");
const WEB_APP_NAME = "Catapult Classroom (web)";
const AUTH_DOMAINS = ["localhost", `${PROJECT}.web.app`, `${PROJECT}.firebaseapp.com`, "catapult-classroom.web.app", "catapult-classroom.firebaseapp.com"];
const APIS = ["firebase.googleapis.com", "firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com",
  "firebaserules.googleapis.com", "iam.googleapis.com", "cloudresourcemanager.googleapis.com", "firebasehosting.googleapis.com"];
const ROLES = ["roles/datastore.user", "roles/firebaseauth.admin"];
const log = (...a) => console.log(...a);
const sa = loadServiceAccount(setupKeyB64());
const { api, must, wait } = await googleClient(sa);

const proj = await api("GET", `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
if (proj.status === 403 || proj.status === 404) throw new Error(`Can't see project ${PROJECT}. Create it, then give ${sa.client_email} the Owner role.`);
must(proj, "project");
log(`project ${PROJECT} as ${sa.client_email}`);

// APIs
const enabled = new Set();
for (let page = ""; ;) {
  const r = must(await api("GET", `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services?filter=state:ENABLED&pageSize=200${page ? `&pageToken=${page}` : ""}`), "list services");
  (r.services ?? []).forEach((s) => enabled.add(s.config.name));
  if (!(page = r.nextPageToken ?? "")) break;
}
const missing = APIS.filter((a) => !enabled.has(a));
log(`APIs: ${missing.length ? `enabling ${missing.join(", ")}` : "all enabled"}`);
if (missing.length && !DRY) {
  const op = must(await api("POST", `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services:batchEnable`, { serviceIds: missing }), "enable APIs");
  if (!op.done) await wait(op.name, "https://serviceusage.googleapis.com/v1");
}

// Firebase
const fb = await api("GET", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}`);
if (fb.status === 404 || fb.status === 403) {
  log("Firebase: adding to project");
  if (!DRY) { const op = must(await api("POST", `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}:addFirebase`, {}), "addFirebase"); await wait(op.name, "https://firebase.googleapis.com/v1beta1"); }
} else { must(fb, "firebase project"); log("Firebase: on"); }

// Firestore
let dbRes = await api("GET", `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`);
if (dbRes.status === 404) {
  log("Firestore: creating (default) in asia-southeast1");
  if (!DRY) {
    const op = must(await api("POST", `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases?databaseId=(default)`, { type: "FIRESTORE_NATIVE", locationId: "asia-southeast1" }), "create database");
    if (op.name && !op.done) await wait(op.name, "https://firestore.googleapis.com/v1");
  }
} else log(`Firestore: (default) in ${must(dbRes, "database").locationId}`);

// Auth
const authBase = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
const cfg = await api("GET", authBase);
if (cfg.status === 404 || (cfg.status === 400 && /CONFIGURATION_NOT_FOUND/.test(cfg.error ?? ""))) throw new Error("Auth isn't set up yet: Firebase console → Build → Authentication → Get started, then re-run.");
const c = must(cfg, "Auth config");
const domains = [...new Set([...(c.authorizedDomains ?? []), ...AUTH_DOMAINS])];
log(`Auth: email/password → on; authorized domains → ${domains.join(", ")}`);
if (!DRY) must(await api("PATCH", `${authBase}?updateMask=signIn.email.enabled,signIn.email.passwordRequired,authorizedDomains`, { signIn: { email: { enabled: true, passwordRequired: true } }, authorizedDomains: domains }), "update Auth");
const idps = await api("GET", `${authBase.replace("/config", "")}/defaultSupportedIdpConfigs`);
const google = (idps.body.defaultSupportedIdpConfigs ?? []).some((i) => i.enabled && i.name.endsWith("/google.com"));
log(`Auth: Google sign-in ${google ? "on" : "OFF: switch it on in Firebase console → Authentication → Sign-in method"}`);

// Web app + config (public)
const appsUrl = `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`;
let app = (must(await api("GET", appsUrl), "web apps").apps ?? []).find((a) => a.state === "ACTIVE" && a.displayName === WEB_APP_NAME);
if (!app && !DRY) {
  log(`Web app: creating "${WEB_APP_NAME}"`);
  const op = must(await api("POST", appsUrl, { displayName: WEB_APP_NAME }), "create web app");
  app = (await wait(op.name, "https://firebase.googleapis.com/v1beta1")) ?? (must(await api("GET", appsUrl), "web apps").apps ?? []).find((a) => a.displayName === WEB_APP_NAME);
}
if (app) {
  const conf = must(await api("GET", `${appsUrl}/${app.appId}/config`), "web app config");
  const out = { apiKey: conf.apiKey, authDomain: conf.authDomain, projectId: conf.projectId, storageBucket: conf.storageBucket, messagingSenderId: conf.messagingSenderId, appId: conf.appId };
  fs.writeFileSync(path.join(ROOT, "apps/classroom/firebase.web.json"), JSON.stringify(out, null, 2) + "\n");
  log("Web app: config → apps/classroom/firebase.web.json (commit it; it is public)");
}

// Backend service account
const email = runtimeEmail();
const saGet = await api("GET", `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${email}`);
if (saGet.status === 404) {
  log(`Backend service account: creating ${email}`);
  if (!DRY) must(await api("POST", `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`, { accountId: RUNTIME_SA_ID, serviceAccount: { displayName: "Catapult Classroom backend (Netlify)" } }), "create service account");
} else { must(saGet, "service account"); log(`Backend service account: ${email}`); }
if (!DRY) {
  const crm = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`;
  for (let attempt = 0; ; attempt++) {
    const policy = must(await api("POST", `${crm}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } }), "get IAM policy");
    let changed = false;
    for (const role of ROLES) {
      let b = (policy.bindings ??= []).find((x) => x.role === role && !x.condition);
      if (!b) { b = { role, members: [] }; policy.bindings.push(b); }
      if (!b.members.includes(`serviceAccount:${email}`)) { b.members.push(`serviceAccount:${email}`); changed = true; }
    }
    if (!changed) { log(`Backend service account: ${ROLES.join(", ")}`); break; }
    const r = await api("POST", `${crm}:setIamPolicy`, { policy });
    if (r.status < 300) { log(`Backend service account: granted ${ROLES.join(", ")}`); break; }
    if (attempt >= 5) must(r, "set IAM policy");
    await new Promise((s) => setTimeout(s, 5000));
  }
}

// Rules: deny all (the backend uses the Admin SDK)
const rules = fs.readFileSync(path.join(ROOT, "backend-classroom/firestore.rules"), "utf8");
log("Rules: deny-all → cloud.firestore");
if (!DRY) {
  const RULES = "https://firebaserules.googleapis.com/v1";
  const rs = must(await api("POST", `${RULES}/projects/${PROJECT}/rulesets`, { source: { files: [{ name: "firestore.rules", content: rules }] } }), "compile rules");
  const name = `projects/${PROJECT}/releases/cloud.firestore`;
  const upd = await api("PATCH", `${RULES}/${name}`, { release: { name, rulesetName: rs.name } });
  if (upd.status === 404) must(await api("POST", `${RULES}/projects/${PROJECT}/releases`, { name, rulesetName: rs.name }), "create release"); else must(upd, "update release");
}
log(DRY ? "dry run: nothing changed" : "Done. Next: node backend-classroom/scripts/deploy.mjs, then add-admin.mjs");
