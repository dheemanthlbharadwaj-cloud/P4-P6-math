import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  REFERRAL_STARS, STORE_ITEMS, levelKey, starsForLevelCompletion, type ClaimQuestRequest, type ClaimQuestResponse,
  type LevelResultResponse, type MinigameResultResponse, type PurchaseItemRequest, type PurchaseItemResponse,
  type RedeemReferralRequest, type RedeemReferralResponse,
} from "./shared/index.js";
import { col, dailyBoard, db, entriesRef, FieldValue, monthlyBoard, requireUid, throwFail } from "./admin.js";
import { effectiveResultTime, sgtDate, sgtMonth } from "./logic/dates.js";
import {
  isContentVersionAccepted, minigameStars, normalizeFriendCode, pairId, validateClaimQuest, validateLevelResult,
  validateMinigameResult, validatePurchase, validateReferral,
} from "./logic/rules.js";

/** users/{uid}/attempted/{grade}_{questionId}: questions ever attempted (mini-game stars only for new ones). */
const attemptedRef = (uid: string, grade: string, questionId: string) =>
  db.collection(col.users).doc(uid).collection("attempted").doc(`${grade}_${questionId}`.replace(/\//g, "_"));

/**
 * Idempotent per attemptId. Stars (stars.ts): a level that never gave a star → +1 per question right on the first try;
 * a level that already did → +1 when completed. Bumps daily + monthly leaderboard entries and lifetime stars.
 */
export const submitLevelResult = onCall(async (req): Promise<LevelResultResponse> => {
  const uid = requireUid(req);
  const v = validateLevelResult(req.data);
  if (!v.ok) throwFail(v);
  const { result, firstTryCorrect, questionsDone, attemptedIds } = v;

  const cfg = await db.collection(col.config).doc("content").get();
  const accepted = (cfg.data()?.acceptedVersions as Record<string, string[]> | undefined)?.[result.grade];
  if (!isContentVersionAccepted(accepted, result.contentVersion)) {
    throw new HttpsError("failed-precondition", "Unknown content version. Update the app.");
  }

  const now = Date.now();
  const when = effectiveResultTime(result.finishedAt, now);
  const attemptRef = db.collection(col.users).doc(uid).collection("attempts").doc(result.attemptId);
  const walletRef = db.collection(col.wallets).doc(uid);
  const monthRef = entriesRef(monthlyBoard(sgtMonth(when))).doc(uid);
  const dayRef = entriesRef(dailyBoard(sgtDate(when))).doc(uid);
  const ledgerRef = db.collection(col.users).doc(uid).collection("ledger").doc(`level_${result.attemptId}`);
  const starredRef = db.collection(col.users).doc(uid).collection("starredLevels").doc(`${result.grade}_${levelKey(result.subtopicId, result.level)}`);

  return db.runTransaction(async (tx) => {
    const [attempt, wallet, month, starred] = await Promise.all([tx.get(attemptRef), tx.get(walletRef), tx.get(monthRef), tx.get(starredRef)]);
    const balance = (wallet.data()?.starBalance as number | undefined) ?? 0;
    const total = (wallet.data()?.totalStars as number | undefined) ?? 0;
    if (attempt.exists) {
      // Replay of an already-counted attempt: report the CURRENT balances, not the (stale) ones stored with the
      // attempt, so a client that applies the response never overwrites a newer balance (e.g. after a purchase).
      const prev = attempt.data()!.response as LevelResultResponse;
      return { starsAwarded: prev.starsAwarded, starBalance: balance, monthlyStars: (month.data()?.stars as number | undefined) ?? 0, duplicate: true };
    }
    const stars = starred.exists ? starsForLevelCompletion(result.completed, true) : firstTryCorrect;
    const monthlyStars = ((month.data()?.stars as number | undefined) ?? 0) + stars;
    const response: LevelResultResponse = { starsAwarded: stars, starBalance: balance + stars, monthlyStars, duplicate: false };
    if (stars > 0 && !starred.exists) tx.set(starredRef, { at: FieldValue.serverTimestamp() });
    for (const q of attemptedIds) tx.set(attemptedRef(uid, result.grade, q), { at: FieldValue.serverTimestamp() }, { merge: true });

    tx.set(attemptRef, {
      attemptId: result.attemptId, grade: result.grade, subtopicId: result.subtopicId, level: result.level,
      contentVersion: result.contentVersion, completed: result.completed, stars, questionsDone, response,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(walletRef, { starBalance: balance + stars, totalStars: total + stars, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const inc = { uid, stars: FieldValue.increment(stars), questionsDone: FieldValue.increment(questionsDone), updatedAt: FieldValue.serverTimestamp() };
    tx.set(monthRef, inc, { merge: true });
    tx.set(dayRef, inc, { merge: true });
    if (stars > 0) {
      tx.set(ledgerRef, {
        type: "level", delta: stars, balanceAfter: balance + stars, attemptId: result.attemptId,
        grade: result.grade, subtopicId: result.subtopicId, level: result.level, createdAt: FieldValue.serverTimestamp(),
      });
    }
    return response;
  });
});

/** One mini-game round: +1 star per question answered right that was never attempted before. Idempotent per attemptId. */
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

  return db.runTransaction(async (tx) => {
    const [round, wallet, month, ...seen] = await Promise.all([tx.get(roundRef), tx.get(walletRef), tx.get(monthRef), ...refs.map((r) => tx.get(r))]);
    const balance = (wallet.data()?.starBalance as number | undefined) ?? 0;
    const total = (wallet.data()?.totalStars as number | undefined) ?? 0;
    const monthNow = (month.data()?.stars as number | undefined) ?? 0;
    if (round.exists) return { starsAwarded: round.data()!.stars as number, starBalance: balance, monthlyStars: monthNow, totalStars: total, duplicate: true };
    const before = new Set(questionIds.filter((_, i) => seen[i].exists));
    const stars = minigameStars(result.answers, before);
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
    const walletRef = db.collection(col.wallets).doc(referrerUid!);
    const w = await tx.get(walletRef);
    const bal = (w.data()?.starBalance as number | undefined) ?? 0;
    tx.set(refRef, { referrerUid, referredUid: uid, stars: REFERRAL_STARS, createdAt: FieldValue.serverTimestamp() });
    tx.set(walletRef, { starBalance: bal + REFERRAL_STARS, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection(col.users).doc(referrerUid!).collection("ledger").doc(`referral_${uid}`), {
      type: "referral", delta: REFERRAL_STARS, balanceAfter: bal + REFERRAL_STARS, referredUid: uid, createdAt: FieldValue.serverTimestamp(),
    });
    // referral link also makes them friends
    tx.set(db.collection(col.friendships).doc(pairId(uid, referrerUid!)), { members: [uid, referrerUid!].sort(), createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return { starsAwarded: REFERRAL_STARS };
  });
});
