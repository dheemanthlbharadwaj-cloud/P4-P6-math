import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  REFERRAL_STARS, REFERRAL_WELCOME_STARS, STORE_ITEMS, activeLevelIds, levelAttemptStars, levelKey, type ClaimQuestRequest, type ClaimQuestResponse,
  type LevelResultResponse, type MinigameResultResponse, type PurchaseItemRequest, type PurchaseItemResponse,
  type RedeemReferralRequest, type RedeemReferralResponse,
} from "./shared/index.js";
import { col, dailyBoard, db, entriesRef, FieldValue, monthlyBoard, requireUid, throwFail } from "./admin.js";
import { effectiveResultTime, sgtDate, sgtMonth } from "./logic/dates.js";
import {
  isContentVersionAccepted, minigameStars, normalizeFriendCode, pairId, validateClaimQuest, validateLevelResult,
  validateMinigameResult, validatePurchase, validateReferral,
} from "./logic/rules.js";
import { isCorrect } from "./logic/marking.js";
import { CONTENT } from "./content/index.js";
import { patchView } from "./patches.js";
import { lb } from "./leaderboard.js";

/** config/content.acceptedVersions per instance: a version found in the cache is accepted without a read (1 read saved per
 *  submit). A version NOT in the cache always re-reads, so a freshly accepted bundle works at once; a version taken off the
 *  list is dropped within CONFIG_TTL_MS. */
const CONFIG_TTL_MS = 10 * 60_000;
let acceptedCache: { at: number; byGrade: Record<string, string[]> } | null = null;
async function contentVersionAccepted(grade: string, version: string): Promise<boolean> {
  const hit = acceptedCache && Date.now() - acceptedCache.at < CONFIG_TTL_MS ? acceptedCache.byGrade[grade] : undefined;
  if (hit && isContentVersionAccepted(hit, version)) return true;
  const cfg = await db.collection(col.config).doc("content").get();
  const byGrade = (cfg.data()?.acceptedVersions as Record<string, string[]> | undefined) ?? {};
  acceptedCache = { at: Date.now(), byGrade };
  return isContentVersionAccepted(byGrade[grade], version);
}

