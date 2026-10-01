import { randomInt } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  ACTIVE_GRADES, type BootstrapProfileRequest, type BootstrapProfileResponse, type DeleteAccountResponse, type Grade, type UserProfile,
} from "./shared/index.js";
import { loadAccountState } from "./account.js";
import { auth, col, db, FieldValue, REGION, requireUid } from "./admin.js";
import { makeFriendCode } from "./logic/rules.js";

const str = (v: unknown, max: number, min = 0): string => {
  if (typeof v !== "string") throw new HttpsError("invalid-argument", "expected string");
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpsError("invalid-argument", `length must be ${min}..${max}`);
  return s;
};

export const publicProfileOf = (uid: string, p: Pick<UserProfile, "fullName" | "school" | "grade" | "cat">) => ({
  uid,
  displayName: p.fullName,
  school: p.school,
  grade: p.grade,
  cat: { name: p.cat.name, colorId: p.cat.colorId, hatId: p.cat.hatId ?? null },
});

/**
 * Called once after onboarding, and with `{ restoreOnly: true }` right after sign-in on a new device.
 * Idempotent: returns the existing profile if there already is one. Always returns the server-owned account state
 * (stars, inventory, equipped look, entitlement) so the app can rebuild itself.
 */
export const bootstrapProfile = onCall(async (req): Promise<BootstrapProfileResponse> => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Partial<BootstrapProfileRequest> & { restoreOnly?: unknown };
  const existing = await db.collection(col.users).doc(uid).get();
  if (existing.exists) {
    const profile = existing.data() as UserProfile;
    return { profile, created: false, ...(await loadAccountState(uid, profile)) };
  }
  if (d.restoreOnly === true) return { profile: null, created: false, ...(await loadAccountState(uid, null)) };

  const grade = String(d.grade ?? "P6") as Grade;
  if (!ACTIVE_GRADES.includes(grade)) throw new HttpsError("invalid-argument", "bad grade");
  const topics = Array.isArray(d.topicsLearnt) ? d.topicsLearnt.map((t) => String(t).slice(0, 60)).slice(0, 20) : [];
  const psleDate = str(d.psleDate ?? "", 10);
  if (psleDate && !/^\d{4}-\d{2}-\d{2}$/.test(psleDate)) throw new HttpsError("invalid-argument", "psleDate must be yyyy-mm-dd");
  const base = {
    uid,
    fullName: str(d.fullName, 60, 1),
    school: str(d.school ?? "", 80),
    grade,
    topicsLearnt: topics,
    psleDate,
    cat: { name: str(d.catName ?? "Mochi", 20, 1), colorId: "color-black", hatId: null as string | null },
  };

  for (let attempt = 0; attempt < 8; attempt++) {
    const friendCode = makeFriendCode(randomInt);
    try {
      const profile = await db.runTransaction(async (tx) => {
        const userRef = db.collection(col.users).doc(uid);
        const codeRef = db.collection(col.friendCodes).doc(friendCode);
        const [u, c] = await Promise.all([tx.get(userRef), tx.get(codeRef)]);
        if (u.exists) return u.data() as UserProfile;
        if (c.exists) throw new Error("code-collision");
        const full = { ...base, friendCode, createdAt: Date.now() };
        tx.set(userRef, full);
        tx.set(codeRef, { uid });
        tx.set(db.collection(col.publicProfiles).doc(uid), publicProfileOf(uid, full));
        tx.set(db.collection(col.wallets).doc(uid), { starBalance: 0, totalStars: 0, inventory: ["color-black"], updatedAt: FieldValue.serverTimestamp() });
        return full as UserProfile;
      });
      return { profile, created: true, ...(await loadAccountState(uid, profile)) };
    } catch (e) {
      if ((e as Error).message !== "code-collision") throw e;
    }
  }
  throw new HttpsError("internal", "could not allocate a friend code");
});

/** Keeps publicProfiles/{uid} in sync when the owner edits their profile / equips items. */
export const syncPublicProfile = onDocumentWritten({ document: "users/{uid}", region: REGION }, async (event) => {
  const after = event.data?.after;
  const uid = event.params.uid;
  if (!after?.exists) return;
  const p = after.data() as UserProfile;
  await db.collection(col.publicProfiles).doc(uid).set(publicProfileOf(uid, p));
});

/** Deletes the Auth user and every document that belongs to them. */
export const deleteAccount = onCall(async (req): Promise<DeleteAccountResponse> => {
  const uid = requireUid(req);
  const userRef = db.collection(col.users).doc(uid);
  const user = (await userRef.get()).data() as UserProfile | undefined;

  // friendships / requests / referrals pointing at this account
  for (const q of [
    db.collection(col.friendships).where("members", "array-contains", uid),
    db.collection(col.friendRequests).where("from", "==", uid),
    db.collection(col.friendRequests).where("to", "==", uid),
    db.collection(col.referrals).where("referrerUid", "==", uid), // referrals this account was the referrer of
  ]) {
    const s = await q.get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  // leaderboard entries + snapshots (all subcollections called "entries")
  const entries = await db.collectionGroup("entries").where("uid", "==", uid).get();
  await Promise.all(entries.docs.map((d) => d.ref.delete()));

  await db.recursiveDelete(userRef); // profile, progress, wrong, ledger, attempts
  const singles = [
    db.collection(col.publicProfiles).doc(uid),
    db.collection(col.wallets).doc(uid),
    db.collection(col.medals).doc(uid),
    db.collection(col.entitlements).doc(uid),
    db.collection(col.referrals).doc(uid),
    ...(user?.friendCode ? [db.collection(col.friendCodes).doc(user.friendCode)] : []),
  ];
  await Promise.all(singles.map((r) => r.delete()));
  try {
    await auth.deleteUser(uid);
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  }
  return { deleted: true };
});
