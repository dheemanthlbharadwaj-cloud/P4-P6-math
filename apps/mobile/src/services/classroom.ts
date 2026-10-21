// Student classroom data: fetch on focus (at most every 2 minutes), cached per account in useClassroom, so offline
// shows the last answer. A dev mock (EXPO_PUBLIC_CLASSROOM_MOCK=1, or ?mock=1 on web) stands in until the backend exists.
import type { Grade, MarkValue } from "@p6/shared";
import { markQuestion } from "@p6/shared";
import { getMyClassroom, submitTaskAnswers as apiSubmit } from "./api";
import { currentUser } from "./auth";
import { isFirebaseConfigured } from "./config";
import { pullAndMerge } from "./cloudSync";
import { shouldRefetch } from "../logic/classroom";
import { getQuestion } from "../content";
import { mockClassroom } from "./classroomMock";
import { MOCK } from "./classroomFlag";
import { useClassroom } from "../store/classroom";
import { useWrong } from "../store/wrong";
import { useProfile } from "../store/profile";

/** The account the cache belongs to. */
export function accountKey(): string {
  return (isFirebaseConfigured ? currentUser()?.uid : null) ?? useProfile.getState().uid ?? "guest";
}

let inflight: Promise<boolean> | null = null;

/** Refresh the classroom. Returns true when the data is fresh (or still fresh), false when offline/failed (the cache stays). */
export async function refreshClassroom(force = false): Promise<boolean> {
  const uid = accountKey();
  const grade = useProfile.getState().grade;
  const cur = useClassroom.getState().byAccount[uid];
  if (!shouldRefetch(cur?.fetchedAt, Date.now(), force)) return true;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = MOCK ? mockClassroom(grade, MOCK) : await getMyClassroom();
      useClassroom.getState().setData(uid, {
        classes: data.classes ?? [], posts: data.posts ?? [], tasks: data.tasks ?? [], homework: data.homework ?? [],
      });
      // Homework = questions the teacher marked wrong. mergeWrong only takes server bookmarks for ids this device does not
      // know, so flag each one here (once) so it also shows in Unlimited Mistakes.
      if (!MOCK) {
        const w = useWrong.getState();
        for (const id of data.homework ?? []) if (getQuestion(grade, id) && !w.byGrade[grade]?.[id]) w.add(grade, id);
      }
      // Teacher marks arrive through the normal progress sync (stars, wrong bookmarks): pull them in now too.
      if (!MOCK && (data.classes?.length || data.tasks?.length || data.homework?.length)) void pullAndMerge(grade);
      return true;
    } catch (e) {
      if (MOCK) console.warn("classroom mock failed", e);
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Send a finished in-app test; the server marks it. The mock marks locally. */
export async function submitTaskAnswers(grade: Grade, classId: string, taskId: string, answers: { questionId: string; responses: string[] }[]): Promise<Record<string, MarkValue>> {
  if (MOCK) {
    const marks: Record<string, MarkValue> = {};
    for (const a of answers) {
      const q = getQuestion(grade, a.questionId);
      marks[a.questionId] = q && markQuestion(q, a.responses).correct ? "right" : "wrong";
    }
    return marks;
  }
  const res = await apiSubmit({ classId, taskId, answers });
  void pullAndMerge(grade); // the server turned the wrong answers into Unlimited Mistakes bookmarks
  return res.marks;
}
