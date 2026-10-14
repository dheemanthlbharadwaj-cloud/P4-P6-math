import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GetQuestionPatchesResponse, Grade } from "@p6/shared";
import { mergePatches, type PatchesByGrade } from "../logic/patches";
import { persistStorage, STORE_PREFIX } from "./storage";

// Live question edits from the editor, laid over the offline bundle (see src/content/index.ts). Not per-account: the
// patches are public question data for one bundle version, so sign-out / account deletion keep them (not in reset.ts)
// and the next student on the device doesn't download them again.
interface PatchesState {
  grades: PatchesByGrade;
  /** Merge a server answer for the running bundle; a stored copy of another bundle version is dropped first. */
  apply: (grade: Grade, bundleVersion: string, res: GetQuestionPatchesResponse) => void;
  /** Drop stored patches that belong to another bundle than the running one. */
  prune: (grade: Grade, bundleVersion: string) => void;
}

export const useQuestionPatches = create<PatchesState>()(
  persist(
    (set, get) => ({
      grades: {},
      apply: (grade, bundleVersion, res) =>
        set({ grades: { ...get().grades, [grade]: mergePatches(get().grades[grade], bundleVersion, res) } }),
      prune: (grade, bundleVersion) => {
        const g = get().grades[grade];
        if (g && g.bundleVersion !== bundleVersion) {
          const { [grade]: _drop, ...rest } = get().grades;
          set({ grades: rest });
        }
      },
    }),
    { name: `${STORE_PREFIX}questionPatches`, storage: persistStorage, partialize: (s) => ({ grades: s.grades }) as PatchesState },
  ),
);
