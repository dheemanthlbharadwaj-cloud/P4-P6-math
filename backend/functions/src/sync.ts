// Device data through the backend: the app has no direct Firestore access, so it never depends on the security rules
// of the database it shares with the question bank editor (primary-math-sg "default").
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  mergeGradeProgress, type GradeProgress, type ListFriendRequestsResponse, type SyncProgressResponse, type UpdateProfileResponse,
  type UserProfile, type WrongBookmark,
} from "./shared/index.js";
import { col, db, requireUid, throwFail } from "./admin.js";
import { validateProfileUpdate, validateSyncProgress } from "./logic/rules.js";
import { publicProfileOf } from "./profile.js";

/** Profile fields + equipped look (owned items only; otherwise the look is left as it was) → users + publicProfiles. */
export const updateProfile = onCall(async (req): Promise<UpdateProfileResponse> => {
  const uid = requireUid(req);
  const userRef = db.collection(col.users).doc(uid);
  const [user, wallet] = await Promise.all([userRef.get(), db.collection(col.wallets).doc(uid).get()]);
  if (!user.exists) throw new HttpsError("failed-precondition", "no profile yet");
  const v = validateProfileUpdate(req.data, (wallet.data()?.inventory as string[] | undefined) ?? []);
  if (!v.ok) throwFail(v);
  const patch = { ...v.fields, ...(v.cat ? { cat: v.cat } : {}) };
  await userRef.update(patch);
  const next = { ...(user.data() as UserProfile), ...patch };
  await db.collection(col.publicProfiles).doc(uid).set(publicProfileOf(uid, next));
  return { catApplied: !!v.cat };
});

const wrongCol = (uid: string) => db.collection(col.users).doc(uid).collection("wrong");

/** Merge progress by max (transaction), store changed bookmarks, optionally return everything for the grade. */
export const syncProgress = onCall(async (req): Promise<SyncProgressResponse> => {
  const uid = requireUid(req);
  const v = validateSyncProgress(req.data);
  if (!v.ok) throwFail(v);
  const ref = db.collection(col.users).doc(uid).collection("progress").doc(v.grade);
  const progress = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? ({ grade: v.grade, unlockedTopics: [], levels: {}, ...snap.data() } as GradeProgress) : undefined;
    if (!v.progress) return stored ?? null;
    const merged = mergeGradeProgress(v.progress, stored);
    tx.set(ref, { grade: v.grade, unlockedTopics: merged.unlockedTopics, levels: merged.levels, updatedAt: Date.now() });
    return merged;
  });
  if (v.wrong.length) {
    const batch = db.batch();
    for (const w of v.wrong) batch.set(wrongCol(uid).doc(w.id), { grade: v.grade, active: w.active, flaggedAt: w.flaggedAt, updatedAt: Date.now() });
    await batch.commit();
  }
  if (!v.pull) return { progress: progress ? { grade: v.grade, unlockedTopics: progress.unlockedTopics, levels: progress.levels } : null };
  const all = await wrongCol(uid).where("grade", "==", v.grade).get();
  const wrong: WrongBookmark[] = all.docs.map((d) => ({ id: d.id, active: d.data().active !== false, flaggedAt: Number(d.data().flaggedAt ?? 0) }));
  return { progress: progress ? { grade: v.grade, unlockedTopics: progress.unlockedTopics, levels: progress.levels } : null, wrong };
});

/** Pending friend requests addressed to the caller, with the sender's display name. */
export const listFriendRequests = onCall(async (req): Promise<ListFriendRequestsResponse> => {
  const uid = requireUid(req);
  const snap = await db.collection(col.friendRequests).where("to", "==", uid).where("status", "==", "pending").limit(50).get();
  const requests = await Promise.all(snap.docs.map(async (d) => {
    const from = String(d.data().from);
    const p = await db.collection(col.publicProfiles).doc(from).get();
    return { id: d.id, fromUid: from, displayName: String(p.data()?.displayName ?? "A player") };
  }));
  return { requests };
});
