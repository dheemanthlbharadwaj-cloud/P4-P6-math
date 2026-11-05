// Catapult Classroom: lessons, students and parent reports (owner brief, 1–2 Nov 2026).
// Its OWN backend (owner decision 2 Nov 2026: separate limits, never combined with the game): backend-classroom/ on its
// own Netlify site, Firebase project catapultclassroom (site catapult-classroom.web.app) (its own Auth + Firestore). Teachers run lessons with several
// children; each child gets a report (a face per learning goal, a note, which parts were done). Parents sign in with ONE
// code per family and see every child of the family. All data is server only (rules deny clients).
//
// Firestore (classroom project):
//   teachers/{uid}               TeacherDoc    (made by an admin, Admin > Teachers)
//   admins/{uid}                 TeacherDoc    (made only by backend-classroom/scripts/add-admin.mjs)
//   families/{familyId}          Family        (parent login = custom token uid "parent_<familyId>")
//   familyCodes/{sha256(code)}   { familyId }  (the code itself is never stored)
//   staffCodes/{staffCodeDocId(code)}  { uid, createdAt }  (a teacher's / admin's access code; never stored itself; one per uid)
//   children/{childId}           Child
//   lessons/{lessonId}           Lesson        (shared library: every teacher can use every lesson)
//   sessions/{sessionId}         LessonSession (one lesson run on one day with some children)
//   reports/{reportId}           LessonReport  (one per child per session; id = `${sessionId}_${childId}`)
//
// Callables: POST <backend>/api/<name> { data } with "Authorization: Bearer <Firebase ID token>" (ClassroomCallable).
//   getMyRoles               {} → MyRoles
//   adminGetOverview         {} → { admin: TeacherDoc; teachers: TeacherDoc[] }
//   adminSaveTeacher         { uid?; email?; name } → { teacher; code? }   (uid = rename only; otherwise a new teacher: email is
//                            optional (an existing login with that email is reused), and a NEW access code is always
//                            returned, shown once)
//   adminSetTeacherActive    { uid; active } → { ok }
//   adminResetAccessCode     { uid } → { code }   (a teacher's, or the caller's own; another admin's: failed-precondition,
//                            use add-admin.mjs --access-code). The old code stops working.
//   teacherGetStudents       {} → { families: Family[]; children: Child[]; teachers?: {uid,name}[] (admins) }
//   teacherSaveFamily        { id?; parentName; teacherUid? (admin only); children: {id?; name; level}[] } → { family; children; code? (new family only, shown once) }
//   teacherResetFamilyCode   { familyId } → { code }
//   teacherDeleteFamily      { familyId } → { ok }        (deletes its children and their reports)
//   teacherGetChild          { childId } → { child; family; reports: LessonReport[] (newest first, all fields) }
//   teacherListLessons       {} → { lessons: Lesson[] }
//   teacherSaveLesson        { id?; title; subject; level; intro; goals; parts } → { lesson }
//   teacherDeleteLesson      { lessonId } → { ok }        (archived: old reports keep working)
//   teacherSaveSession       { id?; lessonId; date; reports: SessionChildInput[]; familyTexts: Record<familyId, string> } → { session; reports }
//   parentSignIn             { code } (no sign-in needed) → { token }   (Firebase custom token; rate limited per IP; kept for
//                            older open pages; the app uses codeSignIn)
//   codeSignIn               { code } (no sign-in needed) → { token; kind: "parent" | "staff" }   (owner decision 5 Nov 2026:
//                            the front page is ONE code box. A family code (10 chars) → the family's parent login; a staff
//                            access code (12 chars) → that teacher's / admin's own Auth uid, only while their teachers/admins
//                            doc is active and the Auth user is not disabled. Wrong code: not-found "That code doesn't work.
//                            Check it with your teacher." Rate limited per IP like parentSignIn.)
//   parentGetHome            {} → ParentHome
export type ClassroomCallable =
  | "getMyRoles" | "adminGetOverview" | "adminSaveTeacher" | "adminSetTeacherActive" | "adminResetAccessCode"
  | "teacherGetStudents" | "teacherSaveFamily" | "teacherResetFamilyCode" | "teacherDeleteFamily" | "teacherGetChild"
  | "teacherListLessons" | "teacherSaveLesson" | "teacherDeleteLesson" | "teacherSaveSession" | "parentSignIn" | "parentGetHome" | "codeSignIn";
export const CLASSROOM_CALLABLES: readonly ClassroomCallable[] = [
  "getMyRoles", "adminGetOverview", "adminSaveTeacher", "adminSetTeacherActive", "adminResetAccessCode",
  "teacherGetStudents", "teacherSaveFamily", "teacherResetFamilyCode", "teacherDeleteFamily", "teacherGetChild",
  "teacherListLessons", "teacherSaveLesson", "teacherDeleteLesson", "teacherSaveSession", "parentSignIn", "parentGetHome", "codeSignIn",
];
/** Which staff areas a login may open (an active teachers / admins doc). Parents are "parent_<familyId>" logins. */
export interface MyRoles { teacher: boolean; admin: boolean }

import type { Grade } from "./types";

export type Face = "good" | "ok" | "bad";
export const FACES: { id: Face; emoji: string; label: string }[] = [
  { id: "good", emoji: ":)", label: "Got it" },
  { id: "ok", emoji: ":|", label: "Getting there" },
  { id: "bad", emoji: ":(", label: "Needs help" },
];
export type Subject = "math" | "science" | "english" | "other";
export const SUBJECTS: { id: Subject; label: string }[] = [
  { id: "math", label: "Maths" }, { id: "science", label: "Science" }, { id: "english", label: "English" }, { id: "other", label: "Other" },
];

