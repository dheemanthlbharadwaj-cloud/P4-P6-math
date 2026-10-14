// How stars are earned (used by the app and the backend, so both always agree).
//
// Levels (the regular map format): a level has 5 questions and 5 stars, one per question.
//   - +1 the first time a question of the level is answered right. Each question gets one try per attempt: a wrong
//     answer costs a heart and moves on. The next attempt at the level shows only the questions still without a star.
//   - When all 5 have their star, the level button turns into a star (the level is complete).
//   - A complete level can be replayed (all 5 questions). The first replay with all 5 right pays one bonus star, once
//     per level. The bonus is not one of the 5 stars beside the button.
// Mini games:
//   - +1 for each question answered correctly that you have never attempted before (anywhere: levels or mini games).
//     Re-attempted questions give nothing, so Unlimited Mistakes (only questions you got wrong before) gives no stars.
// Practice (classroom self-marking) gives no stars.
import type { LevelNo } from "./types";

/** Key of a level within a grade. */
export const levelKey = (subtopicId: string, level: LevelNo) => `${subtopicId}#${level}`;

export interface LevelAttemptStars {
  /** Stars this attempt pays (new question stars + the bonus). */
  stars: number;
  /** Questions that got their star in this attempt. */
  newIds: string[];
  /** The level's questions with a star after this attempt, in level order. */
  correctIds: string[];
  /** Every question of the level has its star. */
  complete: boolean;
  /** This attempt paid the one-off replay bonus. */
  bonus: boolean;
}

/**
 * Stars for one level attempt.
 * @param levelIds the level's questions
 * @param correctBefore questions of the level that already had their star
 * @param correctNow questions answered right in this attempt (ids outside the level are ignored)
 * @param bonusClaimed the level's replay bonus was already paid
 */
export function levelAttemptStars(levelIds: readonly string[], correctBefore: readonly string[], correctNow: readonly string[], bonusClaimed: boolean): LevelAttemptStars {
  const level = new Set(levelIds);
  const before = new Set(correctBefore.filter((id) => level.has(id)));
  const now = new Set(correctNow.filter((id) => level.has(id)));
  const all = (set: Set<string>) => levelIds.length > 0 && levelIds.every((id) => set.has(id));
  const newIds = levelIds.filter((id) => now.has(id) && !before.has(id));
  const bonus = all(before) && !bonusClaimed && all(now);
  const correctIds = levelIds.filter((id) => before.has(id) || now.has(id));
  return { stars: newIds.length + (bonus ? 1 : 0), newIds, correctIds, complete: all(new Set(correctIds)), bonus };
}

/**
 * A level's questions without the ones the editor retired (excluded or deselected after the bundle was built; see
 * GetQuestionPatchesResponse). Retired questions are never shown and are not needed to complete the level; their star
 * slot shows as filled. If every question were retired the level keeps its original list (it is never empty).
 */
export function activeLevelIds(levelIds: readonly string[], retired: ReadonlySet<string> | readonly string[]): string[] {
  const r = retired instanceof Set ? retired : new Set(retired as readonly string[]);
  const left = levelIds.filter((id) => !r.has(id));
  return left.length ? left : [...levelIds];
}

/** The questions an attempt shows: the ones still without a star, or all of them once the level is complete. */
export function levelQuestionsToPlay(levelIds: readonly string[], correctBefore: readonly string[]): string[] {
  const done = new Set(correctBefore);
  const left = levelIds.filter((id) => !done.has(id));
  return left.length ? left : [...levelIds];
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
