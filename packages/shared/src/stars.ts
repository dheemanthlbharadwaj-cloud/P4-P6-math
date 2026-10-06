// How stars are earned (used by the app and the backend, so both always agree).
//
// Levels (the regular map format):
//   - A level that has never given you a star: +1 for every question you answer correctly on your FIRST try in that
//     attempt (a wrong answer first means no star for that question, even when you get it right later).
//   - A level that has already given you a star (a re-attempt): +1 for the whole level when you complete it.
// Mini games:
//   - +1 for each question answered correctly that you have never attempted before (anywhere: levels or mini games).
//     Re-attempted questions give nothing, so Unlimited Mistakes (only questions you got wrong before) gives no stars.
// Practice (classroom self-marking) gives no stars.
import type { LevelNo } from "./types";

/** Key for "has this level ever given a star". */
export const levelKey = (subtopicId: string, level: LevelNo) => `${subtopicId}#${level}`;

/**
 * Stars for one answer inside a level attempt.
 * @param firstTryInAttempt this is the first answer to this question in the current attempt
 * @param levelStarredBefore the level gave a star in an earlier attempt (re-attempt rules apply)
 */
export function starsForLevelAnswer(correct: boolean, firstTryInAttempt: boolean, levelStarredBefore: boolean): number {
  return !levelStarredBefore && correct && firstTryInAttempt ? 1 : 0;
}

/** Stars when a level attempt is completed (on top of per-answer stars). */
export function starsForLevelCompletion(completed: boolean, levelStarredBefore: boolean): number {
  return levelStarredBefore && completed ? 1 : 0;
}

/**
 * Total stars for a whole level attempt, from the answers in the order they were given.
 * `answers` lists every answer (a question answered wrong and later right appears twice).
 */
export function starsForLevelAttempt(answers: { questionId: string; correct: boolean }[], completed: boolean, levelStarredBefore: boolean): number {
  if (levelStarredBefore) return starsForLevelCompletion(completed, true);
  const seen = new Set<string>();
  let n = 0;
  for (const a of answers) {
    n += starsForLevelAnswer(a.correct, !seen.has(a.questionId), false);
    seen.add(a.questionId);
  }
  return n;
}

/** Stars for one mini-game answer. */
export function starsForMinigameAnswer(correct: boolean, attemptedBefore: boolean): number {
  return correct && !attemptedBefore ? 1 : 0;
}

// ---------- Quests ----------
// Lifetime stars unlock quest-only cat looks (not sold in the store).
export interface Quest {
  id: string;
  stars: number; // lifetime stars needed
  rewardId: string; // a QUEST_ITEMS id
}

export const QUESTS: Quest[] = [
  { id: "quest-25", stars: 25, rewardId: "color-rose" },
  { id: "quest-50", stars: 50, rewardId: "hat-cap-gold" },
  { id: "quest-75", stars: 75, rewardId: "color-ocean" },
  { id: "quest-100", stars: 100, rewardId: "hat-crown-royal" },
  { id: "quest-150", stars: 150, rewardId: "color-galaxy" },
  { id: "quest-200", stars: 200, rewardId: "hat-wizard-star" },
];

/** Quest rewards: kind + display name (price 0, never sold). */
export const QUEST_ITEMS: { id: string; kind: "hat" | "color"; name: string }[] = [
  { id: "color-rose", kind: "color", name: "Rose" },
  { id: "hat-cap-gold", kind: "hat", name: "Golden Cap" },
  { id: "color-ocean", kind: "color", name: "Ocean" },
  { id: "hat-crown-royal", kind: "hat", name: "Royal Crown" },
  { id: "color-galaxy", kind: "color", name: "Galaxy" },
  { id: "hat-wizard-star", kind: "hat", name: "Star Wizard" },
];

export type QuestState = "locked" | "ready" | "claimed";
export function questState(q: Quest, lifetimeStars: number, claimed: readonly string[]): QuestState {
  if (claimed.includes(q.id)) return "claimed";
  return lifetimeStars >= q.stars ? "ready" : "locked";
}
