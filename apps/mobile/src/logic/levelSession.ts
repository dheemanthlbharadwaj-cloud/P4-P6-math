// Pure state machine for one level attempt. The attempt shows the level's questions that don't have their star yet
// (all 5 once the level is complete, see levelQuestionsToPlay in @p6/shared). Each question is answered once: right
// or wrong, it leaves the queue (a wrong answer costs a heart and the question waits for the next attempt). Skip is
// free and sends the question to the end of this attempt's queue.
import type { LevelAnswer } from "@p6/shared";

export interface SessionState {
  queue: string[]; // remaining question ids; head = current
  /** Answers given in this attempt, in order: what was entered and whether it was right. */
  answers: Record<string, { responses: string[]; correct: boolean }>;
  skipped: Record<string, boolean>;
  total: number; // questions in this attempt
}

export function startSession(ids: string[]): SessionState {
  return { queue: [...ids], answers: {}, skipped: {}, total: ids.length };
}

export const currentId = (s: SessionState): string | undefined => s.queue[0];
export const isDone = (s: SessionState) => s.queue.length === 0;
export const answeredCount = (s: SessionState) => Object.keys(s.answers).length;
export const correctIds = (s: SessionState) => Object.keys(s.answers).filter((id) => s.answers[id].correct);
/** Progress 0..1 = questions of this attempt answered (right or wrong). */
export const progressFraction = (s: SessionState) => (s.total === 0 ? 1 : answeredCount(s) / s.total);

/** Record the answer to the current question without leaving it. Called the moment the answer is given, so a student
 *  who closes the level before pressing Continue still has it in the result (its star was already credited). */
export function recordAnswer(s: SessionState, responses: string[], isCorrect: boolean): SessionState {
  const id = s.queue[0];
  if (id === undefined || id in s.answers) return s;
  return { ...s, answers: { ...s.answers, [id]: { responses, correct: isCorrect } } };
}

/** Move on from the current (answered) question: it leaves the queue whether it was right or wrong. */
export function advance(s: SessionState): SessionState {
  return s.queue.length ? { ...s, queue: s.queue.slice(1) } : s;
}

export function skip(s: SessionState): SessionState {
  const id = s.queue[0];
  if (id === undefined || s.queue.length === 1) return s; // nothing to skip to
  return { ...s, queue: [...s.queue.slice(1), id], skipped: { ...s.skipped, [id]: true } };
}

/** The answers to send (the server marks the responses itself); questions not answered are left out. */
export function toAnswers(s: SessionState): LevelAnswer[] {
  return Object.entries(s.answers).map(([questionId, a]) => ({ questionId, responses: a.responses }));
}