/** A learning goal and the teacher's prepared sentence for each face. `{name}` = the child's first name. */
export interface LearningGoal { id: string; text: string; scripts: Record<Face, string> }
/** A part of a lesson (activity, worksheet section…). Which parts a child finished is for teachers only. */
export interface LessonPart { id: string; title: string }

export interface Lesson {
  id: string;
  title: string;
  subject: Subject;
  /** "P4", "P5", "P6", or free text such as "Mixed" */
  level: string;
  /** Opening line of the feedback text. `{names}` = the children ("Zimo and Ziqiao"), `{lesson}` = the title. */
  intro: string;
  goals: LearningGoal[];
  parts: LessonPart[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
}

export interface Family {
  id: string;
  parentName: string;
  teacherUid: string;
  childIds: string[];
  createdAt: number;
  /** when the current code was made (codes are shown once; a reset makes a new one) */
  codeSetAt: number;
}
export interface Child {
  id: string;
  familyId: string;
  teacherUid: string;
  name: string;
  level: Grade | string;
  createdAt: number;
}

export interface SessionChildInput {
  childId: string;
  goals: Record<string, Face>;
  note: string;
  /** part ids finished (teacher only, never sent to parents) */
  partsDone: string[];
}
export interface LessonSession {
  id: string;
  lessonId: string;
  teacherUid: string;
  /** the lesson day (ms, local midnight is fine) */
  date: number;
  childIds: string[];
  /** the feedback text sent to each family (as edited by the teacher before copying) */
  familyTexts: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}
export interface LessonReport extends SessionChildInput {
  id: string;
  sessionId: string;
  lessonId: string;
  lessonTitle: string;
  familyId: string;
  teacherUid: string;
  date: number;
  createdAt: number;
}
/** What parents get: no partsDone, nothing about other families. */
export type ParentReport = Omit<LessonReport, "partsDone" | "teacherUid">;
export interface ParentHome {
  family: Pick<Family, "id" | "parentName">;
  children: Pick<Child, "id" | "name" | "level">[];
  reports: ParentReport[];
  /** the lessons those reports are about (title, subject, goals text; no feedback scripts) */
  lessons: { id: string; title: string; subject: Subject; level: string; goals: { id: string; text: string }[] }[];
  /** per session: the feedback text the teacher sent this family */
  feedback: Record<string, string>;
}

export const LESSON_LIMITS = {
  maxGoals: 12, maxParts: 20, maxChildrenPerFamily: 8, maxChildrenPerSession: 40, maxText: 600, maxNote: 1000, maxFeedback: 6000, maxTitle: 120,
} as const;

/** Parent codes: 10 characters from an alphabet without look-alikes (no 0, O, 1, I, L), shown as XXXXX-XXXXX. */
export const FAMILY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function normalizeFamilyCode(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export const isFamilyCode = (c: string) => c.length === 10 && [...c].every((ch) => FAMILY_CODE_ALPHABET.includes(ch));
export const formatFamilyCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;

/** Staff access codes (teachers / admins; owner decision 5 Nov 2026): 12 characters, same alphabet, shown XXXX-XXXX-XXXX.
 *  Normalized with normalizeFamilyCode; the length tells a family code (10) from a staff code (12). */
export const STAFF_CODE_LENGTH = 12;
export const isStaffCode = (c: string) => c.length === STAFF_CODE_LENGTH && [...c].every((ch) => FAMILY_CODE_ALPHABET.includes(ch));
export const formatStaffCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
export type CodeKind = "parent" | "staff";
/** Which kind of code was typed (after normalizeFamilyCode), or null when it can't be either. */
export const codeKind = (c: string): CodeKind | null => (isFamilyCode(c) ? "parent" : isStaffCode(c) ? "staff" : null);

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? "";
/** "Zimo", "Zimo and Ziqiao", "Zimo, Ziqiao and Ann". */
export function joinNames(names: readonly string[]): string {
  const f = names.map(firstName).filter(Boolean);
  return f.length <= 1 ? (f[0] ?? "") : `${f.slice(0, -1).join(", ")} and ${f[f.length - 1]}`;
}
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/**
 * The feedback text for ONE family after a lesson (siblings share one message, like the owner's example):
 * greeting, the lesson's intro line, then per child the prepared sentence of each learning goal for the face chosen,
 * then the teacher's note. The teacher can still edit the text before copying it to WhatsApp.
 */
export function feedbackText(opts: {
  parentName: string; lesson: Pick<Lesson, "title" | "intro" | "goals">;
  children: { name: string; goals: Record<string, Face>; note: string }[];
}): string {
  const { lesson, children } = opts;
  const names = joinNames(children.map((c) => c.name));
  const out: string[] = [`Hi ${firstName(opts.parentName) || "there"}!`];
  const intro = fill(lesson.intro || "Today, {names} worked on {lesson}.", { names, lesson: lesson.title }).trim();
  if (intro) out.push(intro);
  for (const c of children) {
    const sentences = lesson.goals
      .map((g) => (c.goals[g.id] ? fill(g.scripts[c.goals[g.id]] ?? "", { name: firstName(c.name) }).trim() : ""))
      .filter(Boolean);
    const note = c.note.trim();
    if (!sentences.length && !note) continue;
    out.push([...sentences, note].filter(Boolean).join(" "));
  }
  return out.join("\n\n");
}
