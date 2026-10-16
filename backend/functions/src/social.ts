import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { GetLeaderboardResponse, RespondFriendRequestResponse, SendFriendRequestResponse } from "./shared/index.js";
import { col, db, FieldValue, requireUid, throwFail } from "./admin.js";
import { dailyBoard, lb } from "./leaderboard.js";
import { MAX_FRIENDS } from "./logic/leaderboardData.js";
import { isFriendCode, normalizeFriendCode, pairId, validateFriendRequest } from "./logic/rules.js";

export { MAX_FRIENDS };

async function uidForCode(raw: unknown): Promise<string | null> {
  const code = normalizeFriendCode(raw);
  if (!isFriendCode(code)) return null;
  const s = await db.collection(col.friendCodes).doc(code).get();
  return s.exists ? (s.data()!.uid as string) : null;
}

export const sendFriendRequest = onCall(async (req): Promise<SendFriendRequestResponse> => {
  const uid = requireUid(req);
  const toUid = await uidForCode((req.data as { friendCode?: unknown })?.friendCode);
  if (!toUid) throwFail({ ok: false, code: "not-found", message: "unknown friend code" });
  const friendshipRef = db.collection(col.friendships).doc(pairId(uid, toUid));
  const reqRef = db.collection(col.friendRequests).doc(`${uid}_${toUid}`);
  const reverseRef = db.collection(col.friendRequests).doc(`${toUid}_${uid}`);
  const res = await db.runTransaction(async (tx) => {
    const [fs, mine, theirs] = await Promise.all([tx.get(friendshipRef), tx.get(reqRef), tx.get(reverseRef)]);
    const v = validateFriendRequest({
      fromUid: uid, toUid, alreadyFriends: fs.exists,
      forwardPending: mine.exists && mine.data()!.status === "pending",
      reversePending: theirs.exists && theirs.data()!.status === "pending",
    });
    if (!v.ok) throwFail(v);
    if (v.autoAccept) {
      tx.set(friendshipRef, { members: [uid, toUid].sort(), createdAt: FieldValue.serverTimestamp() });
      tx.update(reverseRef, { status: "accepted", respondedAt: FieldValue.serverTimestamp() });
      return { status: "accepted" as const };
    }
    tx.set(reqRef, { from: uid, to: toUid, status: "pending", createdAt: FieldValue.serverTimestamp() });
    return { status: "pending" as const };
  });
  if (res.status === "accepted") lb.invalidateFriends(uid, toUid);
  return res;
});

export const respondFriendRequest = onCall(async (req): Promise<RespondFriendRequestResponse> => {
  const uid = requireUid(req);
  const { requestId, accept } = (req.data ?? {}) as { requestId?: unknown; accept?: unknown };
  if (typeof requestId !== "string" || typeof accept !== "boolean") throw new HttpsError("invalid-argument", "requestId and accept required");
  const reqRef = db.collection(col.friendRequests).doc(requestId);
  const res = await db.runTransaction(async (tx) => {
    const r = await tx.get(reqRef);
    if (!r.exists) throw new HttpsError("not-found", "no such request");
    const d = r.data()!;
    if (d.to !== uid) throw new HttpsError("permission-denied", "not your request");
    if (d.status !== "pending") throw new HttpsError("failed-precondition", "already answered");
    tx.update(reqRef, { status: accept ? "accepted" : "declined", respondedAt: FieldValue.serverTimestamp() });
    if (accept) tx.set(db.collection(col.friendships).doc(pairId(d.from, d.to)), { members: [d.from, d.to].sort(), createdAt: FieldValue.serverTimestamp() });
    return { status: accept ? ("accepted" as const) : ("declined" as const), from: d.from as string };
  });
  if (res.status === "accepted") lb.invalidateFriends(uid, res.from);
  return { status: res.status };
});

/**
 * Ranking = stars earned this SGT month (arrows vs the 00:00 SGT snapshot).
 * scope "friends": me + friends. scope "school": everyone whose profile has my school (up to 200).
 * scope "global": top 100 (+ me when outside it). All return selfUid / friendUids / friends so the app can highlight
 * friends and draw them on the map and the race track.
 * Served from the daily board (logic/dailyBoard.ts): built once a day at 23:55 SGT, so stars earned today show after
 * the next build. Only when no board was ever built does it fall back to the live, cached leaderboard.
 */
export { MAX_SCHOOL } from "./logic/leaderboardData.js";
export const getLeaderboard = onCall(async (req): Promise<GetLeaderboardResponse> => {
  const uid = requireUid(req);
  const scope = (req.data as { scope?: unknown } | undefined)?.scope;
  if (scope !== "friends" && scope !== "school" && scope !== "global") throw new HttpsError("invalid-argument", 'scope must be "friends", "school" or "global"');
  return (await dailyBoard.leaderboard(uid, scope, lb.liveFallback())) ?? lb.leaderboard(uid, scope);
});
