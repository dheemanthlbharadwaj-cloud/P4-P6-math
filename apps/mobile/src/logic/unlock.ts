import type { Grade, GradeProgress, LevelNo, LevelProgress } from "@p6/shared";

export const levelKey = (subtopicId: string, level: LevelNo) => `${subtopicId}#${level}`;

export function emptyGradeProgress(grade: Grade, unlockedTopics: string[] = []): GradeProgress {
  return { grade, unlockedTopics, levels: {} };
}

export function isLevelComplete(p: GradeProgress | undefined, subtopicId: string, level: LevelNo): boolean {
  return !!p?.levels[levelKey(subtopicId, level)]?.completed;
}

/** Level 1 is always open; level N+1 opens when level N is completed (gold). */
export function isLevelUnlocked(p: GradeProgress | undefined, subtopicId: string, level: LevelNo): boolean {
  if (level === 1) return true;
  return isLevelComplete(p, subtopicId, (level - 1) as LevelNo);
}

export function isTopicUnlocked(p: GradeProgress | undefined, topicId: string): boolean {
  return !!p?.unlockedTopics.includes(topicId);
}

export function nextLevel(level: LevelNo): LevelNo | null {
  return level === 3 ? null : ((level + 1) as LevelNo);
}

/** Merge a finished attempt into progress (immutably). Completion is sticky; bestCorrect is a max. */
export function applyLevelResult(
  p: GradeProgress,
  subtopicId: string,
  level: LevelNo,
  correct: number,
  completed: boolean,
  now: number,
): GradeProgress {
  const key = levelKey(subtopicId, level);
  const prev: LevelProgress | undefined = p.levels[key];
  const next: LevelProgress = {
    completed: !!prev?.completed || completed,
    bestCorrect: Math.max(prev?.bestCorrect ?? 0, correct),
    completedAt: prev?.completedAt ?? (completed ? now : undefined),
  };
  return { ...p, levels: { ...p.levels, [key]: next } };
}

export function unlockTopic(p: GradeProgress, topicId: string): GradeProgress {
  return p.unlockedTopics.includes(topicId) ? p : { ...p, unlockedTopics: [...p.unlockedTopics, topicId] };
}
