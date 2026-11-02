// Student demo data for ?mock=1 (?mock=empty = a student in no class): a class with a feed, an in-app test, a worksheet
// and homework, made from real question ids of the bundle so the test and homework run.
import type { ClassPost, ClassTask, Grade, Question } from "@p6/shared";
import { getAllLv1, getQuestion, getTopics } from "../content";
import { EMPTY_CLASSROOM, type MyClassroom } from "../logic/classroom";

export function mockClassroom(grade: Grade, mode: "full" | "empty", now = Date.now()): MyClassroom {
  if (mode === "empty") return EMPTY_CLASSROOM;
  const topics = getTopics(grade);
  const pool = getAllLv1(grade); // LV1 = all MCQ
  const mcq = pool.filter((q) => q.type === "mcq");
  const open = topics.flatMap((t) => t.subtopics.flatMap((s) => s.main[2])).map((id) => getQuestion(grade, id))
    .filter((q): q is Question => !!q && q.type === "open" && q.autoMarkable);
  const test = [...mcq.filter((q) => !q.figure).slice(0, 2), ...open.filter((q) => !q.figure).slice(0, 1), ...mcq.filter((q) => q.figure).slice(0, 1), ...open.filter((q) => q.figure).slice(0, 1)].map((q) => q.id);
  const homework = [...mcq.slice(10, 12), ...open.slice(10, 12)].map((q) => q.id);
  const sub = topics[0]?.subtopics[0];
  const h = 3_600_000;
  const posts: ClassPost[] = [
    { id: "p1", kind: "birthday", text: "Happy birthday, Aisha! 🎉", createdAt: now - 1 * h, authorUid: "s1", studentUid: "s1" },
    { id: "p2", kind: "teacher", text: "Well done everyone on the Fractions worksheet. The answer sheet is below. Please check your own work and try the ones you got wrong again.", createdAt: now - 5 * h, authorUid: "t1",
      attachments: [{ name: "Fractions L1 answers.pdf", url: "https://example.com/answers.pdf", kind: "pdf" }, { name: "Working example", url: "https://example.com/example.png", kind: "image" }] },
    { id: "p3", kind: "milestone", text: "Zach levelled up to LV2 in Fractions!", createdAt: now - 26 * h, authorUid: "s2", studentUid: "s2" },
    { id: "p4", kind: "milestone", text: "Mei completed Fractions · Level 1", createdAt: now - 50 * h, authorUid: "s3", studentUid: "s3" },
    { id: "p5", kind: "teacher", text: "Bring your calculators on Friday.", createdAt: now - 9 * 24 * h, authorUid: "t1" },
    { id: "p6", kind: "teacher", text: "Welcome to 6 Courage!", createdAt: now - 12 * 24 * h, authorUid: "t1" },
  ];
  const tasks: ClassTask[] = [
    { id: "d1", kind: "diagnostic", title: "Quick check", grade, topicId: topics[0]?.id, questionIds: test, createdAt: now - 4 * h, inApp: true, dueAt: now + 72 * h },
    { id: "w1", kind: "worksheet", title: "Worksheet", grade, subtopicId: sub?.id, level: 1, questionIds: (sub?.main[1] ?? []).slice(0, 5), createdAt: now - 30 * h, inApp: false },
  ];
  return { classes: [{ id: "c1", name: "6 Courage", teacherName: "Ms Tan" }], posts, tasks, homework };
}
