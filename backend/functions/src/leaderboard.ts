// The Firestore side of the leaderboard (see logic/leaderboardData.ts) and the per-instance LeaderboardData every handler shares.
import type { Grade, PublicProfile } from "./shared/index.js";
import { col, db, entriesRef, monthlyBoard, snapshotEntriesRef } from "./admin.js";
import { CONTENT } from "./content/index.js";
import { sgtDate, sgtMonth } from "./logic/dates.js";
import { buildBoard, DailyBoardServer, splitParts, type BoardPlayer, type BoardPointer, type BoardSource } from "./logic/dailyBoard.js";
import { computeFriendSpots } from "./logic/friendSpots.js";
import { LeaderboardData, MAX_FRIENDS, MAX_SCHOOL, TOP_N, type LbStore } from "./logic/leaderboardData.js";
import type { Medal } from "./logic/ranking.js";

async function getAll<T>(refs: FirebaseFirestore.DocumentReference[], pick: (d: FirebaseFirestore.DocumentSnapshot) => T | undefined): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await db.getAll(...refs.slice(i, i + 300));
    for (const s of snaps) if (s.exists) { const v = pick(s); if (v !== undefined) out.set(s.ref.id, v); }
  }
  return out;
}

export const firestoreLbStore: LbStore = {
  async friendships(uid) {
    const fs = await db.collection(col.friendships).where("members", "array-contains", uid).limit(MAX_FRIENDS).get();
    return fs.docs
      .map((d) => {
        const other = (d.data().members as string[]).find((m) => m !== uid);
        const c = d.data().createdAt as { toMillis?: () => number } | undefined;
        return other ? { uid: other, createdMs: typeof c?.toMillis === "function" ? c.toMillis() : 0 } : null;
      })
      .filter((f): f is { uid: string; createdMs: number } => !!f);
  },
  profiles: (uids) => getAll<PublicProfile>(uids.map((u) => db.collection(col.publicProfiles).doc(u)), (d) => d.data() as PublicProfile),
  medals: (uids) => getAll<Medal>(uids.map((u) => db.collection(col.medals).doc(u)), (d) => d.data()!.medal as Medal),
  snapshot: (date, uids) => getAll<number>(uids.map((u) => snapshotEntriesRef(date).doc(u)), (d) => d.data()!.stars as number),
  entries: (month, uids) => getAll(uids.map((u) => entriesRef(monthlyBoard(month)).doc(u)), (d) => ({ stars: (d.data()!.stars as number | undefined) ?? 0, questionsDone: (d.data()!.questionsDone as number | undefined) ?? 0 })),
  async topRows(month) {
    const top = await entriesRef(monthlyBoard(month)).orderBy("stars", "desc").orderBy("questionsDone", "desc").limit(TOP_N).get();
    return top.docs.map((d) => ({ uid: d.id, stars: d.data().stars ?? 0, questionsDone: d.data().questionsDone ?? 0 }));
  },
  async aheadCount(month, stars) {
    return (await entriesRef(monthlyBoard(month)).where("stars", ">", stars).count().get()).data().count;
  },
  async schoolMates(school) {
    const s = await db.collection(col.publicProfiles).where("school", "==", school).limit(MAX_SCHOOL).get();
    return new Map(s.docs.map((d) => [d.id, d.data() as PublicProfile] as const));
  },
  async progress(grade: Grade, uids) {
    const snaps = await db.getAll(...uids.map((u) => db.collection(col.users).doc(u).collection("progress").doc(grade)));
    return new Map(snaps.map((s, i) => [uids[i], s.exists ? (s.data()?.levels as Record<string, { completed?: boolean }> | undefined) : undefined] as const));
  },
};

/** One per instance: shared by getLeaderboard, getDailyQuests and the handlers that change what it caches. */
export const lb = new LeaderboardData(
  firestoreLbStore,
  { now: Date.now, date: sgtDate, month: sgtMonth },
  (grade) => CONTENT[grade]?.topics,
);

