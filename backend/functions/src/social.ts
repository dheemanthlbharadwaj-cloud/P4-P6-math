import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  GetLeaderboardResponse, PublicProfile, RespondFriendRequestResponse, SendFriendRequestResponse,
} from "./shared/index.js";
import { col, dailyBoard, db, entriesRef, FieldValue, monthlyBoard, requireUid, snapshotEntriesRef, throwFail } from "./admin.js";
import { sgtDate, sgtMonth } from "./logic/dates.js";
import { buildEntries, type Medal, type Row } from "./logic/ranking.js";
import { isFriendCode, normalizeFriendCode, pairId, validateFriendRequest } from "./logic/rules.js";

export const MAX_FRIENDS = 100;

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
  return db.runTransaction(async (tx) => {
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
});

export const respondFriendRequest = onCall(async (req): Promise<RespondFriendRequestResponse> => {
  const uid = requireUid(req);
  const { requestId, accept } = (req.data ?? {}) as { requestId?: unknown; accept?: unknown };
  if (typeof requestId !== "string" || typeof accept !== "boolean") throw new HttpsError("invalid-argument", "requestId and accept required");
  const reqRef = db.collection(col.friendRequests).doc(requestId);
  return db.runTransaction(async (tx) => {
    const r = await tx.get(reqRef);
    if (!r.exists) throw new HttpsError("not-found", "no such request");
    const d = r.data()!;
    if (d.to !== uid) throw new HttpsError("permission-denied", "not your request");
    if (d.status !== "pending") throw new HttpsError("failed-precondition", "already answered");
    tx.update(reqRef, { status: accept ? "accepted" : "declined", respondedAt: FieldValue.serverTimestamp() });
    if (accept) tx.set(db.collection(col.friendships).doc(pairId(d.from, d.to)), { members: [d.from, d.to].sort(), createdAt: FieldValue.serverTimestamp() });
    return { status: accept ? ("accepted" as const) : ("declined" as const) };
  });
});

async function getAll<T>(refs: FirebaseFirestore.DocumentReference[], pick: (d: FirebaseFirestore.DocumentSnapshot) => T | undefined): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await db.getAll(...refs.slice(i, i + 300));
    for (const s of snaps) if (s.exists) { const v = pick(s); if (v !== undefined) out.set(s.ref.id, v); }
  }
  return out;
}

async function sideData(uids: string[], now: number) {
  const [profiles, medals, snap] = await Promise.all([
    getAll<PublicProfile>(uids.map((u) => db.collection(col.publicProfiles).doc(u)), (d) => d.data() as PublicProfile),
    getAll<Medal>(uids.map((u) => db.collection(col.medals).doc(u)), (d) => d.data()!.medal as Medal),
    getAll<number>(uids.map((u) => snapshotEntriesRef(sgtDate(now)).doc(u)), (d) => d.data()!.stars as number),
  ]);
  return { profiles, medals, prevStars: snap.size ? snap : null };
}

/**
 * scope "daily": me + friends (rank by monthly stars, today's questionsDone, arrows vs the 00:00 SGT snapshot).
 * scope "monthly": global top 100 (+ me when outside it). Both also return selfUid / friendUids / friends so the app
 * can highlight friends and draw them on the map.
 */
export const getLeaderboard = onCall(async (req): Promise<GetLeaderboardResponse> => {
  const uid = requireUid(req);
  const scope = (req.data as { scope?: unknown } | undefined)?.scope;
  if (scope !== "daily" && scope !== "monthly") throw new HttpsError("invalid-argument", 'scope must be "daily" or "monthly"');
  const now = Date.now();
  const month = monthlyBoard(sgtMonth(now));
  const today = sgtDate(now);

  const fs = await db.collection(col.friendships).where("members", "array-contains", uid).limit(MAX_FRIENDS).get();
  const friendUids = fs.docs.map((d) => (d.data().members as string[]).find((m) => m !== uid)!).filter(Boolean);
  const respond = (entries: GetLeaderboardResponse["entries"], profiles: Map<string, PublicProfile>): GetLeaderboardResponse => ({
    scope, periodKey: scope === "daily" ? today : sgtMonth(now), selfUid: uid, friendUids,
    friends: friendUids.map((u) => profiles.get(u)).filter((p): p is PublicProfile => !!p),
    entries,
  });

  if (scope === "daily") {
    const uids = [uid, ...friendUids];
    const [monthly, day, side] = await Promise.all([
      getAll<{ stars: number }>(uids.map((u) => entriesRef(month).doc(u)), (d) => ({ stars: d.data()!.stars ?? 0 })),
      getAll<{ questionsDone: number }>(uids.map((u) => entriesRef(dailyBoard(today)).doc(u)), (d) => ({ questionsDone: d.data()!.questionsDone ?? 0 })),
      sideData(uids, now),
    ]);
    const rows: Row[] = uids.map((u) => ({ uid: u, stars: monthly.get(u)?.stars ?? 0, questionsDone: day.get(u)?.questionsDone ?? 0 }));
    return respond(buildEntries(rows, side), side.profiles);
  }

  const top = await entriesRef(month).orderBy("stars", "desc").orderBy("questionsDone", "desc").limit(100).get();
  const rows: Row[] = top.docs.map((d) => ({ uid: d.id, stars: d.data().stars ?? 0, questionsDone: d.data().questionsDone ?? 0 }));
  const inTop = rows.some((r) => r.uid === uid);
  const mine = inTop ? null : await entriesRef(month).doc(uid).get();
  const uids = [...new Set([...rows.map((r) => r.uid), ...(mine?.exists ? [uid] : []), ...friendUids])];
  const side = await sideData(uids, now);
  const entries = buildEntries(rows, side);
  if (mine?.exists) {
    const stars = mine.data()!.stars ?? 0;
    const ahead = (await entriesRef(month).where("stars", ">", stars).count().get()).data().count;
    const [me] = buildEntries([{ uid, stars, questionsDone: mine.data()!.questionsDone ?? 0 }], { ...side, startRank: ahead + 1 });
    entries.push(me);
  }
  return respond(entries, side.profiles);
});
