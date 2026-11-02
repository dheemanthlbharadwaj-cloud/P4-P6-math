// Admin (owner) dashboard rules that need no database: access, query parsing, validation, password generation, row building.
// Pure (Firestore / Auth side: ../adminDashboard.ts). Contract: packages/shared/src/admin.ts.
import { randomInt } from "node:crypto";
import { ACTIVE_GRADES, tidyName, type AdminUserRow, type Grade, type TeacherDoc } from "../shared/index.js";
import type { Fail, Ok } from "./rules.js";
import { isFriendCode, normalizeFriendCode } from "./rules.js";
import { validId, validateSaveClass } from "./classroom.js";

const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });

export const MAX_ADMIN_NAME = 60;
export const MAX_EMAIL = 200;
export const MIN_PASSWORD_LENGTH = 16;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------- access
/** Admin callables: admins/{uid} exists and is active. */
export function checkAdmin(doc: { active?: unknown } | undefined | null): Fail | Ok {
  if (!doc) return fail("permission-denied", "Not an admin");
  if (doc.active !== true) return fail("permission-denied", "Not an admin");
  return { ok: true };
}
/** An admin may not lock themselves out: disabling their own login / teacher record is refused. */
export function checkNotSelf(callerUid: string, targetUid: string): Fail | Ok {
  if (callerUid === targetUid) return fail("failed-precondition", "You can't do this to your own account.");
  return { ok: true };
}

/** Other admins are managed with add-admin.mjs, never from the dashboard (reset / disable / deactivate). The caller's own account is fine here. */
export function checkNotOtherAdmin(callerUid: string, targetUid: string, targetIsAdmin: boolean): Fail | Ok {
  if (targetIsAdmin && callerUid !== targetUid) return fail("failed-precondition", "Other admins are managed with add-admin.mjs");
  return { ok: true };
}
/** A login that is disabled can't be promoted to teacher: enable it first (a disabled teacher record would be active on a dead login). */
export function checkPromotable(authDisabled: boolean): Fail | Ok {
  if (authDisabled) return fail("failed-precondition", "Enable this login first");
  return { ok: true };
}

