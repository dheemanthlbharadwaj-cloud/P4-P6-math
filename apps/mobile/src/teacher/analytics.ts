// Analytics computed from per-student question stats, the same shapes the server returns (classroom.ts). Used by the
// dev mock so the dashboard shows realistic numbers; the real numbers come from teacherGetAnalytics.
import type { ClassAnalytics, ClassQuestionRow, Grade, LevelNo, QuestionRow, QuestionStat, StudentAnalytics, TopicMap, TopicProgress } from "@p6/shared";

export type StatsByQuestion = Record<string, QuestionStat>;
export interface MapQuestion { id: string; subtopicId: string; level: LevelNo; topicId: string; type: string }

/** Every map question (levels 1-3 main path) of the curriculum, once. */
export function mapQuestions(topics: readonly TopicMap[], typeOf: (id: string) => string | undefined): MapQuestion[] {
  const seen = new Set<string>();
  const out: MapQuestion[] = [];
  for (const t of topics) for (const s of t.subtopics) for (const level of [1, 2, 3] as LevelNo[]) for (const id of s.main[level] ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, subtopicId: s.id, level, topicId: t.id, type: typeOf(id) ?? "open" });
  }
  return out;
}

export function topicProgress(topics: readonly TopicMap[], qs: readonly MapQuestion[], stats: StatsByQuestion): TopicProgress[] {
  return topics.map((t) => {
    const p: TopicProgress = { topicId: t.id, title: t.name, total: 0, completed: 0, attempted: 0, byType: {} };
    for (const q of qs) {
      if (q.topicId !== t.id) continue;
      const st = stats[q.id];
      const bt = (p.byType[q.type] ??= { total: 0, completed: 0 });
      p.total++; bt.total++;
      if (st && st.a > 0) p.attempted++;
      if (st?.c) { p.completed++; bt.completed++; }
    }
    return p;
  });
}

export function studentAnalytics(uid: string, displayName: string, grade: Grade, topics: readonly TopicMap[], qs: readonly MapQuestion[], stats: StatsByQuestion): StudentAnalytics {
  const questions: QuestionRow[] = [];
  for (const q of qs) {
    const st = stats[q.id];
    if (st && st.a > 0) questions.push({ questionId: q.id, subtopicId: q.subtopicId, level: q.level, attempts: st.a, completed: st.c, wrong: st.w });
  }
  return { uid, displayName, grade, topics: topicProgress(topics, qs, stats), questions };
}

export function classAnalytics(
  classId: string, students: readonly { uid: string; displayName: string }[], statsOf: (uid: string) => StatsByQuestion,
  topics: readonly TopicMap[], qs: readonly MapQuestion[], topicId?: string,
): ClassAnalytics {
  const inScope = topicId ? qs.filter((q) => q.topicId === topicId) : qs;
  const perTopic = topics.filter((t) => !topicId || t.id === topicId).map<TopicProgress & { students: number }>((t) => ({ topicId: t.id, title: t.name, total: 0, completed: 0, attempted: 0, byType: {}, students: students.length }));
  const byId = new Map(perTopic.map((p) => [p.topicId, p]));
  const rows = new Map<string, ClassQuestionRow>();
  const studentRows: ClassAnalytics["students"] = [];
  for (const q of inScope) {
    const p = byId.get(q.topicId);
    if (!p) continue;
    p.total++; (p.byType[q.type] ??= { total: 0, completed: 0 }).total++;
  }
  for (const s of students) {
    const stats = statsOf(s.uid);
    let completed = 0, attempted = 0;
    for (const q of inScope) {
      const st = stats[q.id];
      if (!st || st.a === 0) continue;
      attempted++;
      const p = byId.get(q.topicId)!;
      p.attempted++;
      const row = rows.get(q.id) ?? { questionId: q.id, subtopicId: q.subtopicId, level: q.level, studentsAttempted: 0, studentsCompleted: 0, totalAttempts: 0, avgAttempts: 0 };
      row.studentsAttempted++; row.totalAttempts += st.a;
      if (st.c) { completed++; p.completed++; p.byType[q.type].completed++; row.studentsCompleted++; }
      rows.set(q.id, row);
    }
    studentRows.push({ uid: s.uid, displayName: s.displayName, completed, attempted });
  }
  const questions = [...rows.values()].map((r) => ({ ...r, avgAttempts: r.studentsAttempted ? r.totalAttempts / r.studentsAttempted : 0 }));
  return { classId, topics: perTopic, questions, students: studentRows };
}
