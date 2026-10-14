import { onCall } from "firebase-functions/v2/https";
import type { ClaimDailyQuestResponse, GetDailyQuestsResponse } from "./shared/index.js";
import { col, dailyBoard, db, entriesRef, FieldValue, monthlyBoard, requireUid, throwFail } from "./admin.js";
import { sgtDate, sgtMonth, startOfSgtDay } from "./logic/dates.js";
import { dailyQuestStates, validateDailyClaim } from "./logic/dailyQuests.js";

const questDocRef = (uid: string, date: string) => db.collection(col.users).doc(uid).collection("dailyQuests").doc(date);

/** Friendships of `uid` created at/after `sinceMs`. Reads every friendship doc of the user (bounded by the friend cap). */
async function friendsToday(uid: string, sinceMs: number, tx?: FirebaseFirestore.Transaction): Promise<number> {
  const q = db.collection(col.friendships).where("members", "array-contains", uid);
  const snap = await (tx ? tx.get(q) : q.get());
  return snap.docs.filter((d) => {
    const c = d.data().createdAt as { toMillis?: () => number } | undefined;
    return typeof c?.toMillis === "function" && c.toMillis() >= sinceMs;
  }).length;
}

export const getDailyQuests = onCall(async (req): Promise<GetDailyQuestsResponse> => {
  const uid = requireUid(req);
  const now = Date.now();
  const date = sgtDate(now);
  const [day, claimedDoc, friends] = await Promise.all([
    entriesRef(dailyBoard(date)).doc(uid).get(),
    questDocRef(uid, date).get(),
    friendsToday(uid, startOfSgtDay(now)),
  ]);
  const answers = (day.data()?.questionsDone as number | undefined) ?? 0;
  return { date, quests: dailyQuestStates({ answers, friends }, (claimedDoc.data()?.claimed as string[] | undefined) ?? []) };
});

export const claimDailyQuest = onCall(async (req): Promise<ClaimDailyQuestResponse> => {
  const uid = requireUid(req);
  const questId = (req.data as { questId?: unknown } | undefined)?.questId;
  const now = Date.now();
  const date = sgtDate(now);
  const since = startOfSgtDay(now);
  const walletRef = db.collection(col.wallets).doc(uid);
  const dayRef = entriesRef(dailyBoard(date)).doc(uid);
  const monthRef = entriesRef(monthlyBoard(sgtMonth(now))).doc(uid);
  const stateRef = questDocRef(uid, date);
  return db.runTransaction(async (tx) => {
    const [wallet, day, month, state, friends] = await Promise.all([
      tx.get(walletRef), tx.get(dayRef), tx.get(monthRef), tx.get(stateRef), friendsToday(uid, since, tx),
    ]);
    const progress = { answers: (day.data()?.questionsDone as number | undefined) ?? 0, friends };
    const claimed = (state.data()?.claimed as string[] | undefined) ?? [];
    const v = validateDailyClaim({ questId, progress, claimed });
    if (!v.ok) throwFail(v);
    const stars = v.quest.stars;
    const balance = (wallet.data()?.starBalance as number | undefined) ?? 0;
    const total = (wallet.data()?.totalStars as number | undefined) ?? 0;
    const monthlyStars = ((month.data()?.stars as number | undefined) ?? 0) + stars;
    const newClaimed = [...claimed, v.quest.id];
    tx.set(walletRef, { starBalance: balance + stars, totalStars: total + stars, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const inc = { uid, stars: FieldValue.increment(stars), updatedAt: FieldValue.serverTimestamp() };
    tx.set(monthRef, inc, { merge: true });
    tx.set(dayRef, inc, { merge: true });
    tx.set(db.collection(col.users).doc(uid).collection("ledger").doc(`daily_${date}_${v.quest.id}`), {
      type: "daily-quest", questId: v.quest.id, date, delta: stars, balanceAfter: balance + stars, createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(stateRef, { claimed: newClaimed, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return {
      starsAwarded: stars, starBalance: balance + stars, monthlyStars, totalStars: total + stars,
      quests: dailyQuestStates(progress, newClaimed),
    };
  });
});
