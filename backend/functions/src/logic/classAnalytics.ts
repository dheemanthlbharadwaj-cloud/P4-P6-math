// Analytics from the per-student question stats + the bundle (map questions only). Pure. Shapes: classroom.ts.
import type {
  ClassAnalytics, ClassQuestionRow, Grade, LevelNo, QuestionRow, QuestionStat, StudentAnalytics, TopicProgress,
} from "../shared/index.js";
import { statOf } from "./qstats.js";

/** What the aggregation needs from the generated server content. */
export interface AnalyticsContent {
  levels: Record<string, string[]>;
  answers: Record<string, { t: string }>;
  topics: { id: string; name: string; subtopics: string[] }[];
}
export interface MapQuestion { questionId: string; subtopicId: string; level: LevelNo; topicId: string; type: string }
export interface MapIndex { questions: MapQuestion[]; byTopic: Map<string, MapQuestion[]>; topics: { id: string; name: string }[] }

const indexCache = new WeakMap<object, MapIndex>();
/** Every map question with its topic (by the topic's subtopics), level and type ("mcq" | "open"), in map order. Cached per content. */
export function mapIndex(content: AnalyticsContent): MapIndex {
  const hit = indexCache.get(content);
  if (hit) return hit;
  const questions: MapQuestion[] = [];
  const byTopic = new Map<string, MapQuestion[]>();
  const seen = new Set<string>();
  for (const t of content.topics) {
    const list: MapQuestion[] = [];
    for (const level of [1, 2, 3] as LevelNo[]) {
      for (const subtopicId of t.subtopics) {
        for (const questionId of content.levels[`${subtopicId}#${level}`] ?? []) {
          if (seen.has(questionId)) continue; // a question belongs to one map position
          seen.add(questionId);
          list.push({ questionId, subtopicId, level, topicId: t.id, type: content.answers[questionId]?.t ?? "other" });
        }
      }
    }
    byTopic.set(t.id, list);
    questions.push(...list);
  }
  const idx: MapIndex = { questions, byTopic, topics: content.topics.map((t) => ({ id: t.id, name: t.name })) };
  indexCache.set(content, idx);
  return idx;
}

type Stats = Record<string, Partial<QuestionStat>> | undefined;

function emptyTopic(id: string, title: string, qs: readonly MapQuestion[]): TopicProgress {
  const byType: TopicProgress["byType"] = {};
  for (const q of qs) (byType[q.type] ??= { total: 0, completed: 0 }).total++;
  return { topicId: id, title, total: qs.length, completed: 0, attempted: 0, byType };
}
/** Adds one student's stats to a topic's progress. */
function addStudent(p: TopicProgress, qs: readonly MapQuestion[], stats: Stats): void {
  for (const q of qs) {
    const s = statOf(stats?.[q.questionId]);
    if (s.a > 0 || s.c) p.attempted++;
    if (s.c) { p.completed++; p.byType[q.type].completed++; }
  }
}

/** One student: progress per topic (all topics, or the one asked for) and a row per attempted question. */
export function studentAnalytics(content: AnalyticsContent, uid: string, displayName: string, grade: Grade, stats: Stats, topicId?: string): StudentAnalytics {
  const idx = mapIndex(content);
  const topics: TopicProgress[] = [];
  const questions: QuestionRow[] = [];
  for (const t of idx.topics) {
    if (topicId && t.id !== topicId) continue;
    const qs = idx.byTopic.get(t.id) ?? [];
    const p = emptyTopic(t.id, t.name, qs);
    addStudent(p, qs, stats);
    topics.push(p);
    for (const q of qs) {
      const s = statOf(stats?.[q.questionId]);
      if (s.a > 0 || s.c || s.w > 0) questions.push({ questionId: q.questionId, subtopicId: q.subtopicId, level: q.level, attempts: s.a, completed: s.c, wrong: s.w });
    }
  }
  return { uid, displayName, grade, topics, questions };
}

export const MAX_CLASS_QUESTION_ROWS = 200;
/**
 * The class: per topic the progress summed over students (`total` stays per student, so the class average is
 * completed / (students x total)), the hardest questions, and one summary row per student.
 * Hardest = most students who tried it without getting it, then most attempts per student who tried it.
 */
export function classAnalytics(
  content: AnalyticsContent, classId: string, roster: readonly { uid: string; displayName: string }[], statsByUid: ReadonlyMap<string, Stats>, topicId?: string,
): ClassAnalytics {
  const idx = mapIndex(content);
  const topics: ClassAnalytics["topics"] = [];
  const rows: ClassQuestionRow[] = [];
  const students = roster.map((s) => ({ uid: s.uid, displayName: s.displayName, completed: 0, attempted: 0 }));
  for (const t of idx.topics) {
    const qs = idx.byTopic.get(t.id) ?? [];
    const p = { ...emptyTopic(t.id, t.name, qs), students: roster.length };
    roster.forEach((s, i) => {
      const before = { c: p.completed, a: p.attempted };
      addStudent(p, qs, statsByUid.get(s.uid));
      students[i].completed += p.completed - before.c;
      students[i].attempted += p.attempted - before.a;
    });
    if (!topicId || t.id === topicId) {
      topics.push(p);
      for (const q of qs) {
        let tried = 0, done = 0, attempts = 0;
        for (const s of roster) {
          const st = statOf(statsByUid.get(s.uid)?.[q.questionId]);
          if (st.a > 0 || st.c) tried++;
          if (st.c) done++;
          attempts += st.a;
        }
        if (tried) rows.push({ questionId: q.questionId, subtopicId: q.subtopicId, level: q.level, studentsAttempted: tried, studentsCompleted: done, totalAttempts: attempts, avgAttempts: Math.round((attempts / tried) * 100) / 100 });
      }
    }
  }
  rows.sort((a, b) => (b.studentsAttempted - b.studentsCompleted) - (a.studentsAttempted - a.studentsCompleted) || b.avgAttempts - a.avgAttempts || (a.questionId < b.questionId ? -1 : 1));
  // student totals above cover every topic; with a topic filter keep them to that topic
  if (topicId) {
    const qs = idx.byTopic.get(topicId) ?? [];
    students.forEach((st) => {
      const p = emptyTopic(topicId, "", qs);
      addStudent(p, qs, statsByUid.get(st.uid));
      st.completed = p.completed; st.attempted = p.attempted;
    });
  }
  return { classId, topics, questions: rows.slice(0, MAX_CLASS_QUESTION_ROWS), students };
}
