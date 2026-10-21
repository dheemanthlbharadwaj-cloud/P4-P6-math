// Classroom contract (teacher dashboard ↔ backend ↔ student app). Single source of truth, like api.ts.
// Owner spec (21 Oct 2026): teachers (logins created by the owner) manage classes on a web dashboard (/teacher);
// students are added to classes by the teacher; posts (teacher, automatic milestones and birthdays); printable A4
// worksheets per level and teacher-assigned diagnostic tests; the teacher marks paper work right/wrong and the marks
// count exactly like answers in the app (stars for right, wrong ones go to Unlimited Mistakes and come back as
// homework); analytics per student / class / topic / question (map questions only).
// All data lives in the STUDENT Firebase project. Reads are minimised: one doc per class feed page, one stats doc per
// student per grade, per-instance caches on the server.
import type { Grade, LevelNo } from "./types";

// ---------- Firestore layout (server-owned; clients never read these directly) ----------
//   teachers/{uid}                         TeacherDoc (created by backend/scripts/add-teacher.mjs)
//   classes/{classId}                      ClassDoc
//   classes/{classId}/posts/{postId}       ClassPost
//   classes/{classId}/tasks/{taskId}       ClassTask   (worksheet / diagnostic / homework)
//   classes/{classId}/tasks/{taskId}/marks/{studentUid}  TaskMarks
//   users/{uid}/qstats/{grade}             QuestionStatsDoc (one doc per student per grade; updated by
//                                           submitLevelResult, submitMinigameResult and teacher marks)
//   users/{uid}.birthday                   "MM-DD" (optional; set by the teacher in the roster)
//   users/{uid}.classIds                   string[] (denormalised for the student's getMyClassroom)

export interface TeacherDoc { uid: string; name: string; email: string; active: boolean; createdAt: number }

export interface ClassStudent { uid: string; displayName: string; birthday?: string /* "MM-DD" */ }
export interface ClassDoc {
  id: string;
  name: string; // e.g. "6 Courage"
  grade: Grade;
  teacherUid: string;
  students: ClassStudent[]; // denormalised roster (≤ 60), so one read gives the whole roster
  createdAt: number;
}

export type PostKind = "teacher" | "milestone" | "birthday";
export interface PostAttachment { name: string; url: string; kind: "pdf" | "image" | "link" }
export interface ClassPost {
  id: string;
  kind: PostKind;
  text: string;
  createdAt: number;
  authorUid: string; // teacher uid, or the student's uid for milestone/birthday
  studentUid?: string; // milestone / birthday: whose
  /** teacher posts: e.g. answer sheets for past worksheets, homework details */
  attachments?: PostAttachment[];
  taskId?: string; // a post about a task (e.g. "Answers for Worksheet: Fractions L1")
}

export type TaskKind = "worksheet" | "diagnostic";
export interface ClassTask {
  id: string;
  kind: TaskKind;
  title: string;
  grade: Grade;
  /** worksheet: the level it is based on (same 5 questions the level shows); diagnostic: undefined */
  subtopicId?: string;
  level?: LevelNo;
  /** diagnostic: the topic it covers */
  topicId?: string;
  questionIds: string[]; // in print/app order
  createdAt: number;
  dueAt?: number;
  /** diagnostic: students may take it in the app (Classroom → Tests); worksheets are paper (teacher marks) */
  inApp: boolean;
}
export type MarkValue = "right" | "wrong";
export interface TaskMarks {
  studentUid: string;
  marks: Record<string /* questionId */, MarkValue>;
  markedAt: number;
  source: "teacher" | "app"; // app = diagnostic taken in the app
}

/** Per student per grade: one doc. Map questions only. */
export interface QuestionStat {
  a: number; // attempts (each answer counts once, retries included)
  c: boolean; // completed: answered right at least once (has its star / marked right)
  w: number; // wrong answers
  t: number; // last attempt time (ms)
}
export interface QuestionStatsDoc { grade: Grade; stats: Record<string /* questionId */, QuestionStat>; updatedAt: number }

