// Dev mock for the classroom (no backend yet). ?mock=1 / EXPO_PUBLIC_CLASSROOM_MOCK=1: a class with a feed, tests and
// homework; ?mock=empty: a student in no class. Uses real question ids from the bundle so tests and homework run.
import type { ClassPost, ClassTask, Grade } from "@p6/shared";
import { getAllLv1, getTopics } from "../content";
import { EMPTY_CLASSROOM, type MyClassroom } from "../logic/classroom";

export type MockMode = "full" | "empty";

export function mockClassroom(grade: Grade, mode: MockMode, now = Date.now()): MyClassroom {
  if (mode === "empty") return EMPTY_CLASSROOM;
  const topics = getTopics(grade);
  const pool = getAllLv1(grade).filter((q) => q.autoMarkable && !q.figure);
  const mcq = pool.filter((q) => q.type === "mcq");
  const open = pool.filter((q) => q.type === "open");
  const test = [...mcq.slice(0, 3), ...open.slice(0, 2)].map((q) => q.id);
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
  ];
  const tasks: ClassTask[] = [
    { id: "d1", kind: "diagnostic", title: "Quick check", grade, topicId: topics[0]?.id, questionIds: test, createdAt: now - 4 * h, inApp: true },
    { id: "w1", kind: "worksheet", title: "Worksheet", grade, subtopicId: sub?.id, level: 1, questionIds: (sub?.main[1] ?? []).slice(0, 5), createdAt: now - 30 * h, inApp: false },
  ];
  return { classes: [{ id: "c1", name: "6 Courage", teacherName: "Ms Tan" }], posts, tasks, homework };
}