/** users/{uid}/attempted/{grade}_{questionId}: questions ever attempted (mini-game stars only for new ones). */
const attemptedRef = (uid: string, grade: string, questionId: string) =>
  db.collection(col.users).doc(uid).collection("attempted").doc(`${grade}_${questionId}`.replace(/\//g, "_"));

/** users/{uid}/levelStars/{grade}_{subtopicId}#{level}: the level's questions answered right so far (its stars) and
 *  whether the replay bonus was paid. */
const levelStarsRef = (uid: string, grade: string, key: string) =>
  db.collection(col.users).doc(uid).collection("levelStars").doc(`${grade}_${key}`);

/**
 * Idempotent per attemptId. The server marks every answer against its own key; stars follow stars.ts: +1 per question
 * of the level answered right for the first time, plus a one-off bonus for replaying a complete level with all right.
 * Bumps daily + monthly leaderboard entries and lifetime stars.
 */
export const submitLevelResult = onCall(async (req): Promise<LevelResultResponse> => {
  const uid = requireUid(req);
  const v = validateLevelResult(req.data);
  if (!v.ok) throwFail(v);
  const { result, answers } = v;

  if (!(await contentVersionAccepted(result.grade, result.contentVersion))) {
    throw new HttpsError("failed-precondition", "Unknown content version. Update the app.");
  }
  const content = CONTENT[result.grade];
  const key = levelKey(result.subtopicId, result.level);
  const bundleIds = content?.levels[key] ?? [];
  if (!bundleIds.length) throw new HttpsError("failed-precondition", "Unknown level. Update the app.");
  // Editor edits since the bundle was built: edited answers mark, retired questions are not part of the level any more.
  const edits = await patchView(result.grade);
  const levelIds = activeLevelIds(bundleIds, edits?.retired ?? []);
  // Only the level's own questions count; each is marked here, whatever the app thought.
  const inLevel = answers.filter((a) => levelIds.includes(a.questionId));
  const correctNow = inLevel.filter((a) => isCorrect(content, a.questionId, a.responses, edits?.answers)).map((a) => a.questionId);
  const questionsDone = inLevel.length;
  const attemptedIds = inLevel.map((a) => a.questionId);

  const now = Date.now();
  const when = effectiveResultTime(result.finishedAt, now);
  const attemptRef = db.collection(col.users).doc(uid).collection("attempts").doc(result.attemptId);
  const walletRef = db.collection(col.wallets).doc(uid);
  const monthRef = entriesRef(monthlyBoard(sgtMonth(when))).doc(uid);
  const dayRef = entriesRef(dailyBoard(sgtDate(when))).doc(uid);
  const ledgerRef = db.collection(col.users).doc(uid).collection("ledger").doc(`level_${result.attemptId}`);
  const starsRef = levelStarsRef(uid, result.grade, key);

  const res = await db.runTransaction(async (tx) => {
    const [attempt, wallet, month, levelDoc] = await Promise.all([tx.get(attemptRef), tx.get(walletRef), tx.get(monthRef), tx.get(starsRef)]);
    const balance = (wallet.data()?.starBalance as number | undefined) ?? 0;
    const total = (wallet.data()?.totalStars as number | undefined) ?? 0;
    const storedBefore = ((levelDoc.data()?.correct as string[] | undefined) ?? []).filter((id) => bundleIds.includes(id));
    const correctBefore = storedBefore.filter((id) => levelIds.includes(id));
    const retiredBefore = storedBefore.filter((id) => !levelIds.includes(id)); // keep their stars on record
    const bonusClaimed = levelDoc.data()?.bonus === true;
    if (attempt.exists) {
      // Replay of an already-counted attempt: report the CURRENT balances and level state, not the (stale) ones stored
      // with the attempt, so a client that applies the response never overwrites newer values.
      const prev = attempt.data()!.response as LevelResultResponse;
      return {
        starsAwarded: prev.starsAwarded, starBalance: balance, monthlyStars: (month.data()?.stars as number | undefined) ?? 0, duplicate: true,
        levelCorrectIds: correctBefore, levelComplete: levelIds.every((id) => correctBefore.includes(id)),
      };
    }
    const r = levelAttemptStars(levelIds, correctBefore, correctNow, bonusClaimed);
    const stars = r.stars;
    const monthlyStars = ((month.data()?.stars as number | undefined) ?? 0) + stars;
    const response: LevelResultResponse = {
      starsAwarded: stars, starBalance: balance + stars, monthlyStars, duplicate: false, levelCorrectIds: r.correctIds, levelComplete: r.complete,
    };
    if (r.newIds.length || r.bonus) tx.set(starsRef, { correct: [...r.correctIds, ...retiredBefore], bonus: bonusClaimed || r.bonus, updatedAt: FieldValue.serverTimestamp() });
    for (const q of attemptedIds) tx.set(attemptedRef(uid, result.grade, q), { at: FieldValue.serverTimestamp() }, { merge: true });

    tx.set(attemptRef, {
      attemptId: result.attemptId, grade: result.grade, subtopicId: result.subtopicId, level: result.level,
      contentVersion: result.contentVersion, completed: result.completed, stars, questionsDone, correct: correctNow, bonus: r.bonus, response,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(walletRef, { starBalance: balance + stars, totalStars: total + stars, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const inc = { uid, stars: FieldValue.increment(stars), questionsDone: FieldValue.increment(questionsDone), updatedAt: FieldValue.serverTimestamp() };
    tx.set(monthRef, inc, { merge: true });
    tx.set(dayRef, inc, { merge: true });
    if (stars > 0) {
      tx.set(ledgerRef, {
        type: "level", delta: stars, balanceAfter: balance + stars, attemptId: result.attemptId, bonus: r.bonus,
        grade: result.grade, subtopicId: result.subtopicId, level: result.level, createdAt: FieldValue.serverTimestamp(),
      });
    }
    return response;
  });
  lb.invalidateUser(uid); // the caller's cached monthly entry is stale now
  return res;
});

/** One mini-game round: +1 star per question answered right (marked here) that was never attempted before. Idempotent per attemptId. */
export const submitMinigameResult = onCall(async (req): Promise<MinigameResultResponse> => {
  const uid = requireUid(req);
  const v = validateMinigameResult(req.data);
  if (!v.ok) throwFail(v);
  const { result, questionIds } = v;
  const when = effectiveResultTime(result.finishedAt, Date.now());
  const roundRef = db.collection(col.users).doc(uid).collection("minigames").doc(result.attemptId);
  const walletRef = db.collection(col.wallets).doc(uid);
  const monthRef = entriesRef(monthlyBoard(sgtMonth(when))).doc(uid);
  const dayRef = entriesRef(dailyBoard(sgtDate(when))).doc(uid);
  const refs = questionIds.map((q) => attemptedRef(uid, result.grade, q));
  const edits = await patchView(result.grade); // the editor's edits since the bundle was built (marking uses edited answers)

  const res = await db.runTransaction(async (tx) => {
    const [round, wallet, month, ...seen] = await Promise.all([tx.get(roundRef), tx.get(walletRef), tx.get(monthRef), ...refs.map((r) => tx.get(r))]);
    const balance = (wallet.data()?.starBalance as number | undefined) ?? 0;
    const total = (wallet.data()?.totalStars as number | undefined) ?? 0;
    const monthNow = (month.data()?.stars as number | undefined) ?? 0;
    if (round.exists) return { starsAwarded: round.data()!.stars as number, starBalance: balance, monthlyStars: monthNow, totalStars: total, duplicate: true };
    const before = new Set(questionIds.filter((_, i) => seen[i].exists));
    const content = CONTENT[result.grade];
    const marked = result.answers.map((a) => ({ questionId: a.questionId, correct: isCorrect(content, a.questionId, a.responses, edits?.answers) }));
    const stars = minigameStars(marked, before);
    tx.set(roundRef, { mode: result.mode, grade: result.grade, stars, answers: result.answers.length, createdAt: FieldValue.serverTimestamp() });
    for (const r of refs) tx.set(r, { at: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(walletRef, { starBalance: balance + stars, totalStars: total + stars, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const inc = { uid, stars: FieldValue.increment(stars), questionsDone: FieldValue.increment(result.answers.length), updatedAt: FieldValue.serverTimestamp() };
    tx.set(monthRef, inc, { merge: true });
    tx.set(dayRef, inc, { merge: true });
    if (stars > 0) {
      tx.set(db.collection(col.users).doc(uid).collection("ledger").doc(`minigame_${result.attemptId}`), {
        type: "minigame", delta: stars, balanceAfter: balance + stars, mode: result.mode, createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { starsAwarded: stars, starBalance: balance + stars, monthlyStars: monthNow + stars, totalStars: total + stars, duplicate: false };
  });
  lb.invalidateUser(uid);
  return res;
});

/** Lifetime stars ≥ the quest's goal → its reward goes into the inventory (once). */
export const claimQuest = onCall(async (req): Promise<ClaimQuestResponse> => {
  const uid = requireUid(req);
  const questId = (req.data as Partial<ClaimQuestRequest> | undefined)?.questId;
  const walletRef = db.collection(col.wallets).doc(uid);
  return db.runTransaction(async (tx) => {
    const w = await tx.get(walletRef);
    const v = validateClaimQuest({
      questId,
      totalStars: (w.data()?.totalStars as number | undefined) ?? 0,
      claimed: (w.data()?.claimedQuests as string[] | undefined) ?? [],
      inventory: (w.data()?.inventory as string[] | undefined) ?? ["color-black"],
    });
    if (!v.ok) throwFail(v);
    tx.set(walletRef, { inventory: v.inventory, claimedQuests: v.claimed, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection(col.users).doc(uid).collection("ledger").doc(`quest_${String(questId)}`), {
      type: "quest", questId, itemId: v.rewardId, delta: 0, createdAt: FieldValue.serverTimestamp(),
    });
    return { ownedItems: v.inventory, claimedQuests: v.claimed };
  });
});

/** Atomic star deduction + inventory grant. Equipping is a normal profile update (rules check ownership). */
export const purchaseItem = onCall(async (req): Promise<PurchaseItemResponse> => {
  const uid = requireUid(req);
  const itemId = String((req.data as Partial<PurchaseItemRequest> | undefined)?.itemId ?? "");
  const item = STORE_ITEMS.find((i) => i.id === itemId);
  const walletRef = db.collection(col.wallets).doc(uid);
  return db.runTransaction(async (tx) => {
    const w = await tx.get(walletRef);
    const inventory = (w.data()?.inventory as string[] | undefined) ?? ["color-black"];
    const balance = (w.data()?.starBalance as number | undefined) ?? 0;
    const v = validatePurchase({ item, inventory, balance });
    if (!v.ok) throwFail(v);
    const newInventory = [...inventory, item!.id];
    tx.set(walletRef, { starBalance: v.newBalance, inventory: newInventory, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection(col.users).doc(uid).collection("ledger").doc(), {
      type: "purchase", itemId: item!.id, delta: -item!.price, balanceAfter: v.newBalance, createdAt: FieldValue.serverTimestamp(),
    });
    return { starBalance: v.newBalance, ownedItems: newInventory };
  });
});

/** The caller (referred user) enters a referrer's friend code: referrer gets +REFERRAL_STARS once per referred account. */
export const redeemReferral = onCall(async (req): Promise<RedeemReferralResponse> => {
  const uid = requireUid(req);
  const code = normalizeFriendCode((req.data as Partial<RedeemReferralRequest> | undefined)?.friendCode);
  const codeSnap = code ? await db.collection(col.friendCodes).doc(code).get() : null;
  const referrerUid = (codeSnap?.exists ? (codeSnap.data()!.uid as string) : null) ?? null;
  const refRef = db.collection(col.referrals).doc(uid);
  return db.runTransaction(async (tx) => {
    const redeemed = (await tx.get(refRef)).exists;
    const v = validateReferral({ callerUid: uid, referrerUid, alreadyRedeemed: redeemed });
    if (!v.ok) throwFail(v);
    const now = Date.now();
    const walletRef = db.collection(col.wallets).doc(referrerUid!);
    const myWalletRef = db.collection(col.wallets).doc(uid);
    const monthRef = entriesRef(monthlyBoard(sgtMonth(now))).doc(uid);
    const dayRef = entriesRef(dailyBoard(sgtDate(now))).doc(uid);
    const friendshipRef = db.collection(col.friendships).doc(pairId(uid, referrerUid!));
    const [w, mine, month, fs] = await Promise.all([tx.get(walletRef), tx.get(myWalletRef), tx.get(monthRef), tx.get(friendshipRef)]);
    const bal = (w.data()?.starBalance as number | undefined) ?? 0;
    const myBal = (mine.data()?.starBalance as number | undefined) ?? 0;
    const myTotal = (mine.data()?.totalStars as number | undefined) ?? 0;
    const monthlyStars = ((month.data()?.stars as number | undefined) ?? 0) + REFERRAL_WELCOME_STARS;
    tx.set(refRef, { referrerUid, referredUid: uid, stars: REFERRAL_STARS, welcomeStars: REFERRAL_WELCOME_STARS, createdAt: FieldValue.serverTimestamp() });
    tx.set(walletRef, { starBalance: bal + REFERRAL_STARS, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection(col.users).doc(referrerUid!).collection("ledger").doc(`referral_${uid}`), {
      type: "referral", delta: REFERRAL_STARS, balanceAfter: bal + REFERRAL_STARS, referredUid: uid, createdAt: FieldValue.serverTimestamp(),
    });
    // welcome stars for the caller
    tx.set(myWalletRef, { starBalance: myBal + REFERRAL_WELCOME_STARS, totalStars: myTotal + REFERRAL_WELCOME_STARS, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const inc = { uid, stars: FieldValue.increment(REFERRAL_WELCOME_STARS), updatedAt: FieldValue.serverTimestamp() };
    tx.set(monthRef, inc, { merge: true });
    tx.set(dayRef, inc, { merge: true });
    tx.set(db.collection(col.users).doc(uid).collection("ledger").doc("referral_welcome"), {
      type: "referral-welcome", delta: REFERRAL_WELCOME_STARS, balanceAfter: myBal + REFERRAL_WELCOME_STARS, referrerUid, createdAt: FieldValue.serverTimestamp(),
    });
    // referral link also makes them friends (keep an existing friendship's createdAt)
    if (!fs.exists) tx.set(friendshipRef, { members: [uid, referrerUid!].sort(), createdAt: FieldValue.serverTimestamp() });
    return {
      starsAwarded: REFERRAL_STARS, welcomeStars: REFERRAL_WELCOME_STARS,
      starBalance: myBal + REFERRAL_WELCOME_STARS, monthlyStars, totalStars: myTotal + REFERRAL_WELCOME_STARS,
    };
  });
});
