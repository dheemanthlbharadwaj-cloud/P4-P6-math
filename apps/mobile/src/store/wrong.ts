import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Grade } from "@p6/shared";
import { mergeWrong, type WrongDoc } from "../logic/wrongSync";
import { persistStorage, STORE_PREFIX } from "./storage";

interface WrongState {
  byGrade: Partial<Record<Grade, Record<string, number>>>; // currently flagged: questionId → flagged-at ms
  history: Partial<Record<Grade, string[]>>; // every question ever answered wrong ("Test all wrong ever")
  add: (grade: Grade, questionId: string) => void;
  remove: (grade: Grade, questionId: string) => void;
  ids: (grade: Grade) => string[];
  historyIds: (grade: Grade) => string[];
  /** Merge bookmarks read from the server (restore / other device). */
  mergeRemote: (grade: Grade, docs: WrongDoc[]) => void;
  reset: () => void;
}

export const useWrong = create<WrongState>()(
  persist(
    (set, get) => ({
      byGrade: {},
      history: {},
      add: (grade, qid) =>
        set({
          byGrade: { ...get().byGrade, [grade]: { ...get().byGrade[grade], [qid]: Date.now() } },
          history: { ...get().history, [grade]: [...new Set([...(get().history[grade] ?? []), qid])] },
        }),
      remove: (grade, qid) => {
        const cur = { ...get().byGrade[grade] };
        delete cur[qid];
        set({ byGrade: { ...get().byGrade, [grade]: cur } });
      },
      ids: (grade) => Object.keys(get().byGrade[grade] ?? {}),
      historyIds: (grade) => get().history[grade] ?? [],
      mergeRemote: (grade, docs) => set(mergeWrong({ byGrade: get().byGrade, history: get().history }, grade, docs)),
      reset: () => set({ byGrade: {}, history: {} }),
    }),
    { name: `${STORE_PREFIX}wrong`, storage: persistStorage },
  ),
);
