// Catapult Classroom rules that need no database: validation, parent codes, what parents may see.
// Pure (Firestore / Auth side: ../lessons.ts). Contract: packages/shared/src/lessons.ts.
import { createHash, randomInt } from "node:crypto";
import {
  FACES, FAMILY_CODE_ALPHABET, LESSON_LIMITS as L, SUBJECTS, type Child, type Face, type LearningGoal, type Lesson, type LessonPart,
  type LessonReport, type ParentReport, type SessionChildInput, type Subject,
} from "../shared/index.js";
import type { Fail, Ok } from "../errors.js";

const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });
const obj = (v: unknown): Record<string, unknown> => ((v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const validDocId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

// ---------------------------------------------------------------- access
/** Staff = an active admin (sees everything) or an active teacher (their own families). */
export function staffOf(teacher: { active?: unknown } | null | undefined, admin: { active?: unknown } | null | undefined): Fail | Ok<{ admin: boolean }> {
  if (admin?.active === true) return { ok: true, admin: true };
  if (teacher?.active === true) return { ok: true, admin: false };
  return fail("permission-denied", "Not a teacher account.");
}
/** A teacher may touch a family / child only if it is theirs; admins may touch any. */
export function canTouch(staff: { uid: string; admin: boolean }, ownerUid: string | undefined): boolean {
  return staff.admin || (!!ownerUid && ownerUid === staff.uid);
}

// ---------------------------------------------------------------- parent codes and logins
export const PARENT_UID_PREFIX = "parent_";
export const parentUid = (familyId: string) => `${PARENT_UID_PREFIX}${familyId}`;
export const familyIdOfUid = (uid: string | undefined): string | null =>
  uid && uid.startsWith(PARENT_UID_PREFIX) && validDocId(uid.slice(PARENT_UID_PREFIX.length)) ? uid.slice(PARENT_UID_PREFIX.length) : null;
export function makeFamilyCode(rand: (max: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += FAMILY_CODE_ALPHABET[rand(FAMILY_CODE_ALPHABET.length)];
  return s;
}
/** familyCodes/{doc id}: the code is never stored, only this hash. */
export const codeDocId = (code: string) => createHash("sha256").update(`catapult-family:${code}`).digest("hex");

// ---------------------------------------------------------------- validation
const SUBJECT_IDS = new Set(SUBJECTS.map((s) => s.id));
const FACE_IDS = new Set<string>(FACES.map((f) => f.id));
const newId = (rand: (max: number) => number) => Array.from({ length: 8 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[rand(32)]).join("");

export type LessonInput = Pick<Lesson, "title" | "subject" | "level" | "intro" | "goals" | "parts">;
export function validateLesson(raw: unknown, rand: (max: number) => number = randomInt): Fail | Ok<{ value: LessonInput }> {
  const d = obj(raw);
  const title = text(d.title, L.maxTitle);
  if (!title) return fail("invalid-argument", "Give the lesson a title.");
  const subject = (SUBJECT_IDS.has(d.subject as Subject) ? d.subject : "other") as Subject;
  const level = text(d.level, 20) || "P6";
  const intro = text(d.intro, L.maxText);
  if (!Array.isArray(d.goals) || d.goals.length > L.maxGoals) return fail("invalid-argument", `Up to ${L.maxGoals} learning goals.`);
  if (!Array.isArray(d.parts) || d.parts.length > L.maxParts) return fail("invalid-argument", `Up to ${L.maxParts} parts.`);
  const seen = new Set<string>();
  const goals: LearningGoal[] = [];
  for (const g0 of d.goals) {
    const g = obj(g0);
    const t = text(g.text, L.maxText);
    if (!t) continue; // empty rows are dropped
    let id = validDocId(g.id) && !seen.has(g.id) ? g.id : newId(rand);
    while (seen.has(id)) id = newId(rand);
    seen.add(id);
    const sc = obj(g.scripts);
    goals.push({ id, text: t, scripts: { good: text(sc.good, L.maxText), ok: text(sc.ok, L.maxText), bad: text(sc.bad, L.maxText) } });
  }
  const parts: LessonPart[] = [];
  for (const p0 of d.parts) {
    const p = obj(p0);
    const t = text(p.title, L.maxTitle);
    if (!t) continue;
    let id = validDocId(p.id) && !seen.has(p.id) ? p.id : newId(rand);
    while (seen.has(id)) id = newId(rand);
    seen.add(id);
    parts.push({ id, title: t });
  }
  return { ok: true, value: { title, subject, level, intro, goals, parts } };
}

export interface FamilyInput { parentName: string; children: { id?: string; name: string; level: string }[] }
export function validateFamily(raw: unknown): Fail | Ok<{ value: FamilyInput }> {
  const d = obj(raw);
  const parentName = text(d.parentName, 80);
  if (!parentName) return fail("invalid-argument", "Enter the parent's name.");
  if (!Array.isArray(d.children)) return fail("invalid-argument", "Add at least one child.");
  const children = d.children.map(obj).map((c) => ({
    ...(validDocId(c.id) ? { id: c.id as string } : {}), name: text(c.name, 60), level: text(c.level, 20) || "P6",
  })).filter((c) => c.name);
  if (!children.length) return fail("invalid-argument", "Add at least one child.");
  if (children.length > L.maxChildrenPerFamily) return fail("invalid-argument", `Up to ${L.maxChildrenPerFamily} children per family.`);
  return { ok: true, value: { parentName, children } };
}

export interface SessionInput { lessonId: string; date: number; reports: SessionChildInput[]; familyTexts: Record<string, string> }
/** `children`: the children the caller may report on (already filtered by access); unknown ones are refused. */
export function validateSession(raw: unknown, lesson: Pick<Lesson, "goals" | "parts"> | null, children: Map<string, Pick<Child, "familyId">>): Fail | Ok<{ value: SessionInput }> {
  const d = obj(raw);
  if (!lesson) return fail("not-found", "No such lesson.");
  if (!validDocId(d.lessonId)) return fail("invalid-argument", "bad lessonId");
  const date = typeof d.date === "number" && Number.isFinite(d.date) && d.date > 1.6e12 && d.date < 4.1e12 ? Math.floor(d.date) : 0;
  if (!date) return fail("invalid-argument", "Pick the lesson date.");
  if (!Array.isArray(d.reports) || !d.reports.length) return fail("invalid-argument", "Pick the children who were in the lesson.");
  if (d.reports.length > L.maxChildrenPerSession) return fail("invalid-argument", `Up to ${L.maxChildrenPerSession} children per lesson.`);
  const goalIds = new Set(lesson.goals.map((g) => g.id));
  const partIds = new Set(lesson.parts.map((p) => p.id));
  const reports: SessionChildInput[] = [];
  const seen = new Set<string>();
  for (const r0 of d.reports) {
    const r = obj(r0);
    if (!validDocId(r.childId) || !children.has(r.childId)) return fail("permission-denied", "One of those children isn't yours.");
    if (seen.has(r.childId)) continue;
    seen.add(r.childId);
    const goals: Record<string, Face> = {};
    for (const [k, v] of Object.entries(obj(r.goals))) if (goalIds.has(k) && FACE_IDS.has(v as string)) goals[k] = v as Face;
    const partsDone = Array.isArray(r.partsDone) ? [...new Set(r.partsDone.filter((p): p is string => typeof p === "string" && partIds.has(p)))] : [];
    reports.push({ childId: r.childId, goals, note: text(r.note, L.maxNote), partsDone });
  }
  const families = new Set(reports.map((r) => children.get(r.childId)!.familyId));
  const familyTexts: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(d.familyTexts))) if (families.has(k)) familyTexts[k] = text(v, L.maxFeedback);
  return { ok: true, value: { lessonId: d.lessonId as string, date, reports, familyTexts } };
}

// ---------------------------------------------------------------- parents
/** What a parent sees of a report: never which parts were done, never the teacher. */
export function toParentReport(r: LessonReport): ParentReport {
  const { partsDone: _p, teacherUid: _t, ...rest } = r;
  return rest;
}
