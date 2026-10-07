import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { FUNCTIONS_REGION, TIMEZONE } from "./shared/index.js";
import type { Fail } from "./logic/rules.js";

// Outside Google Cloud (the Netlify host) the service account comes from BACKEND_SERVICE_ACCOUNT_B64; on Cloud
// Functions / the emulators the default credentials are used.
if (!getApps().length) {
  const b64 = process.env.BACKEND_SERVICE_ACCOUNT_B64;
  if (b64) {
    const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  } else initializeApp();
}
export const REGION = FUNCTIONS_REGION;
export const SCHEDULE_TZ = TIMEZONE; // Asia/Singapore
setGlobalOptions({ region: REGION, maxInstances: 20 });

// The student data shares the question bank's Firestore database in primary-math-sg, which is a named database
// "default" (not "(default)"): FIRESTORE_DATABASE_ID=default on the Netlify site. Emulators/tests use "(default)".
export const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "(default)";
export const db = DATABASE_ID === "(default)" ? getFirestore() : getFirestore(DATABASE_ID);
export const auth = getAuth();
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
  questions: "questions", // the question bank (editor-owned; read only here)
  questionReports: "question_reports",
} as const;
export const dailyBoard = (date: string) => `daily-${date}`;
export const monthlyBoard = (ym: string) => `monthly-${ym}`;
export const entriesRef = (board: string) => db.collection(col.leaderboards).doc(board).collection("entries");
export const snapshotEntriesRef = (date: string) => db.collection(col.snapshots).doc(date).collection("entries");
