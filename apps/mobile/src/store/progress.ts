import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Grade, GradeProgress, LevelNo } from "@p6/shared";
import { applyLevelResult, emptyGradeProgress, mergeGradeProgress, unlockTopic } from "../logic/unlock";
import { rememberKeyQuestion } from "../logic/keyQuestion";
import { persistStorage, STORE_PREFIX } from "./storage";
import { getTopics } from "../content";

interface ProgressState {
  grades: Partial<Record<Grade, GradeProgress>>;
  /** The "Find the key" question chosen per grade and locked topic, kept until the key is earned. */
  keyQuestions: Partial<Record<Grade, Record<string, string>>>;
  /** Remember (id) or forget (undefined) the key question of a topic map. */
  setKeyQuestion: (grade: Grade, topicId: string, questionId: string | undefined) => void;
  /** Create the grade's progress on first use; `initialTopics` = topics marked learnt in onboarding (none → the first
   *  topic opens). */
  ensureGrade: (grade: Grade, initialTopics?: string[]) => void;
  unlockTopic: (grade: Grade, topicId: string) => void;
  /** Questions answered right in an attempt (or confirmed by the server) join the level's stars. */
  recordLevel: (grade: Grade, subtopicId: string, level: LevelNo, correctIds: readonly string[], levelIds: readonly string[]) => void;
  /** Merge a copy from the server (restore / other device) by max. */
  mergeRemote: (grade: Grade, remote: GradeProgress) => void;
  reset: () => void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      grades: {},
      keyQuestions: {},
      setKeyQuestion: (grade, topicId, questionId) => {
        const all = get().keyQuestions ?? {};
        const next = rememberKeyQuestion(all[grade], topicId, questionId);
        if (next !== all[grade]) set({ keyQuestions: { ...all, [grade]: next } });
      },
      ensureGrade: (grade, initialTopics = []) => {
        // No topic marked learnt: the first topic's map starts open, so there is always somewhere to play.
        const first = getTopics(grade)[0]?.id;
        const topics = initialTopics.length || !first ? initialTopics : [first];
        const g = get().grades[grade];
        if (g) {
          // merge any newly-marked-learnt topics (and open the first map if none is open yet)
          const missing = topics.filter((t) => !g.unlockedTopics.includes(t));
          if (!g.unlockedTopics.length && first && !missing.includes(first) && !g.unlockedTopics.includes(first)) missing.push(first);
          if (missing.length) set({ grades: { ...get().grades, [grade]: { ...g, unlockedTopics: [...g.unlockedTopics, ...missing] } } });
          return;
        }
        set({ grades: { ...get().grades, [grade]: emptyGradeProgress(grade, topics) } });
      },
      unlockTopic: (grade, topicId) => {
        const g = get().grades[grade] ?? emptyGradeProgress(grade);
        const all = get().keyQuestions ?? {};
        set({
          grades: { ...get().grades, [grade]: unlockTopic(g, topicId) },
          keyQuestions: { ...all, [grade]: rememberKeyQuestion(all[grade], topicId, undefined) }, // key earned: forget its question
        });
      },
      recordLevel: (grade, subtopicId, level, correctIds, levelIds) => {
        const g = get().grades[grade] ?? emptyGradeProgress(grade);
        set({ grades: { ...get().grades, [grade]: applyLevelResult(g, subtopicId, level, correctIds, levelIds, Date.now()) } });
      },
      mergeRemote: (grade, remote) => {
        const g = get().grades[grade] ?? emptyGradeProgress(grade);
        set({ grades: { ...get().grades, [grade]: mergeGradeProgress(g, remote) } });
      },
      reset: () => set({ grades: {}, keyQuestions: {} }),
    }),
    { name: `${STORE_PREFIX}progress`, storage: persistStorage },
  ),
);
