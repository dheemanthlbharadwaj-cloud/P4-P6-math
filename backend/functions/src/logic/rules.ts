// Validation for level results, purchases, referrals, friend requests. Pure.
import {
  LEVEL_PASS_MIN_CORRECT, ACTIVE_GRADES, QUESTS, QUEST_ITEMS, type LevelResult, type MinigameResult, type StoreItem,
} from "../shared/index.js";

export type Fail = { ok: false; code: "invalid-argument" | "failed-precondition" | "already-exists" | "not-found" | "permission-denied"; message: string };
export type Ok<T = object> = { ok: true } & T;
const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });

const SUBTOPIC_RE = /^p[4-6]-[a-z0-9-]{3,120}$/;
const ATTEMPT_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_ANSWERS_PER_ATTEMPT = 40;

/** `firstTryCorrect` = questions right on the first try in this attempt (first-time stars); the transaction decides
 *  the stars with starsForLevelAttempt rules once it knows whether the level gave a star before. */
export function validateLevelResult(r: unknown): Fail | Ok<{ result: LevelResult; firstTryCorrect: number; questionsDone: number; attemptedIds: string[] }> {
  const x = r as Partial<LevelResult> | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  if (typeof x.attemptId !== "string" || !ATTEMPT_RE.test(x.attemptId)) return fail("invalid-argument", "bad attemptId");
  if (!x.grade || !ACTIVE_GRADES.includes(x.grade)) return fail("invalid-argument", "bad grade");
  if (typeof x.contentVersion !== "string" || !x.contentVersion || x.contentVersion.length > 80) return fail("invalid-argument", "bad contentVersion");
  if (typeof x.subtopicId !== "string" || !SUBTOPIC_RE.test(x.subtopicId)) return fail("invalid-argument", "bad subtopicId");
  if (x.level !== 1 && x.level !== 2 && x.level !== 3) return fail("invalid-argument", "bad level");
  if (typeof x.completed !== "boolean") return fail("invalid-argument", "bad completed");
  if (typeof x.finishedAt !== "number") return fail("invalid-argument", "bad finishedAt");
  if (!Array.isArray(x.answers) || x.answers.length > MAX_ANSWERS_PER_ATTEMPT) return fail("invalid-argument", "bad answers");
  for (const a of x.answers) {
    if (!a || typeof a.questionId !== "string" || a.questionId.length > 120 || typeof a.correct !== "boolean" || typeof a.skipped !== "boolean" || typeof a.firstTryCorrect !== "boolean") {
      return fail("invalid-argument", "bad answer entry");
    }
  }
  const correctIds = new Set(x.answers.filter((a) => a.correct && !a.skipped).map((a) => a.questionId));
  if (x.completed && correctIds.size < LEVEL_PASS_MIN_CORRECT) return fail("failed-precondition", "completed but fewer correct answers than required");
  const questionsDone = x.answers.filter((a) => !a.skipped).length;
  const firstTryCorrect = new Set(x.answers.filter((a) => a.firstTryCorrect && !a.skipped).map((a) => a.questionId)).size;
  const attemptedIds = [...new Set(x.answers.filter((a) => !a.skipped || a.correct).map((a) => a.questionId))];
  return { ok: true, result: x as LevelResult, firstTryCorrect, questionsDone, attemptedIds };
}

export const MAX_MINIGAME_ANSWERS = 120;
const MINIGAME_MODES: MinigameResult["mode"][] = ["challenge", "mistakes", "all-wrong"];

