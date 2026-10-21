// The star bookkeeping of ONE level, shared by submitLevelResult (an in-app attempt) and teacherMarkTask (a paper mark),
// so a teacher's "right" pays exactly like the same answer in the app (stars.ts rules, once per question ever, one-off
// replay bonus). Pure.
import { levelAttemptStars, type LevelAttemptStars } from "../shared/index.js";

/** users/{uid}/levelStars/{grade}_{subtopicId}#{level}: the level's questions answered right so far and the bonus flag. */
export interface LevelStarsDoc { correct?: string[]; bonus?: boolean }

export interface LevelStarsUpdate {
  /** what stars.ts says for this attempt */
  r: LevelAttemptStars;
  /** the level's questions that had a star before this attempt (current questions only) */
  correctBefore: string[];
  /** the document to write, or null when nothing changed (no new star, no bonus) */
  write: { correct: string[]; bonus: boolean } | null;
}

/**
 * @param stored the stored levelStars document (undefined = none yet)
 * @param bundleIds the level's questions in the bundle
 * @param levelIds the level's current questions (bundle minus the ones the editor retired)
 * @param correctNow questions answered right now (ids outside the level are ignored)
 * @param noBonus the replay bonus is not payable in this call (a teacher correcting an earlier mark is not a replay)
 */
export function resolveLevelStars(stored: LevelStarsDoc | undefined, bundleIds: readonly string[], levelIds: readonly string[], correctNow: readonly string[], noBonus = false): LevelStarsUpdate {
  const storedBefore = (stored?.correct ?? []).filter((id) => bundleIds.includes(id));
  const correctBefore = storedBefore.filter((id) => levelIds.includes(id));
  const retiredBefore = storedBefore.filter((id) => !levelIds.includes(id)); // keep their stars on record
  const bonusClaimed = stored?.bonus === true;
  const r = levelAttemptStars(levelIds, correctBefore, correctNow, bonusClaimed || noBonus);
  const write = r.newIds.length || r.bonus ? { correct: [...r.correctIds, ...retiredBefore], bonus: bonusClaimed || r.bonus } : null;
  return { r, correctBefore, write };
}

/** The level had no complete set of stars before but has now. */
export const levelNewlyComplete = (levelIds: readonly string[], correctBefore: readonly string[], u: Pick<LevelStarsUpdate, "r">): boolean =>
  u.r.complete && !(levelIds.length > 0 && levelIds.every((id) => correctBefore.includes(id)));
