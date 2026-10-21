// Classroom rules that need no database: validation, access checks, diagnostic picking, mark planning, birthdays,
// milestone detection, the Cloudinary upload signature. Pure (Firestore side: ../classroom.ts).
import { createHash } from "node:crypto";
import {
  ACTIVE_GRADES, CLASS_LIMITS, activeLevelIds, type ClassDoc, type ClassTask, type Grade, type LevelNo, type MarkValue, type PostAttachment, type TaskKind,
} from "../shared/index.js";
import type { Fail, Ok } from "./rules.js";
import type { QstatDelta } from "./qstats.js";
import { levelNewlyComplete, resolveLevelStars, type LevelStarsDoc, type LevelStarsUpdate } from "./levelStars.js";

const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });

// ---------------------------------------------------------------- ids and text
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // class / task / post / student uid (Firebase uids are 28 chars)
export const QID_RE = /^[A-Za-z0-9_ -]{1,120}$/; // question ids ("2023_St Nicholas_P2_Q2" has a space)
export const MAX_CLASS_NAME = 40;
export const MAX_CLASSES_PER_TEACHER = 30;
export const MAX_ATTACHMENTS = 10;
export const MAX_TITLE = 100;
const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const str = (v: unknown): string | null => (typeof v === "string" ? v.trim() : null);
export const validId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v);

/** "MM-DD" that exists on a calendar (02-29 allowed). */
export function validBirthday(v: unknown): v is string {
  if (typeof v !== "string" || !BIRTHDAY_RE.test(v)) return false;
  return Number(v.slice(3)) <= DAYS[Number(v.slice(0, 2)) - 1];
}

// ---------------------------------------------------------------- access
/** Teacher callables: teachers/{uid} exists and is active. */
export function checkTeacher(doc: { active?: unknown } | undefined | null): Fail | Ok {
  if (!doc) return fail("permission-denied", "Not a teacher account.");
  if (doc.active !== true) return fail("permission-denied", "This teacher account is disabled.");
  return { ok: true };
}
/** Class callables: the class exists and its teacherUid is the caller. */
export function checkClassOwner(cls: Pick<ClassDoc, "teacherUid"> | undefined | null, uid: string): Fail | Ok {
  if (!cls) return fail("not-found", "No such class.");
  if (cls.teacherUid !== uid) return fail("permission-denied", "This is not your class.");
  return { ok: true };
}
/** Student callables: the caller is on the class roster. */
export function checkRosterMember(cls: Pick<ClassDoc, "students"> | undefined | null, uid: string): Fail | Ok {
  if (!cls) return fail("not-found", "No such class.");
  if (!cls.students.some((s) => s.uid === uid)) return fail("permission-denied", "You are not in this class.");
  return { ok: true };
}

// ---------------------------------------------------------------- validators
export function validateSaveClass(d: unknown): Fail | Ok<{ id?: string; name: string; grade: Grade }> {
  const x = d as { id?: unknown; name?: unknown; grade?: unknown } | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  const name = str(x.name);
  if (!name || name.length > MAX_CLASS_NAME) return fail("invalid-argument", `name must be 1..${MAX_CLASS_NAME} characters`);
  if (typeof x.grade !== "string" || !ACTIVE_GRADES.includes(x.grade as Grade)) return fail("invalid-argument", "bad grade");
  if (x.id !== undefined && !validId(x.id)) return fail("invalid-argument", "bad class id");
  return { ok: true, id: x.id as string | undefined, name, grade: x.grade as Grade };
}

export function validatePost(d: unknown): Fail | Ok<{ text: string; attachments: PostAttachment[]; taskId?: string }> {
  const x = d as { text?: unknown; attachments?: unknown; taskId?: unknown } | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  const text = typeof x.text === "string" ? x.text.trim() : "";
  if (text.length > CLASS_LIMITS.maxPostChars) return fail("invalid-argument", `text is limited to ${CLASS_LIMITS.maxPostChars} characters`);
  const attachments: PostAttachment[] = [];
  if (x.attachments !== undefined) {
    if (!Array.isArray(x.attachments) || x.attachments.length > MAX_ATTACHMENTS) return fail("invalid-argument", `at most ${MAX_ATTACHMENTS} attachments`);
    for (const a of x.attachments as Partial<PostAttachment>[]) {
      const name = str(a?.name);
      if (!name || name.length > 120) return fail("invalid-argument", "bad attachment name");
      if (a?.kind !== "pdf" && a?.kind !== "image" && a?.kind !== "link") return fail("invalid-argument", "bad attachment kind");
      if (typeof a.url !== "string" || a.url.length > 600 || !/^https:\/\/[^\s]+$/.test(a.url)) return fail("invalid-argument", "attachment url must be https");
      attachments.push({ name, url: a.url, kind: a.kind });
    }
  }
  if (!text && !attachments.length) return fail("invalid-argument", "a post needs text or an attachment");
  if (x.taskId !== undefined && !validId(x.taskId)) return fail("invalid-argument", "bad taskId");
  return { ok: true, text, attachments, taskId: x.taskId as string | undefined };
}

