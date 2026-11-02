// Student classroom data: getMyClassroom when the page opens / comes back to the front, at most every 2 minutes, cached
// per login in browser storage (offline shows the cache). Tests are marked by the server (submitTaskAnswers); a homework
// round is reported like the game's (submitMinigameResult, mode "mistakes"), so the server drops homework answered right
// and keeps stars and wrong-answer bookmarks in step with the game.
import type { Grade, MarkValue, MinigameResult } from "@p6/shared";
import { markQuestion } from "@p6/shared";
import { api, ApiError, getMyClassroom, submitTaskAnswers as apiSubmit } from "../services/api";
import { currentUser } from "../services/auth";
import { shouldRefetch } from "../logic/classroom";
import { availableGrades, getQuestion } from "../content";
import { MOCK_MODE } from "../roles/mock";
import { mockClassroom } from "./mock";
import { useClassroom } from "./store";

/** The grade whose questions the student area shows (the classroom is P6 today; tasks carry their own grade). */
export const STUDENT_GRADE: Grade = availableGrades[0] ?? "P6";

/** The login the cache belongs to. */
export const accountKey = (): string => (MOCK_MODE ? "mock" : currentUser()?.uid ?? "signed-out");

let inflight: Promise<boolean> | null = null;
/** true when the data is fresh; false when offline / failed (the cache stays). */
export function refreshClassroom(force = false): Promise<boolean> {
  const uid = accountKey();
  const cur = useClassroom.getState().byAccount[uid];
  if (!shouldRefetch(cur?.fetchedAt, Date.now(), force)) return Promise.resolve(true);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = MOCK_MODE ? mockClassroom(STUDENT_GRADE, MOCK_MODE) : await getMyClassroom();
      useClassroom.getState().setData(uid, { classes: data.classes ?? [], posts: data.posts ?? [], tasks: data.tasks ?? [], homework: data.homework ?? [] });
      return true;
    } catch {
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Send a finished in-app test; the server marks it (the mock marks here). `classIds`: the task's own class first
 * (getMyClassroom says it from the 7 Nov backend), else every class of the student, tried in turn ("No such task" in a
 * class the test isn't from moves on to the next one).
 */
export async function submitTest(grade: Grade, classIds: readonly string[], taskId: string, answers: { questionId: string; responses: string[] }[]): Promise<Record<string, MarkValue>> {
  let last: unknown = new ApiError("not-found", "No such task.");
  for (const classId of classIds) {
    try {
      return await submitTaskAnswers(grade, classId, taskId, answers);
    } catch (e) {
      last = e;
      if (!(e instanceof ApiError && (e.code === "not-found" || e.code === "permission-denied"))) throw e;
    }
  }
  throw last;
}

async function submitTaskAnswers(grade: Grade, classId: string, taskId: string, answers: { questionId: string; responses: string[] }[]): Promise<Record<string, MarkValue>> {
  if (MOCK_MODE) {
    const marks: Record<string, MarkValue> = {};
    for (const a of answers) {
      const q = getQuestion(grade, a.questionId);
      marks[a.questionId] = q && markQuestion(q, a.responses).correct ? "right" : "wrong";
    }
    return marks;
  }
  return (await apiSubmit({ classId, taskId, answers })).marks;
}

/** Report a homework round (best effort; the answers were already marked on screen). Idempotent per attemptId. */
export async function reportHomeworkRound(grade: Grade, answers: MinigameResult["answers"]): Promise<boolean> {
  if (MOCK_MODE || !answers.length) return true;
  const result: MinigameResult = { attemptId: crypto.randomUUID(), grade, mode: "mistakes", answers, finishedAt: Date.now() };
  for (let i = 0; i < 3; i++) {
    try { await api.submitMinigameResult(result); return true; } catch { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  return false;
}
