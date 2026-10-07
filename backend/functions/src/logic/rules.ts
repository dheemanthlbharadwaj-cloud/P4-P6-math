// Validation for level results, purchases, referrals, friend requests, question reports, profile/progress sync. Pure.
import {
  LEVEL_PASS_MIN_CORRECT, ACTIVE_GRADES, MAX_REPORT_NOTE, QUESTS, QUEST_ITEMS, REPORT_REASONS, type LevelResult, type MinigameResult,
  type ReportQuestionRequest, type ReportReason, type StoreItem, MAX_SYNC_WRONG, STORE_ITEMS, type GradeProgress,
  type LevelProgress, type UpdateProfileRequest, type UserProfile, type WrongBookmark,
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

const QUESTION_ID_RE = /^[A-Za-z0-9_. -]{3,120}$/; // question bank ids (some contain spaces); never "/"
const REPORT_CONTEXTS = ["level", "minigame", "practice"] as const;

/** Clean a reportQuestion request: known reason/context/grade, short trimmed text. */
export function validateReport(r: unknown): Fail | Ok<{ report: Required<Omit<ReportQuestionRequest, "note" | "answerGiven" | "contentVersion">> & { note: string; answerGiven: string | null; contentVersion: string | null } }> {
  const x = r as Partial<ReportQuestionRequest> | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  if (typeof x.questionId !== "string" || !QUESTION_ID_RE.test(x.questionId)) return fail("invalid-argument", "bad questionId");
  if (!x.grade || !ACTIVE_GRADES.includes(x.grade)) return fail("invalid-argument", "bad grade");
  if (!REPORT_REASONS.some((rr) => rr.id === x.reason)) return fail("invalid-argument", "bad reason");
  if (!REPORT_CONTEXTS.includes(x.context as (typeof REPORT_CONTEXTS)[number])) return fail("invalid-argument", "bad context");
  if (x.note !== undefined && typeof x.note !== "string") return fail("invalid-argument", "bad note");
  if (x.answerGiven !== undefined && x.answerGiven !== null && typeof x.answerGiven !== "string") return fail("invalid-argument", "bad answerGiven");
  const note = (x.note ?? "").trim().slice(0, MAX_REPORT_NOTE);
  if (x.reason === "other" && !note) return fail("invalid-argument", "tell us what is wrong");
  const answerGiven = typeof x.answerGiven === "string" && x.answerGiven.trim() ? x.answerGiven.trim().slice(0, 200) : null;
  const contentVersion = typeof x.contentVersion === "string" ? x.contentVersion.slice(0, 40) : null;
  return { ok: true, report: { questionId: x.questionId, grade: x.grade, reason: x.reason as ReportReason, context: x.context as ReportQuestionRequest["context"], note, answerGiven, contentVersion } };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isStr = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;

/** Items every account owns (price 0), plus the inventory. */
export function ownsItem(inventory: string[], id: string): boolean {
  return STORE_ITEMS.some((i) => i.id === id && i.price === 0) || inventory.includes(id);
}

/** updateProfile: same limits the client rules used to enforce. `cat` is null when the look can't be applied. */
export function validateProfileUpdate(r: unknown, inventory: string[]): Fail | Ok<{ fields: Pick<UserProfile, "fullName" | "school" | "topicsLearnt" | "psleDate">; cat: UserProfile["cat"] | null }> {
  const x = r as Partial<UpdateProfileRequest> | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  if (!isStr(x.fullName, 1, 60)) return fail("invalid-argument", "name must be 1-60 characters");
  if (x.school !== undefined && !isStr(x.school, 0, 80)) return fail("invalid-argument", "school too long");
  if (!Array.isArray(x.topicsLearnt) || x.topicsLearnt.length > 20 || !x.topicsLearnt.every((t) => isStr(t, 1, 60))) return fail("invalid-argument", "bad topicsLearnt");
  const psleDate = typeof x.psleDate === "string" ? x.psleDate : "";
  if (psleDate && !DATE_RE.test(psleDate)) return fail("invalid-argument", "psleDate must be yyyy-mm-dd");
  const c = x.cat as Partial<UserProfile["cat"]> | undefined;
  const catOk = !!c && isStr(c.name, 1, 20) && typeof c.colorId === "string" && ownsItem(inventory, c.colorId)
    && (c.hatId === null || c.hatId === undefined || (typeof c.hatId === "string" && ownsItem(inventory, c.hatId)));
  return {
    ok: true,
    fields: { fullName: x.fullName.trim(), school: (x.school ?? "").trim(), topicsLearnt: x.topicsLearnt.map((t) => t.trim()), psleDate },
    cat: catOk ? { name: c!.name!.trim(), colorId: c!.colorId!, hatId: c!.hatId ?? null } : null,
  };
}

/** syncProgress: shape-checked progress (levels ≤600, scores 0..5) and bookmarks (≤MAX_SYNC_WRONG, plain ids). */
export function validateSyncProgress(r: unknown): Fail | Ok<{ grade: GradeProgress["grade"]; progress: GradeProgress | null; wrong: WrongBookmark[]; pull: boolean }> {
  const x = r as { grade?: unknown; progress?: { unlockedTopics?: unknown; levels?: unknown }; wrong?: unknown; pull?: unknown } | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  if (!ACTIVE_GRADES.includes(x.grade as GradeProgress["grade"])) return fail("invalid-argument", "bad grade");
  const grade = x.grade as GradeProgress["grade"];
  let progress: GradeProgress | null = null;
  if (x.progress !== undefined && x.progress !== null) {
    const { unlockedTopics, levels } = x.progress;
    if (!Array.isArray(unlockedTopics) || unlockedTopics.length > 30 || !unlockedTopics.every((t) => isStr(t, 1, 120))) return fail("invalid-argument", "bad unlockedTopics");
    if (!levels || typeof levels !== "object" || Array.isArray(levels)) return fail("invalid-argument", "bad levels");
    const entries = Object.entries(levels as Record<string, unknown>);
    if (entries.length > 600) return fail("invalid-argument", "too many levels");
    const clean: Record<string, LevelProgress> = {};
    for (const [key, v] of entries) {
      const l = v as Partial<LevelProgress> | null;
      if (!/^[a-z0-9-]{3,140}#[1-3]$/.test(key) || !l || typeof l !== "object") return fail("invalid-argument", "bad level");
      const best = Number(l.bestCorrect ?? 0);
      clean[key] = {
        completed: l.completed === true,
        bestCorrect: Number.isFinite(best) ? Math.max(0, Math.min(5, Math.floor(best))) : 0,
        ...(typeof l.completedAt === "number" && Number.isFinite(l.completedAt) ? { completedAt: l.completedAt } : {}),
      };
    }
    progress = { grade, unlockedTopics: [...new Set(unlockedTopics as string[])], levels: clean };
  }
  const wrongIn = x.wrong === undefined ? [] : x.wrong;
  if (!Array.isArray(wrongIn) || wrongIn.length > MAX_SYNC_WRONG) return fail("invalid-argument", "bad wrong list");
  const wrong: WrongBookmark[] = [];
  for (const w of wrongIn as Partial<WrongBookmark>[]) {
    if (!w || typeof w.id !== "string" || !QUESTION_ID_RE.test(w.id) || typeof w.active !== "boolean") return fail("invalid-argument", "bad bookmark");
    wrong.push({ id: w.id, active: w.active, flaggedAt: typeof w.flaggedAt === "number" && Number.isFinite(w.flaggedAt) ? w.flaggedAt : 0 });
  }
  return { ok: true, grade, progress, wrong, pull: x.pull === true };
}