export interface TaskRequest { kind: TaskKind; title?: string; subtopicId?: string; level?: LevelNo; topicId?: string; dueAt?: number; inApp?: boolean }
export function validateCreateTask(d: unknown, now: number): Fail | Ok<{ req: TaskRequest }> {
  const x = d as Record<string, unknown> | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  if (x.kind !== "worksheet" && x.kind !== "diagnostic") return fail("invalid-argument", "kind must be worksheet or diagnostic");
  const req: TaskRequest = { kind: x.kind };
  if (x.title !== undefined) {
    const t = str(x.title);
    if (t === null || t.length > MAX_TITLE) return fail("invalid-argument", `title is limited to ${MAX_TITLE} characters`);
    if (t) req.title = t;
  }
  if (x.dueAt !== undefined && x.dueAt !== null) {
    if (typeof x.dueAt !== "number" || !Number.isFinite(x.dueAt) || x.dueAt < now - 7 * 86400_000 || x.dueAt > now + 400 * 86400_000) return fail("invalid-argument", "bad dueAt");
    req.dueAt = Math.round(x.dueAt);
  }
  if (x.inApp !== undefined && typeof x.inApp !== "boolean") return fail("invalid-argument", "bad inApp");
  if (x.kind === "worksheet") {
    if (typeof x.subtopicId !== "string" || !/^p[4-6]-[a-z0-9-]{3,120}$/.test(x.subtopicId)) return fail("invalid-argument", "a worksheet needs a subtopicId");
    if (x.level !== 1 && x.level !== 2 && x.level !== 3) return fail("invalid-argument", "a worksheet needs level 1, 2 or 3");
    req.subtopicId = x.subtopicId; req.level = x.level;
    req.inApp = false; // worksheets are paper
  } else {
    if (typeof x.topicId !== "string" || !/^[a-z0-9-]{2,120}$/.test(x.topicId)) return fail("invalid-argument", "a diagnostic needs a topicId");
    req.topicId = x.topicId;
    req.inApp = x.inApp !== false; // default: taken in the app
  }
  return { ok: true, req };
}

export function validateMarks(d: unknown, taskQuestionIds: readonly string[]): Fail | Ok<{ marks: Record<string, MarkValue> }> {
  if (!d || typeof d !== "object" || Array.isArray(d)) return fail("invalid-argument", "marks must be an object");
  const marks: Record<string, MarkValue> = {};
  const entries = Object.entries(d as Record<string, unknown>);
  if (!entries.length || entries.length > CLASS_LIMITS.maxDiagnostic * 4) return fail("invalid-argument", "bad number of marks");
  for (const [q, v] of entries) {
    if (!QID_RE.test(q) || !taskQuestionIds.includes(q)) return fail("invalid-argument", "a mark is for a question that is not in this task");
    if (v !== "right" && v !== "wrong") return fail("invalid-argument", 'a mark must be "right" or "wrong"');
    marks[q] = v;
  }
  return { ok: true, marks };
}

// ---------------------------------------------------------------- tasks
/** A student may still take an in-app task until the end (SGT) of its due day. */
export function taskOpen(task: Pick<ClassTask, "dueAt">, now: number, startOfSgtDay: (ms: number) => number): boolean {
  return task.dueAt === undefined || now < startOfSgtDay(task.dueAt) + 86400_000;
}

const LEVELS: LevelNo[] = [1, 2, 3];
/**
 * Diagnostic picker, deterministic: one question per subtopic of the topic (in map order), the level cycling LV1, LV2, LV3
 * down the list so the test mixes difficulties; a subtopic with no question at its level falls back to the next level.
 * With more subtopics than `max`, an evenly spread subset is used. `idsOf` returns a level's current (non-retired) questions.
 * Every level question is auto-markable (the bundle only puts those on the map), which is what inApp needs.
 */
