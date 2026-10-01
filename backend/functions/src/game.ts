import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  REFERRAL_STARS, STORE_ITEMS, type LevelResultResponse, type PurchaseItemRequest, type PurchaseItemResponse,
  type RedeemReferralRequest, type RedeemReferralResponse,
} from "./shared/index.js";
import { col, dailyBoard, db, entriesRef, FieldValue, monthlyBoard, requireUid, throwFail } from "./admin.js";
import { effectiveResultTime, sgtDate, sgtMonth } from "./logic/dates.js";
import {
  isContentVersionAccepted, normalizeFriendCode, pairId, validateLevelResult, validatePurchase, validateReferral,
} from "./logic/rules.js";

/** Idempotent per attemptId. Awards stars only for completed levels; bumps daily + monthly leaderboard entries. */
export const submitLevelResult = onCall(async (req): Promise<LevelResultResponse> => {
  const uid = requireUid(req);
  const v = validateLevelResult(req.data);
  if (!v.ok) throwFail(v);
  const { result, stars, questionsDone } = v;

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

  return db.runTransaction(async (tx) => {
    const [attempt, wallet, month] = await Promise.all([tx.get(attemptRef), tx.get(walletRef), tx.get(monthRef)]);
    const balance = (wallet.data()?.starBalance as number | undefined) ?? 0;
    const total = (wallet.data()?.totalStars as number | undefined) ?? 0;
    if (attempt.exists) {
      // Replay of an already-counted attempt: report the CURRENT balances, not the (stale) ones stored with the
      // attempt, so a client that applies the response never overwrites a newer balance (e.g. after a purchase).
      const prev = attempt.data()!.response as LevelResultResponse;
      return { starsAwarded: prev.starsAwarded, starBalance: balance, monthlyStars: (month.data()?.stars as number | undefined) ?? 0, duplicate: true };
    }
    const monthlyStars = ((month.data()?.stars as number | undefined) ?? 0) + stars;
    const response: LevelResultResponse = { starsAwarded: stars, starBalance: balance + stars, monthlyStars, duplicate: false };

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
