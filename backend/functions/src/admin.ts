import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { TIMEZONE } from "./shared/index.js";
import type { Fail } from "./logic/rules.js";

if (!getApps().length) initializeApp();
export const REGION = "asia-southeast1";
export const SCHEDULE_TZ = TIMEZONE; // Asia/Singapore
setGlobalOptions({ region: REGION, maxInstances: 20 });

export const db = getFirestore();
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
} as const;
export const dailyBoard = (date: string) => `daily-${date}`;
export const monthlyBoard = (ym: string) => `monthly-${ym}`;
export const entriesRef = (board: string) => db.collection(col.leaderboards).doc(board).collection("entries");
export const snapshotEntriesRef = (date: string) => db.collection(col.snapshots).doc(date).collection("entries");
