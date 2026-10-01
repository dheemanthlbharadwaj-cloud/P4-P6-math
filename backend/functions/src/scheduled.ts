import { onSchedule } from "firebase-functions/v2/scheduler";
import { col, dailyBoard, db, entriesRef, FieldValue, monthlyBoard, REGION, SCHEDULE_TZ, snapshotEntriesRef } from "./admin.js";
import { previousMonthKey, sgtDate, sgtMonth, shiftDate } from "./logic/dates.js";
import { pickMedalWinners } from "./logic/ranking.js";

const opts = { region: REGION, timeZone: SCHEDULE_TZ, timeoutSeconds: 540, memory: "512MiB" as const };

/** 00:00 SGT daily: store every user's monthly stars so getLeaderboard can show rank arrows vs. "yesterday". */
export const dailySnapshot = onSchedule({ ...opts, schedule: "0 0 * * *" }, async () => {
  const now = Date.now();
  const date = sgtDate(now);
  const src = entriesRef(monthlyBoard(sgtMonth(now)));
  const dst = snapshotEntriesRef(date);
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let n = 0;
  for (;;) {
    let q = src.orderBy("__name__").limit(400);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    const batch = db.batch();
    for (const d of page.docs) batch.set(dst.doc(d.id), { uid: d.id, stars: d.data().stars ?? 0 });
    await batch.commit();
    n += page.size;
    last = page.docs[page.docs.length - 1];
  }
  await db.collection(col.snapshots).doc(date).set({ createdAt: FieldValue.serverTimestamp(), count: n });
  // keep a short history only
  await db.recursiveDelete(db.collection(col.snapshots).doc(shiftDate(date, -3)));
  console.log(`daily snapshot ${date}: ${n} users`);
});

/**
 * Midnight that ends the last day of the month = 00:00 SGT on the 1st. Closes the month that just ended:
 * top 3 (stars > 0) get a gold/silver/bronze medal shown on next month's leaderboards. Idempotent.
 * The new month needs no reset step: entries live under monthly-<yyyy-mm>, so a new month starts empty.
 */
export const monthlyClose = onSchedule({ ...opts, schedule: "0 0 1 * *" }, async () => {
  const closing = previousMonthKey(sgtMonth(Date.now()));
  const metaRef = db.collection(col.meta).doc(monthlyBoard(closing));
  if ((await metaRef.get()).exists) return;
  const top = await entriesRef(monthlyBoard(closing)).orderBy("stars", "desc").orderBy("questionsDone", "desc").limit(10).get();
  const winners = pickMedalWinners(top.docs.map((d) => ({ uid: d.id, stars: d.data().stars ?? 0, questionsDone: d.data().questionsDone ?? 0 })));
  const old = await db.collection(col.medals).get();
  const batch = db.batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  winners.forEach((w) => batch.set(db.collection(col.medals).doc(w.uid), { medal: w.medal, month: closing, stars: w.stars }));
  batch.set(metaRef, { closedAt: FieldValue.serverTimestamp(), winners });
  await batch.commit();
  console.log(`monthly close ${closing}:`, winners);
});

export { dailyBoard };
