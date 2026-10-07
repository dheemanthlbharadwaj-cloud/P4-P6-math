// Map progress merge, shared by the app (device ↔ server) and the backend (syncProgress). Pure.
import type { GradeProgress, LevelProgress } from "./types";

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