// ---------- Analytics shapes (computed on the server from QuestionStatsDoc + bundle content) ----------
export interface TopicProgress {
  topicId: string;
  title: string;
  total: number; // map questions in the topic
  completed: number;
  attempted: number;
  /** per question type ("mcq" | "open" …) */
  byType: Record<string, { total: number; completed: number }>;
}
export interface QuestionRow { questionId: string; subtopicId: string; level: LevelNo; attempts: number; completed: boolean; wrong: number }
export interface StudentAnalytics { uid: string; displayName: string; grade: Grade; topics: TopicProgress[]; questions: QuestionRow[] }
export interface ClassQuestionRow { questionId: string; subtopicId: string; level: LevelNo; studentsAttempted: number; studentsCompleted: number; totalAttempts: number; avgAttempts: number }
export interface ClassAnalytics {
  classId: string;
  topics: (TopicProgress & { students: number })[]; // class average (completed summed over students)
  /** the hardest questions: most attempts per completion / not completed, for a topic or level filter */
  questions: ClassQuestionRow[];
  students: { uid: string; displayName: string; completed: number; attempted: number }[];
}

// ---------- Callables (names added to CallableName in api.ts) ----------
// Teacher callables require teachers/{caller}.active; class callables require classes/{id}.teacherUid == caller.
//   teacherGetDashboard     {} → { teacher: TeacherDoc; classes: ClassDoc[] }
//   teacherSaveClass        { id?: string; name: string; grade: Grade } → { classId: string }
//   teacherDeleteClass      { classId } → { ok: true }
//   teacherAddStudent       { classId; friendCode: string } → { student: ClassStudent }   (not-found: unknown code)
//   teacherRemoveStudent    { classId; studentUid } → { ok: true }
//   teacherSetBirthday      { classId; studentUid; birthday: string | null } → { ok: true }
//   teacherPost             { classId; text: string; attachments?: PostAttachment[]; taskId?: string } → { post: ClassPost }
//   teacherDeletePost       { classId; postId } → { ok: true }
//   teacherUploadSignature  { classId; fileName: string } → { cloudName; apiKey; timestamp; signature; folder; publicId }
//                           (signed Cloudinary upload for answer sheets: folder p6maths/classroom/<classId>)
//   teacherCreateTask       { classId; kind: TaskKind; title?: string; subtopicId?; level?; topicId?; dueAt?; inApp? }
//                           → { task: ClassTask }  (worksheet: the level's 5 questions; diagnostic: 1 question per
//                           subtopic of the topic, mixed LV1–LV3, max 12, auto-markable only when inApp)
//   teacherListTasks        { classId } → { tasks: ClassTask[] }
//   teacherGetTaskMarks     { classId; taskId } → { marks: TaskMarks[] }
//   teacherMarkTask         { classId; taskId; studentUid; marks: Record<string, MarkValue> }
//                           → { starsAwarded: number }  — applies like answers in the app: right → the question's
//                           star (stars.ts rules, once ever), wrong → wrong bookmark (Unlimited Mistakes) + qstats;
//                           the level's next attempt shows only questions without a star. Idempotent per (task, student, question).
//   teacherGetAnalytics     { classId; studentUid?: string; topicId?: string } → { class: ClassAnalytics; student?: StudentAnalytics }
// Student callables:
//   getMyClassroom          {} → { classes: { id; name; teacherName }[]; posts: ClassPost[] (newest 30 across classes);
//                                  tasks: ClassTask[] (open, newest 20); homework: string[] /* questionIds marked wrong
//                                  by the teacher and not yet answered right */ }   ([] everything → "You're not in any class")
//   submitTaskAnswers       { classId; taskId; answers: { questionId: string; responses: string[] }[] }
//                           → { marks: Record<string, MarkValue> }  (in-app diagnostic: server marks)
// Automatic posts (server): milestone when a student completes a level ("Zach completed Fractions · Level 1"),
// and when a map's level group opens ("Zach levelled up to LV2 in Fractions!"); birthday posts from the 00:00 SGT
// nightly job for students whose birthday is today. Posted to every class the student is in.
export const CLASS_LIMITS = { maxStudents: 60, maxPostChars: 2000, feedPage: 30, maxDiagnostic: 12 } as const;
