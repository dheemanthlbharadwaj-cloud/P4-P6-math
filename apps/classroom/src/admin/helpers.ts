// Pure helpers for the admin dashboard (tested in helpers.test.ts).
import type { AdminClassRow, AdminUserRow, TeacherDoc } from "@p6/shared";

export const byName = <T extends { name: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

export const sortTeachers = (teachers: TeacherDoc[]): TeacherDoc[] => byName(teachers);
export const sortClasses = (classes: AdminClassRow[]): AdminClassRow[] =>
  [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id));

export const teacherClassCount = (classes: AdminClassRow[], teacherUid: string): number =>
  classes.filter((c) => c.teacherUid === teacherUid).length;

/** Classes of one teacher, or all of them when `teacherUid` is empty. */
export const filterClasses = (classes: AdminClassRow[], teacherUid: string): AdminClassRow[] =>
  sortClasses(teacherUid ? classes.filter((c) => c.teacherUid === teacherUid) : classes);

export const teacherNameOf = (teachers: TeacherDoc[], uid: string): string => teachers.find((t) => t.uid === uid)?.name ?? "Unknown teacher";

/** Class names for a login's class ids, using the overview (an id not in the overview falls back to the id). */
export function classNamesFor(classIds: string[], classes: AdminClassRow[]): { id: string; name: string }[] {
  return classIds.map((id) => ({ id, name: classes.find((c) => c.id === id)?.name ?? id }));
}

export const normalizeQuery = (q: string): string => q.trim();
export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
export const canSearch = (q: string): boolean => normalizeQuery(q).length >= 3;
export const canSaveTeacher = (name: string, email: string): boolean => name.trim().length > 0 && isEmail(email);

const METHODS: Record<string, string> = { password: "Email + password", "google.com": "Google", "apple.com": "Apple", phone: "Phone", anonymous: "Guest" };
export const signInMethods = (providers: string[]): string =>
  providers.length === 0 ? "None" : providers.map((p) => METHODS[p] ?? p).join(", ");

/** Only email/password logins have a password to reset. */
export const canResetPassword = (u: Pick<AdminUserRow, "providers">): boolean => u.providers.includes("password");

/** Classes the login could still be added to. */
export const joinableClasses = (u: Pick<AdminUserRow, "classIds">, classes: AdminClassRow[]): AdminClassRow[] =>
  sortClasses(classes.filter((c) => !u.classIds.includes(c.id)));

/** Type the class name to delete it (case-sensitive, surrounding spaces ignored). */
export const matchesClassName = (typed: string, name: string): boolean => typed.trim() === name.trim() && name.trim().length > 0;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "21 Oct 2026" in Singapore time; "-" when unknown. */
export function formatDate(ms: number | undefined): string {
  if (!ms) return "-";
  const d = new Date(ms + 8 * 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
