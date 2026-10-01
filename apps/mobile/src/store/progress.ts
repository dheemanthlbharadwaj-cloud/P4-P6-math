import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Grade, GradeProgress, LevelNo } from "@p6/shared";
import { applyLevelResult, emptyGradeProgress, unlockTopic } from "../logic/unlock";
import { persistStorage, STORE_PREFIX } from "./storage";

interface ProgressState {
  grades: Partial<Record<Grade, GradeProgress>>;
  /** Create the grade's progress on first use; `initialTopics` = topics marked learnt in onboarding. */
  ensureGrade: (grade: Grade, initialTopics?: string[]) => void;
  unlockTopic: (grade: Grade, topicId: string) => void;
  recordLevel: (grade: Grade, subtopicId: string, level: LevelNo, correct: number, completed: boolean) => void;
  reset: () => void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      grades: {},
      ensureGrade: (grade, initialTopics = []) => {
        const g = get().grades[grade];
        if (g) {
          // merge any newly-marked-learnt topics
          const missing = initialTopics.filter((t) => !g.unlockedTopics.includes(t));
          if (missing.length) set({ grades: { ...get().grades, [grade]: { ...g, unlockedTopics: [...g.unlockedTopics, ...missing] } } });
          return;
        }
        set({ grades: { ...get().grades, [grade]: emptyGradeProgress(grade, initialTopics) } });
      },
      unlockTopic: (grade, topicId) => {
        const g = get().grades[grade] ?? emptyGradeProgress(grade);
        set({ grades: { ...get().grades, [grade]: unlockTopic(g, topicId) } });
      },
      recordLevel: (grade, subtopicId, level, correct, completed) => {
        const g = get().grades[grade] ?? emptyGradeProgress(grade);
        set({ grades: { ...get().grades, [grade]: applyLevelResult(g, subtopicId, level, correct, completed, Date.now()) } });
      },
      reset: () => set({ grades: {} }),
    }),
    { name: `${STORE_PREFIX}progress`, storage: persistStorage },
  ),
);
