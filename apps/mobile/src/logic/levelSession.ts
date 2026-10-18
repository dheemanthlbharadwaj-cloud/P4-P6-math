// Pure state machine for one level attempt. The attempt shows the level's questions that don't have their star yet
// (all 5 once the level is complete, see levelQuestionsToPlay in @p6/shared). A typed question gets one try: right or
// wrong, it leaves the queue (a wrong answer costs a heart and the question waits for the next attempt). An MCQ may
// be retried (owner decision 18 Oct 2026): every wrong pick costs a heart (the screen spends it), the question stays
// until the student picks the right option or moves on; a right pick on a retry earns the star like a first try.
// `answers` keeps ONE entry per question, the latest pick, so the result sent to the server (one response per
// question, stars.ts) holds the right option after a retry. Skip is free and sends the question to the end.
import type { LevelAnswer } from "@p6/shared";

export interface SessionState {
  queue: string[]; // remaining question ids; head = current
  /** Answers given in this attempt, in order: what was entered and whether it was right. */
  answers: Record<string, { responses: string[]; correct: boolean }>;
  /** MCQ options already tried wrong per question (stay marked red, can't be picked again). */
  wrongPicks: Record<string, string[]>;
  skipped: Record<string, boolean>;
  total: number; // questions in this attempt
}

export function startSession(ids: string[]): SessionState {
  return { queue: [...ids], answers: {}, wrongPicks: {}, skipped: {}, total: ids.length };
}

export const currentId = (s: SessionState): string | undefined => s.queue[0];
export const isDone = (s: SessionState) => s.queue.length === 0;
export const answeredCount = (s: SessionState) => Object.keys(s.answers).length;
export const correctIds = (s: SessionState) => Object.keys(s.answers).filter((id) => s.answers[id].correct);
/** Progress 0..1 = questions of this attempt answered (right or wrong). */
export const progressFraction = (s: SessionState) => (s.total === 0 ? 1 : answeredCount(s) / s.total);

/** Record the answer to the current question without leaving it. Called the moment the answer is given, so a student
 *  who closes the level before pressing Continue still has it in the result (its star was already credited).
 *  A right answer is final. A wrong one is replaced by the next try (MCQ retry); each wrong pick is remembered. */
export function recordAnswer(s: SessionState, responses: string[], isCorrect: boolean): SessionState {
  const id = s.queue[0];
  if (id === undefined || s.answers[id]?.correct) return s;
  const wrong = isCorrect || responses.length !== 1 ? s.wrongPicks[id] : [...(s.wrongPicks[id] ?? []), responses[0]];
  return { ...s, answers: { ...s.answers, [id]: { responses, correct: isCorrect } }, wrongPicks: wrong ? { ...s.wrongPicks, [id]: wrong } : s.wrongPicks };
}

/** MCQ options already tried wrong on the current question. */
export const triedWrong = (s: SessionState): string[] => (s.queue[0] === undefined ? [] : s.wrongPicks[s.queue[0]] ?? []);

/** After a wrong answer: may the student try this question again? Only MCQs (typed questions get one try). */
export const canRetry = (questionType: string, lastCorrect: boolean) => questionType === "mcq" && !lastCorrect;

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
