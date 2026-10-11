import type { Grade, GradeProgress, LevelNo, LevelProgress } from "@p6/shared";
// The progress merge is shared with the backend (syncProgress).
export { mergeGradeProgress } from "@p6/shared";

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

/**
 * Merge an attempt into progress (immutably): the questions answered right join the level's stars (`correctIds`, a
 * union over attempts); the level is complete once every one of `levelIds` has its star. Completion is sticky.
 */
export function applyLevelResult(
  p: GradeProgress,
  subtopicId: string,
  level: LevelNo,
  correctIds: readonly string[],
  levelIds: readonly string[],
  now: number,
): GradeProgress {
  const key = levelKey(subtopicId, level);
  const prev: LevelProgress | undefined = p.levels[key];
  const ids = levelIds.filter((id) => (prev?.correctIds ?? []).includes(id) || correctIds.includes(id));
  const completed = !!prev?.completed || (levelIds.length > 0 && ids.length === levelIds.length);
  const completedAt = prev?.completedAt ?? (completed ? now : undefined);
  const next: LevelProgress = {
    completed,
    bestCorrect: Math.max(prev?.bestCorrect ?? 0, ids.length),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(ids.length ? { correctIds: ids } : {}),
  };
  return { ...p, levels: { ...p.levels, [key]: next } };
}

/** Stars beside a level button (0..5): its questions answered right so far; a complete level shows them all. */
export function levelStarCount(p: GradeProgress | undefined, subtopicId: string, level: LevelNo, total = 5): number {
  const l = p?.levels[levelKey(subtopicId, level)];
  if (!l) return 0;
  return l.completed ? total : Math.min(total, l.correctIds?.length ?? 0);
}

export function unlockTopic(p: GradeProgress, topicId: string): GradeProgress {
  return p.unlockedTopics.includes(topicId) ? p : { ...p, unlockedTopics: [...p.unlockedTopics, topicId] };
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