// ---------- the daily board (logic/dailyBoard.ts) ----------
const BOARD = "leaderboardDaily";
const boardDoc = (date: string) => db.collection(BOARD).doc(date);
const pointerRef = () => db.collection(BOARD).doc("current");

export const firestoreBoardSource: BoardSource = {
  async pointer() {
    const s = await pointerRef().get();
    return s.exists ? (s.data() as BoardPointer) : null;
  },
  async parts(p) {
    const refs = Array.from({ length: p.parts }, (_, i) => boardDoc(p.date).collection("parts").doc(String(i)));
    const snaps = await db.getAll(...refs);
    return snaps.flatMap((s) => (s.exists ? (s.data()!.players as BoardPlayer[]) : []));
  },
};
/** One per instance. */
export const dailyBoard = new DailyBoardServer(firestoreBoardSource);

/** 23:55 SGT: build today's board. Reads every profile, monthly entry, medal and progress doc once; writes 1 + parts docs. */
export async function buildDailyBoard(now = Date.now()): Promise<{ date: string; count: number; parts: number }> {
  const date = sgtDate(now), month = sgtMonth(now);
  const [profSnap, entrySnap, medalSnap, prevPointer] = await Promise.all([
    db.collection(col.publicProfiles).get(),
    entriesRef(monthlyBoard(month)).get(),
    db.collection(col.medals).get(),
    firestoreBoardSource.pointer(),
  ]);
  const profiles = new Map(profSnap.docs.map((d) => [d.id, d.data() as PublicProfile] as const));
  const entries = new Map(entrySnap.docs.map((d) => [d.id, { stars: (d.data().stars as number | undefined) ?? 0, questionsDone: (d.data().questionsDone as number | undefined) ?? 0 }] as const));
  const medals = new Map(medalSnap.docs.map((d) => [d.id, d.data().medal as Medal] as const));
  const previous = prevPointer && prevPointer.date !== date ? { month: prevPointer.month, players: await firestoreBoardSource.parts(prevPointer) } : null;

  // friend spots: each player's progress doc for their grade
  const spots = new Map<string, Record<string, string>>();
  const byGrade = new Map<Grade, string[]>();
  for (const [u, p] of profiles) if (CONTENT[p.grade]) (byGrade.get(p.grade) ?? byGrade.set(p.grade, []).get(p.grade)!).push(u);
  for (const [grade, uids] of byGrade) {
    const levels = await firestoreLbStore.progress(grade, uids);
    const topics = CONTENT[grade]!.topics;
    for (const u of uids) spots.set(u, computeFriendSpots(topics, levels.get(u)));
  }

  const board = buildBoard({ date, month, now, profiles, entries, medals, spots, previous });
  const parts = splitParts(board.players);
  const { players: _players, ...pointer } = board;
  void _players;
  const batch = db.batch();
  parts.forEach((players, i) => batch.set(boardDoc(date).collection("parts").doc(String(i)), { players: JSON.parse(JSON.stringify(players)) }));
  batch.set(boardDoc(date), { ...pointer });
  batch.set(pointerRef(), { ...pointer, parts: parts.length });
  await batch.commit();
  // keep two days only
  if (prevPointer && prevPointer.date !== date) {
    const old = await db.collection(BOARD).listDocuments();
    for (const ref of old) if (ref.id !== "current" && ref.id !== date && ref.id !== prevPointer.date) await db.recursiveDelete(ref);
  }
  return { date, count: board.count, parts: parts.length };
}

/** deleteAccount: take the player off the saved board now (not only at the next build). Costs 1 + parts reads. */
export async function removeFromDailyBoard(uid: string): Promise<void> {
  const p = await firestoreBoardSource.pointer();
  if (!p) return;
  const refs = Array.from({ length: p.parts }, (_, i) => boardDoc(p.date).collection("parts").doc(String(i)));
  const snaps = await db.getAll(...refs);
  for (const s of snaps) {
    const players = (s.data()?.players as BoardPlayer[] | undefined) ?? [];
    if (players.some((x) => x.uid === uid)) await s.ref.set({ players: players.filter((x) => x.uid !== uid) });
  }
  dailyBoard.forget(uid);
}
