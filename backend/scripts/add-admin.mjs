#!/usr/bin/env node
// Creates (or disables / re-enables) an ADMIN (owner) account for the /admin dashboard, in the STUDENT Firebase project.
// Admins are never created from the app; this script is the only way (packages/shared/src/admin.ts).
//
//   node backend/scripts/add-admin.mjs --project catapult-math-students --email owner@example.com --name "Owner" [--dry]
//   node backend/scripts/add-admin.mjs --project catapult-math-students --email owner@example.com --disable [--dry]
//   options: --database "(default)"   Firestore database of the project (default: STUDENT_DATABASE_ID or "(default)")
//            --reset-password         set a NEW password on an EXISTING login (otherwise an existing login keeps its own way
//                                     of signing in, e.g. the owner's Google account)
//            --out-dir <dir>          where the credentials file is written (default: $ADMIN_CREDENTIALS_DIR or ~/.catapult-admins)
//
// What it does:
//   1. Auth user in the student project: created with a generated password if the email is new; if the email already has an
//      Auth user (e.g. the owner's own Google login) that login is REUSED: no password is set and its name is left alone.
//   2. admins/{uid} = { uid, name, email, active: true, createdAt } (AdminDoc, packages/shared/src/admin.ts).
//      --disable sets active:false (the admin callables refuse them within a minute) and disables the Auth user; running it
//      again without --disable turns both back on.
//   3. A generated password (new login, or --reset-password) is written ONCE to <out-dir>/<email>.txt (mode 0600, directory
//      0700) and NEVER printed to the terminal. Read it, store it somewhere safe, then delete the file.
// --dry prints what would happen and changes nothing (it does not even look the account up).
// Credentials: the student project's setup service account (STUDENT_SETUP_SERVICE_ACCOUNT_B64, else SETUP_SERVICE_ACCOUNT_B64 /
// FIREBASE_SERVICE_ACCOUNT_B64), Owner of the project. Never prints secrets.
import { randomInt } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { googleClient, loadServiceAccount } from "./gcp.mjs";

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) { try { http.setGlobalProxyFromEnv?.(); } catch { /* run with NODE_USE_ENV_PROXY=1 */ } }

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const PROJECT = opt("--project");
const EMAIL = (opt("--email", "") || "").trim().toLowerCase();
const NAME = (opt("--name", "") || "").trim();
const DATABASE = opt("--database", process.env.STUDENT_DATABASE_ID || "(default)");
const DRY = flag("--dry");
const DISABLE = flag("--disable");
const RESET = flag("--reset-password");
const OUT_DIR = opt("--out-dir", process.env.ADMIN_CREDENTIALS_DIR || path.join(os.homedir(), ".catapult-admins"));
const log = (...a) => console.log(...a);

const usage = () => { console.error('Usage: node backend/scripts/add-admin.mjs --project <student project id> --email <email> --name "<Name>" [--disable] [--reset-password] [--out-dir <dir>] [--dry]'); process.exit(2); };
if (!PROJECT || !/^[a-z0-9-]{4,40}$/.test(PROJECT)) usage();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) usage();
if (!DISABLE && (!NAME || NAME.length > 60)) usage();
if (PROJECT === "primary-math-sg") throw new Error("Admins belong in the student project, not the question editor's.");

/** 16 characters, no look-alikes (0/O, 1/l/I), at least one of each class. */
export function makePassword(rand = randomInt) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"];
  const all = sets.join("");
  const chars = sets.map((s) => s[rand(s.length)]);
  while (chars.length < 16) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

/** Firestore REST value for an AdminDoc. */
export const adminFields = (t) => ({
  uid: { stringValue: t.uid }, name: { stringValue: t.name }, email: { stringValue: t.email },
  active: { booleanValue: t.active }, createdAt: { integerValue: String(t.createdAt) },
});

if (DRY) {
  log(`dry run: project ${PROJECT}, database ${DATABASE}`);
  log(DISABLE ? `would disable the Auth user and set admins/{uid}.active=false for ${EMAIL}` : `would create the Auth user ${EMAIL} (or reuse it), write admins/{uid} {name: ${JSON.stringify(NAME)}, active: true}`);
  if (!DISABLE) log(`a new login gets a generated password written to ${path.join(OUT_DIR, `${EMAIL}.txt`)} (not to the terminal); an existing login keeps its sign-in method${RESET ? " except that --reset-password sets a new password on it" : " (no password is set)"}`);
  process.exit(0);
}

const sa = loadServiceAccount(process.env.STUDENT_SETUP_SERVICE_ACCOUNT_B64);
const { api, must } = await googleClient(sa);
const AUTH = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${encodeURIComponent(DATABASE)}/documents`;

// 1) Auth
const lookup = must(await api("POST", `${AUTH}/accounts:lookup`, { email: [EMAIL] }), "look up the account");
const existing = lookup.users?.[0];
let uid = existing?.localId;
let password = null;
let reused = false;
if (DISABLE) {
  if (!uid) throw new Error(`No Auth user ${EMAIL} in ${PROJECT}.`);
  must(await api("POST", `${AUTH}/accounts:update`, { localId: uid, disableUser: true }), "disable the Auth user");
} else if (!uid) {
  password = makePassword();
  const created = must(await api("POST", `${AUTH}/accounts`, { email: EMAIL, password, displayName: NAME, emailVerified: true }), "create the Auth user");
  uid = created.localId;
} else {
  // an existing login (e.g. the owner's Google account) keeps its name and way of signing in
  const patch = { localId: uid, disableUser: false };
  if (RESET) { password = makePassword(); patch.password = password; }
  must(await api("POST", `${AUTH}/accounts:update`, patch), "update the Auth user");
  reused = true;
}

// 2) admins/{uid}. createdAt is kept when the doc exists.
const cur = await api("GET", `${FS}/admins/${uid}`);
const createdAt = cur.status === 200 ? Number(cur.body.fields?.createdAt?.integerValue ?? Date.now()) : Date.now();
const name = DISABLE ? cur.body.fields?.name?.stringValue || NAME || EMAIL : NAME;
must(await api("PATCH", `${FS}/admins/${uid}`, { fields: adminFields({ uid, name, email: EMAIL, active: !DISABLE, createdAt }) }), "write admins/{uid}");

// 3) credentials file (only when a password was generated)
if (password) {
  fs.mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(OUT_DIR, `${EMAIL.replace(/[^a-z0-9@._-]/g, "_")}.txt`);
  fs.writeFileSync(file, `Catapult Mathletes admin login\nProject: ${PROJECT}\nEmail: ${EMAIL}\nPassword: ${password}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600); // writeFileSync's mode only applies to a NEW file
  log(`Admin ${EMAIL} ready (uid ${uid}${reused ? ", existing login reused" : ""}). The password was written to ${file} (not shown here). Store it somewhere safe, then delete the file.`);
} else log(`Admin ${EMAIL} ${DISABLE ? "disabled" : "updated"} (uid ${uid}).${DISABLE ? "" : " Their way of signing in is unchanged (no password set)."}`);
