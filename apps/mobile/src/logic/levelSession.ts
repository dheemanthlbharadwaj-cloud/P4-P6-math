// Pure state machine for one level attempt (5 questions). See OPEN_QUESTIONS #3/#4:
// the level completes when every question has been answered correctly; wrong ones return to the end of the
// queue; Skip is free, sends the question to the end and is not bookmarked.
export interface SessionState {
  queue: string[]; // remaining question ids; head = current
  correct: Record<string, boolean>;
  everWrong: Record<string, boolean>;
  skipped: Record<string, boolean>;
  /** The first ANSWER to each question in this attempt (skips are not answers): right or wrong. Stars use it. */
  firstTry: Record<string, boolean>;
  total: number;
}

export function startSession(ids: string[]): SessionState {
  return { queue: [...ids], correct: {}, everWrong: {}, skipped: {}, firstTry: {}, total: ids.length };
}

export const currentId = (s: SessionState): string | undefined => s.queue[0];
export const isDone = (s: SessionState) => s.queue.length === 0;
export const correctCount = (s: SessionState) => Object.values(s.correct).filter(Boolean).length;
/** Progress 0..1 = questions finally answered right. */
export const progressFraction = (s: SessionState) => (s.total === 0 ? 1 : correctCount(s) / s.total);

/** True when the current question has not been answered yet in this attempt (its next answer is the first try). */
export const isFirstTry = (s: SessionState, id: string) => !(id in s.firstTry);

/** Record the answer to the current question without leaving it. Called the moment the answer is given, so a student
 *  who closes the level before pressing Continue still has it in the result (its star was already credited). */
export function recordAnswer(s: SessionState, isCorrect: boolean): SessionState {
  const id = s.queue[0];
  if (id === undefined || id in s.firstTry) return s;
  return { ...s, firstTry: { ...s.firstTry, [id]: isCorrect }, everWrong: isCorrect ? s.everWrong : { ...s.everWrong, [id]: true } };
}

export function answer(s: SessionState, isCorrect: boolean): SessionState {
  const id = s.queue[0];
  if (id === undefined) return s;
  const t = recordAnswer(s, isCorrect);
  const rest = t.queue.slice(1);
  if (isCorrect) return { ...t, queue: rest, correct: { ...t.correct, [id]: true } };
  return { ...t, queue: [...rest, id], everWrong: { ...t.everWrong, [id]: true } };
}

export function skip(s: SessionState): SessionState {
  const id = s.queue[0];
  if (id === undefined || s.queue.length === 1) return s; // nothing to skip to
  return { ...s, queue: [...s.queue.slice(1), id], skipped: { ...s.skipped, [id]: true } };
}

/** `skipped` means "skipped and never answered": a skipped question that was later answered right counts as done. */
export function toAnswers(s: SessionState, allIds: string[]) {
  return allIds.map((questionId) => ({
    questionId,
    correct: !!s.correct[questionId],
    skipped: !!s.skipped[questionId] && !s.correct[questionId],
    firstTryCorrect: s.firstTry[questionId] === true,
  }));
}