export function validateMinigameResult(r: unknown): Fail | Ok<{ result: MinigameResult; questionIds: string[] }> {
  const x = r as Partial<MinigameResult> | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  if (typeof x.attemptId !== "string" || !ATTEMPT_RE.test(x.attemptId)) return fail("invalid-argument", "bad attemptId");
  if (!x.grade || !ACTIVE_GRADES.includes(x.grade)) return fail("invalid-argument", "bad grade");
  if (!x.mode || !MINIGAME_MODES.includes(x.mode)) return fail("invalid-argument", "bad mode");
  if (typeof x.finishedAt !== "number") return fail("invalid-argument", "bad finishedAt");
  if (!Array.isArray(x.answers) || x.answers.length > MAX_MINIGAME_ANSWERS) return fail("invalid-argument", "bad answers");
  for (const a of x.answers) {
    if (!a || typeof a.questionId !== "string" || a.questionId.length > 120 || typeof a.correct !== "boolean") return fail("invalid-argument", "bad answer entry");
  }
  return { ok: true, result: x as MinigameResult, questionIds: [...new Set(x.answers.map((a) => a.questionId))] };
}

/** Mini-game stars: +1 per question answered right whose FIRST appearance (ever) is this answer. */
export function minigameStars(answers: { questionId: string; correct: boolean }[], attemptedBefore: ReadonlySet<string>): number {
  const seen = new Set(attemptedBefore);
  let n = 0;
  for (const a of answers) {
    if (!seen.has(a.questionId) && a.correct) n++;
    seen.add(a.questionId);
  }
  return n;
}

export function validateClaimQuest(a: { questId: unknown; totalStars: number; claimed: string[]; inventory: string[] }): Fail | Ok<{ rewardId: string; claimed: string[]; inventory: string[] }> {
  const quest = QUESTS.find((q) => q.id === a.questId);
  if (!quest || !QUEST_ITEMS.some((i) => i.id === quest.rewardId)) return fail("not-found", "unknown quest");
  if (a.claimed.includes(quest.id)) return fail("already-exists", "quest already claimed");
  if (a.totalStars < quest.stars) return fail("failed-precondition", "not enough lifetime stars");
  return { ok: true, rewardId: quest.rewardId, claimed: [...a.claimed, quest.id], inventory: [...new Set([...a.inventory, quest.rewardId])] };
}

export function isContentVersionAccepted(accepted: string[] | undefined, version: string): boolean {
  return !accepted || accepted.length === 0 || accepted.includes(version);
}

export function validatePurchase(a: { item: StoreItem | undefined; inventory: string[]; balance: number }): Fail | Ok<{ newBalance: number }> {
  if (!a.item) return fail("not-found", "unknown item");
  if (a.inventory.includes(a.item.id)) return fail("already-exists", "already owned");
  if (a.balance < a.item.price) return fail("failed-precondition", "not enough stars");
  return { ok: true, newBalance: a.balance - a.item.price };
}

export function validateReferral(a: { callerUid: string; referrerUid: string | null; alreadyRedeemed: boolean }): Fail | Ok {
  if (a.alreadyRedeemed) return fail("already-exists", "referral already redeemed for this account");
  if (!a.referrerUid) return fail("not-found", "unknown friend code");
  if (a.referrerUid === a.callerUid) return fail("invalid-argument", "cannot refer yourself");
  return { ok: true };
}

export function validateFriendRequest(a: { fromUid: string; toUid: string | null; alreadyFriends: boolean; forwardPending: boolean; reversePending: boolean }): Fail | Ok<{ autoAccept: boolean }> {
  if (!a.toUid) return fail("not-found", "unknown friend code");
  if (a.toUid === a.fromUid) return fail("invalid-argument", "cannot add yourself");
  if (a.alreadyFriends) return fail("already-exists", "already friends");
  if (a.reversePending) return { ok: true, autoAccept: true }; // they already asked us → accept instead of duplicating
  if (a.forwardPending) return fail("already-exists", "request already sent");
  return { ok: true, autoAccept: false };
}

export const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

const FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function makeFriendCode(randomInt: (max: number) => number, length = 8): string {
  let s = "";
  for (let i = 0; i < length; i++) s += FRIEND_CODE_ALPHABET[randomInt(FRIEND_CODE_ALPHABET.length)];
  return s;
}
export const normalizeFriendCode = (c: unknown) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isFriendCode = (c: string) => c.length === 8 && [...c].every((ch) => FRIEND_CODE_ALPHABET.includes(ch));