// ---------------------------------------------------------------- passwords
const PASSWORD_SETS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"]; // no 0/O, 1/l/I
/** `length` readable characters (default 16), at least one of each class, from a CSPRNG (injectable for tests). */
export function makePassword(length = MIN_PASSWORD_LENGTH, rand: (max: number) => number = randomInt): string {
  const n = Math.max(MIN_PASSWORD_LENGTH, Math.floor(length));
  const all = PASSWORD_SETS.join("");
  const chars = PASSWORD_SETS.map((s) => s[rand(s.length)]);
  while (chars.length < n) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ---------------------------------------------------------------- adminFindUser
export type UserQuery = { kind: "friendCode"; value: string } | { kind: "email"; value: string } | { kind: "uid"; value: string };
/** friend code (8 chars from the code alphabet, any case, dashes/spaces ignored), an email (has "@"), else a uid. */
export function parseUserQuery(raw: unknown): Fail | Ok<{ query: UserQuery }> {
  if (typeof raw !== "string") return fail("invalid-argument", "query required");
  const q = raw.trim();
  if (!q) return fail("invalid-argument", "query required");
  if (q.length > MAX_EMAIL) return fail("invalid-argument", "query too long");
  if (q.includes("@")) {
    const email = q.toLowerCase();
    if (!EMAIL_RE.test(email)) return fail("invalid-argument", "That is not a valid email address.");
    return { ok: true, query: { kind: "email", value: email } };
  }
  if (/^[A-Za-z0-9 -]+$/.test(q)) {
    const code = normalizeFriendCode(q);
    if (isFriendCode(code)) return { ok: true, query: { kind: "friendCode", value: code } };
  }
  if (validId(q)) return { ok: true, query: { kind: "uid", value: q } };
  return fail("invalid-argument", "Enter a friend code, an email or a user id.");
}

// ---------------------------------------------------------------- validators
/** `uid` given = rename that teacher only (never creates or promotes a login); without it the email decides (create / promote / rename). */
export function validateSaveTeacher(d: unknown): Fail | Ok<{ email: string; name: string; uid?: string }> {
  const x = d as { email?: unknown; name?: unknown; uid?: unknown } | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  const email = typeof x.email === "string" ? x.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return fail("invalid-argument", "A valid email is required.");
  const name = typeof x.name === "string" ? tidyName(x.name) : "";
  if (!name || name.length > MAX_ADMIN_NAME) return fail("invalid-argument", `name must be 1..${MAX_ADMIN_NAME} characters`);
  if (x.uid !== undefined && !validId(x.uid)) return fail("invalid-argument", "bad uid");
  return { ok: true, email, name, ...(x.uid !== undefined ? { uid: x.uid as string } : {}) };
}

export function validateAdminSaveClass(d: unknown): Fail | Ok<{ id?: string; name: string; grade: Grade; teacherUid: string }> {
  const v = validateSaveClass(d);
  if (!v.ok) return v;
  const teacherUid = (d as { teacherUid?: unknown }).teacherUid;
  if (!validId(teacherUid)) return fail("invalid-argument", "bad teacherUid");
  return { ok: true, id: v.id, name: v.name, grade: v.grade, teacherUid };
}

/** `{ uid, active }` / `{ uid, disabled }` bodies: a uid and a real boolean. */
export function validateUidFlag(d: unknown, flag: "active" | "disabled"): Fail | Ok<{ uid: string; value: boolean }> {
  const x = d as Record<string, unknown> | null;
  if (!x || typeof x !== "object") return fail("invalid-argument", "missing body");
  if (!validId(x.uid)) return fail("invalid-argument", "bad uid");
  if (typeof x[flag] !== "boolean") return fail("invalid-argument", `${flag} must be true or false`);
  return { ok: true, uid: x.uid, value: x[flag] as boolean };
}

/** The teacher a class may be (re)assigned to: exists and is active. */
export function checkAssignableTeacher(t: Pick<TeacherDoc, "active"> | undefined | null): Fail | Ok {
  if (!t) return fail("not-found", "No such teacher.");
  if (t.active !== true) return fail("failed-precondition", "This teacher account is disabled.");
  return { ok: true };
}

// ---------------------------------------------------------------- rows
export interface AuthLike {
  uid: string;
  email?: string;
  displayName?: string;
  disabled: boolean;
  providerData: { providerId: string }[];
  metadata: { creationTime?: string; lastSignInTime?: string };
}
const ms = (s: string | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : undefined;
};
/** Firebase Auth record + users/{uid} + teachers/{uid} → one dashboard row (displayName: student name, else teacher, else Auth, else ""). */
export function buildUserRow(a: AuthLike, user: Record<string, unknown> | undefined, teacher: Partial<TeacherDoc> | undefined): AdminUserRow {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const grade = ACTIVE_GRADES.includes(user?.grade as Grade) ? (user!.grade as Grade) : undefined;
  const created = ms(a.metadata.creationTime);
  const last = ms(a.metadata.lastSignInTime);
  return {
    uid: a.uid,
    displayName: str(user?.fullName) ?? str(teacher?.name) ?? str(a.displayName) ?? "",
    ...(a.email ? { email: a.email } : {}),
    providers: a.providerData.map((p) => p.providerId),
    ...(str(user?.friendCode) ? { friendCode: str(user?.friendCode) } : {}),
    ...(grade ? { grade } : {}),
    classIds: Array.isArray(user?.classIds) ? (user!.classIds as unknown[]).filter((x): x is string => typeof x === "string") : [],
    disabled: a.disabled,
    isTeacher: !!teacher,
    ...(teacher ? { teacherActive: teacher.active === true } : {}),
    ...(created !== undefined ? { createdAt: created } : {}),
    ...(last !== undefined ? { lastSignInAt: last } : {}),
  };
}

/** Email/password logins can have their password reset; Google-only accounts cannot. */
export const hasPasswordLogin = (providers: readonly string[]) => providers.includes("password");

/** Log line detail: short, no secrets. */
export const logDetail = (s: string) => s.slice(0, 200);
