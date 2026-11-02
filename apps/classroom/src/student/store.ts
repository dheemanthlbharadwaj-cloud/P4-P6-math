// "My class" cache (browser storage key p6c.classroom), one entry per login so a shared computer never shows another
// child's class: the last getMyClassroom answer (offline shows it), when it was fetched, homework answered right since
// then, and the score of in-app tests taken here. Same shape as the game's store/classroom.ts.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EMPTY_CLASSROOM, type MyClassroom } from "../logic/classroom";
import { persistStorage, STORE_PREFIX } from "../store/storage";

export interface AccountClassroom {
  data: MyClassroom;
  fetchedAt: number;
  homeworkDone: string[];
  taken: Record<string, { right: number; total: number }>;
}
export const emptyAccount = (): AccountClassroom => ({ data: EMPTY_CLASSROOM, fetchedAt: 0, homeworkDone: [], taken: {} });

interface ClassroomState {
  byAccount: Record<string, AccountClassroom>;
  setData: (uid: string, data: MyClassroom, now?: number) => void;
  markHomeworkDone: (uid: string, questionId: string) => void;
  setTaken: (uid: string, taskId: string, score: { right: number; total: number }) => void;
}
const get1 = (s: ClassroomState, uid: string) => s.byAccount[uid] ?? emptyAccount();

export const useClassroom = create<ClassroomState>()(
  persist(
    (set) => ({
      byAccount: {},
      setData: (uid, data, now = Date.now()) =>
        set((s) => ({ byAccount: { ...s.byAccount, [uid]: { ...get1(s, uid), data, fetchedAt: now, homeworkDone: [] } } })),
      markHomeworkDone: (uid, qid) =>
        set((s) => {
          const a = get1(s, uid);
          return a.homeworkDone.includes(qid) ? s : { byAccount: { ...s.byAccount, [uid]: { ...a, homeworkDone: [...a.homeworkDone, qid] } } };
        }),
      setTaken: (uid, taskId, score) =>
        set((s) => {
          const a = get1(s, uid);
          return { byAccount: { ...s.byAccount, [uid]: { ...a, taken: { ...a.taken, [taskId]: score } } } };
        }),
    }),
    { name: `${STORE_PREFIX}classroom`, storage: persistStorage },
  ),
);
