// users/{uid}/qstats/{grade} (QuestionStatsDoc in classroom.ts): per student per grade, one document with a counter set per
// MAP question (a question of some level; mini-game pool questions are not tracked). It is updated with ONE merge write per
// call from submitLevelResult, submitMinigameResult and teacherMarkTask; this builds that write. Extra server-only fields:
//   homework: {[questionId]: true}  questions the teacher marked wrong and that have not been answered/marked right since
//   tasksDone: string[]  in-app task ids (diagnostics) the student has submitted
import type { QuestionStat } from "../shared/index.js";

/** The Firestore field operations the patch needs (injected so this stays pure and testable). */
export interface FieldOps<T = unknown> {
  increment(n: number): T;
  arrayUnion(...v: string[]): T;
  /** the "delete this field" sentinel (merge writes only) */
  del(): T;
  /** the attempt time to store as `t` (ms) */
  now: number;
}

/** One question's outcome in this call. `attempts` > 1 when a mini-game round showed it more than once. */
export interface QstatDelta {
  questionId: string;
  attempts: number; // answers given (0 for a teacher correction of an earlier mark)
  wrong: number; // wrong answers to add (negative: a teacher turned a wrong mark into right)
  correct: boolean; // answered / marked right at least once in this call -> completed
  /** teacher marks: put into / take out of the homework list */
  homework?: "add" | "remove";
}

/** Folds raw answers (in the order given) into one delta per map question. Non-map questions are dropped. */
export function deltasFromAnswers(answers: { questionId: string; correct: boolean }[], isMapQuestion: (id: string) => boolean): QstatDelta[] {
  const by = new Map<string, QstatDelta>();
  for (const a of answers) {
    if (!isMapQuestion(a.questionId)) continue;
    const d = by.get(a.questionId) ?? { questionId: a.questionId, attempts: 0, wrong: 0, correct: false };
    d.attempts += 1;
    if (a.correct) { d.correct = true; d.homework = "remove"; } else d.wrong += 1;
    by.set(a.questionId, d);
  }
  return [...by.values()];
}

/** The merge-set payload, or null when there is nothing to write. Never sets `c` back to false. */
export function buildQstatsPatch<T>(grade: string, deltas: readonly QstatDelta[], ops: FieldOps<T>, extra?: { tasksDone?: string }): Record<string, unknown> | null {
  if (!deltas.length && !extra?.tasksDone) return null;
  const stats: Record<string, Record<string, unknown>> = {};
  const homework: Record<string, unknown> = {};
  for (const d of deltas) {
    const s: Record<string, unknown> = { t: ops.now };
    if (d.attempts) s.a = ops.increment(d.attempts);
    if (d.wrong) s.w = ops.increment(d.wrong);
    if (d.correct) s.c = true;
    stats[d.questionId] = s;
    // answered right wins over wrong inside one call (a student who got it wrong and then right needs no homework)
    if (d.homework === "add" && !d.correct) homework[d.questionId] = true;
    else if (d.homework) homework[d.questionId] = ops.del();
  }
  const out: Record<string, unknown> = { grade, updatedAt: ops.now };
  if (deltas.length) out.stats = stats;
  if (Object.keys(homework).length) out.homework = homework;
  if (extra?.tasksDone) out.tasksDone = ops.arrayUnion(extra.tasksDone);
  return out;
}

/** The map questions of a content bundle (every level's questions), cached per content object. */
const mapCache = new WeakMap<object, Set<string>>();
export function mapQuestionSet(content: { levels: Record<string, string[]> } | undefined): Set<string> {
  if (!content) return new Set();
  let s = mapCache.get(content);
  if (!s) { s = new Set(Object.values(content.levels).flat()); mapCache.set(content, s); }
  return s;
}

/** Stats as stored (defaults for missing fields). */
export const statOf = (s: Partial<QuestionStat> | undefined): QuestionStat => ({ a: s?.a ?? 0, c: s?.c === true, w: s?.w ?? 0, t: s?.t ?? 0 });
