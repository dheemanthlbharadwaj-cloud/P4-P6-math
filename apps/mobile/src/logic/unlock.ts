import type { Grade, GradeProgress, LevelNo, LevelProgress } from "@p6/shared";

export const levelKey = (subtopicId: string, level: LevelNo) => `${subtopicId}#${level}`;

export function emptyGradeProgress(grade: Grade, unlockedTopics: string[] = []): GradeProgress {
  return { grade, unlockedTopics, levels: {} };
}

export function isLevelComplete(p: GradeProgress | undefined, subtopicId: string, level: LevelNo): boolean {
  return !!p?.levels[levelKey(subtopicId, level)]?.completed;
}

/**
 * Level 1 is always open. On a map, Level N+1 of every subtopic opens only once Level N of ALL the map's subtopics is
 * completed (the map is one row of Level 1 buttons, then Level 2, then Level 3).
 */
export function isLevelUnlocked(p: GradeProgress | undefined, topicSubtopicIds: string[], level: LevelNo): boolean {
  if (level === 1) return true;
  return topicSubtopicIds.every((id) => isLevelComplete(p, id, (level - 1) as LevelNo));
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

/** Merge two copies of a grade's progress by max (used when syncing devices): union of topics, sticky completion. */
export function mergeGradeProgress(a: GradeProgress, b: GradeProgress | undefined): GradeProgress {
  if (!b) return a;
  const levels: Record<string, LevelProgress> = {};
  for (const key of new Set([...Object.keys(a.levels), ...Object.keys(b.levels ?? {})])) {
    const x = a.levels[key];
    const y = b.levels?.[key];
    const at = [x?.completedAt, y?.completedAt].filter((t): t is number => typeof t === "number");
    levels[key] = {
      completed: !!x?.completed || !!y?.completed,
      bestCorrect: Math.max(x?.bestCorrect ?? 0, y?.bestCorrect ?? 0),
      ...(at.length ? { completedAt: Math.min(...at) } : {}), // never `undefined`: Firestore rejects it
    };
  }
  return { grade: a.grade, unlockedTopics: [...new Set([...a.unlockedTopics, ...(b.unlockedTopics ?? [])])], levels };
}

/**
 * The next button up the map after (subtopicId, level), in map order (every Level 1, then every Level 2, then every
 * Level 3), skipping finished levels. Null when nothing is left or the next one is still locked.
 */
export function nextMapLevel(
  p: GradeProgress | undefined, topicSubtopicIds: string[], subtopicId: string, level: LevelNo,
): { subtopicId: string; level: LevelNo } | null {
  const order = ([1, 2, 3] as LevelNo[]).flatMap((l) => topicSubtopicIds.map((id) => ({ subtopicId: id, level: l })));
  const at = order.findIndex((n) => n.subtopicId === subtopicId && n.level === level);
  for (const n of order.slice(at + 1)) {
    if (isLevelComplete(p, n.subtopicId, n.level)) continue;
    return isLevelUnlocked(p, topicSubtopicIds, n.level) ? n : null;
  }
  return null;
}