export function pickDiagnostic(subtopicIds: readonly string[], idsOf: (subtopicId: string, level: LevelNo) => readonly string[], max: number = CLASS_LIMITS.maxDiagnostic): string[] {
  const n = subtopicIds.length;
  const take = Math.min(n, max);
  const out: string[] = [];
  for (let k = 0; k < take; k++) {
    const i = n <= max ? k : Math.floor((k * n) / take);
    const sub = subtopicIds[i];
    for (let j = 0; j < 3; j++) {
      const level = LEVELS[(i + j) % 3];
      const ids = idsOf(sub, level);
      if (!ids.length) continue;
      const id = ids[(i * 2 + level) % ids.length];
      if (!out.includes(id)) { out.push(id); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- marking
export interface MarkPlan {
  /** the student's marks after this call */
  merged: Record<string, MarkValue>;
  changed: { questionId: string; prev?: MarkValue; next: MarkValue }[];
  /** counters for qstats (see qstats.ts) */
  deltas: QstatDelta[];
  /** questions marked for the first time (they count as attempts, like an answer in the app) */
  firstTime: string[];
  /** questions that go into the student's "previously wrong" bookmarks */
  flagWrong: string[];
  /** questions that were flagged wrong by an earlier teacher mark and are right now */
  clearWrong: string[];
}
/**
 * Idempotent: marks equal to the stored ones change nothing. First mark = one attempt (right: completed; wrong: +1 wrong).
 * A later correction is not a new attempt: right->wrong adds a wrong answer (the star stays: once ever), wrong->right removes it.
 */
export function planMarks(prev: Readonly<Record<string, MarkValue>>, incoming: Readonly<Record<string, MarkValue>>): MarkPlan {
  const merged: Record<string, MarkValue> = { ...prev };
  const changed: MarkPlan["changed"] = [];
  const deltas: QstatDelta[] = [];
  const firstTime: string[] = [];
  const flagWrong: string[] = [];
  const clearWrong: string[] = [];
  for (const [questionId, next] of Object.entries(incoming)) {
    const was = prev[questionId];
    if (was === next) continue;
    merged[questionId] = next;
    changed.push({ questionId, prev: was, next });
    if (was === undefined) {
      firstTime.push(questionId);
      deltas.push(next === "right"
        ? { questionId, attempts: 1, wrong: 0, correct: true, homework: "remove" }
        : { questionId, attempts: 1, wrong: 1, correct: false, homework: "add" });
    } else {
      deltas.push(next === "right"
        ? { questionId, attempts: 0, wrong: -1, correct: true, homework: "remove" }
        : { questionId, attempts: 0, wrong: 1, correct: false, homework: "add" });
    }
    if (next === "wrong") flagWrong.push(questionId);
    else if (was === "wrong") clearWrong.push(questionId);
  }
  return { merged, changed, deltas, firstTime, flagWrong, clearWrong };
}

export interface LevelRef { subtopicId: string; level: LevelNo; key: string; /** an earlier mark of a question in this level is being changed */ correction?: boolean }
/** The levels that have a changed question (those need their levelStars document). */
export function touchedLevels(plan: Pick<MarkPlan, "changed">, levelOf: (questionId: string) => LevelRef | undefined): LevelRef[] {
  const m = new Map<string, LevelRef>();
  for (const c of plan.changed) {
    const l = levelOf(c.questionId);
    if (l) m.set(l.key, { ...l, correction: c.prev !== undefined || m.get(l.key)?.correction === true });
  }
  return [...m.values()];
}
/**
 * Stars for the touched levels, exactly as an in-app attempt would pay them (logic/levelStars.ts -> stars.ts): each level is
 * judged with every one of its questions that is right after this call. A question that already has its star pays nothing
 * again, so right -> wrong -> right pays once; the replay bonus is paid once per level, and never for a correction of a mark.
 */
export function settleStars(
  touched: readonly LevelRef[], docs: readonly (LevelStarsDoc | undefined)[], merged: Readonly<Record<string, MarkValue>>,
  levels: Readonly<Record<string, string[]>>, retired: ReadonlySet<string> | readonly string[],
): { stars: number; writes: { key: string; write: NonNullable<LevelStarsUpdate["write"]> }[]; completed: { subtopicId: string; level: LevelNo; levelIds: string[] }[] } {
  let stars = 0;
  const writes: { key: string; write: NonNullable<LevelStarsUpdate["write"]> }[] = [];
  const completed: { subtopicId: string; level: LevelNo; levelIds: string[] }[] = [];
  touched.forEach((l, i) => {
    const bundleIds = levels[l.key] ?? [];
    const levelIds = activeLevelIds(bundleIds, retired);
    const u = resolveLevelStars(docs[i], bundleIds, levelIds, levelIds.filter((id) => merged[id] === "right"), l.correction === true);
    stars += u.r.stars;
    if (u.write) writes.push({ key: l.key, write: u.write });
    if (levelNewlyComplete(levelIds, u.correctBefore, u)) completed.push({ subtopicId: l.subtopicId, level: l.level, levelIds });
  });
  return { stars, writes, completed };
}

// ---------------------------------------------------------------- birthdays
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** Does `birthday` ("MM-DD") fall on `date` (yyyy-mm-dd)? 29 Feb is celebrated on 28 Feb in non-leap years. */
export function birthdayIsToday(birthday: string | undefined, date: string): boolean {
  if (!birthday || !validBirthday(birthday)) return false;
  if (date.slice(5) === birthday) return true;
  return birthday === "02-29" && date.slice(5) === "02-28" && !isLeap(Number(date.slice(0, 4)));
}
/** Birthday posts to write for one class today: [{studentUid, displayName}]. */
export function birthdaysToday(cls: Pick<ClassDoc, "students">, date: string): { uid: string; displayName: string }[] {
  return cls.students.filter((s) => birthdayIsToday(s.birthday, date)).map((s) => ({ uid: s.uid, displayName: s.displayName }));
}
export const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] || "A player";

// ---------------------------------------------------------------- Cloudinary upload signature
/** Cloudinary signed upload: sha1 of the sorted `k=v&…` parameters (without file / api_key / resource_type) + the API secret. */
export function cloudinarySignature(params: Record<string, string | number>, secret: string): string {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(base + secret).digest("hex");
}
/** A safe Cloudinary public id (without the folder) from the file name: letters, digits, - and _, plus a random suffix. */
export function safePublicId(fileName: string, suffix: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "").normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return `${base}-${suffix}`;
}
