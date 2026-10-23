import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { FUNCTIONS_REGION, TIMEZONE } from "./shared/index.js";
import type { Fail } from "./logic/rules.js";
import { resolveProjects, verifyWithFallback, type ServiceAccountJson } from "./logic/projects.js";

// Two Firebase projects (see logic/projects.ts): the STUDENT project (Auth + all student data in Firestore) and the
// EDITOR project (primary-math-sg: the question bank `questions`, read; `question_reports`, write). Without the
// STUDENT_* env vars everything is the one legacy project (BACKEND_SERVICE_ACCOUNT_B64 + FIRESTORE_DATABASE_ID).
// On Cloud Functions / the emulators default credentials are used.
const cfg = resolveProjects(process.env);
const decode = (b64: string): ServiceAccountJson => JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
const appFor = (name: string, b64: string | undefined): App => {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  if (!b64) return initializeApp(undefined, name);
  const sa = decode(b64);
  return initializeApp({ credential: cert(sa as unknown as ServiceAccount), projectId: sa.project_id }, name);
};
const studentApp = appFor("[DEFAULT]", cfg.studentB64);
const editorApp = cfg.split ? appFor("editor", cfg.editorB64 ?? cfg.legacyB64) : studentApp;
const dbOf = (app: App, id: string): Firestore => (id === "(default)" ? getFirestore(app) : getFirestore(app, id));
export const REGION = FUNCTIONS_REGION;
export const SCHEDULE_TZ = TIMEZONE; // Asia/Singapore
setGlobalOptions({ region: REGION, maxInstances: 20 });

export const DATABASE_ID = cfg.studentDatabaseId;
/** Student data (users, wallets, leaderboards, ...). */
export const db = dbOf(studentApp, cfg.studentDatabaseId);
/** The question editor's database: `questions` (read) and `question_reports` (write) only. */
export const editorDb = dbOf(editorApp, cfg.editorDatabaseId);
/** Student Auth. */
export const auth = getAuth(studentApp);

// During the transition, ID tokens of LEGACY_AUTH_PROJECT_ID (installed apps still sign in there) are accepted too.
let legacyAuth: Auth | null = null;
function getLegacyAuth(): Auth | null {
  if (!cfg.legacyAuthProjectId) return null;
  if (!legacyAuth) {
    const name = "legacy-auth";
    const existing = getApps().find((a) => a.name === name);
    let app = existing;
    if (!app) {
      const b64 = cfg.editorB64 ?? cfg.legacyB64;
      const sa = b64 ? decode(b64) : null;
      app = initializeApp(sa && sa.project_id === cfg.legacyAuthProjectId ? { credential: cert(sa as unknown as ServiceAccount), projectId: sa.project_id } : { projectId: cfg.legacyAuthProjectId }, name);
    }
    legacyAuth = getAuth(app);
  }
  return legacyAuth;
}
/**
 * Verifies a Firebase ID token against the student project, then (if configured) the legacy project. `checkRevoked` (admin* and
 * teacher* callables, see needsRevocationCheck) also asks Auth whether the login is disabled or its tokens were revoked: one extra
 * Auth lookup, so a disabled login loses access at once instead of when its 1 h token expires.
 */
export const verifyIdToken = (token: string, checkRevoked = false) =>
  verifyWithFallback((t) => auth.verifyIdToken(t, checkRevoked), cfg.legacyAuthProjectId ? (t) => getLegacyAuth()!.verifyIdToken(t, checkRevoked) : null, token);
export { FieldValue };

export function requireUid(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return req.auth.uid;
}
export function throwFail(f: Fail): never {
  throw new HttpsError(f.code, f.message);
}

// collection names / paths
export const col = {
  users: "users",
  wallets: "wallets",
  publicProfiles: "publicProfiles",
  friendCodes: "friendCodes",
  referrals: "referrals",
  friendships: "friendships",
  friendRequests: "friendRequests",
  leaderboards: "leaderboards",
  snapshots: "leaderboardSnapshots",
  meta: "leaderboardMeta",
  medals: "medals",
  entitlements: "entitlements",
  config: "config",
  teachers: "teachers", // classroom (classroom.ts contract): teachers/{uid}
  admins: "admins", // owner dashboard (packages/shared/src/admin.ts): admins/{uid}, written only by backend/scripts/add-admin.mjs
  adminLog: "adminLog", // one doc per admin write (server only)
  classes: "classes", // classes/{id} + posts, tasks, tasks/{id}/marks (server only)
  questions: "questions", // the question bank (EDITOR project; read only here: use editorDb)
  questionReports: "question_reports", // EDITOR project (use editorDb)
} as const;
export const dailyBoard = (date: string) => `daily-${date}`;
export const monthlyBoard = (ym: string) => `monthly-${ym}`;
export const entriesRef = (board: string) => db.collection(col.leaderboards).doc(board).collection("entries");
export const snapshotEntriesRef = (date: string) => db.collection(col.snapshots).doc(date).collection("entries");
