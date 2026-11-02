// Live question edits (getQuestionPatches) for this browser tab. Kept in memory only: the page asks again on the next
// visit (one call, answered from the backend's patch cache), so nothing big sits in browser storage.
import { create } from "zustand";
import type { GetQuestionPatchesResponse, Grade } from "@p6/shared";
import { mergePatches, type PatchesByGrade } from "../logic/patches";

interface PatchesState {
  grades: PatchesByGrade;
  apply: (grade: Grade, bundleVersion: string, res: GetQuestionPatchesResponse) => void;
}
export const useQuestionPatches = create<PatchesState>((set, get) => ({
  grades: {},
  apply: (grade, bundleVersion, res) => set({ grades: { ...get().grades, [grade]: mergePatches(get().grades[grade], bundleVersion, res) } }),
}));
