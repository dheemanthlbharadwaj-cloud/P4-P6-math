// Pure rules for the Classroom areas (no React, no network; tested in logic.test.ts). Staff areas only: parents sign in
// with their family code and only ever see /parent (the teacher panel is never shown to them).
import type { MyRoles } from "@p6/shared";

export type Area = "teacher" | "admin";
export const AREAS: { id: Area; label: string; blurb: string }[] = [
  { id: "teacher", label: "Teacher", blurb: "Lessons, students, feedback and the worksheet builder." },
  { id: "admin", label: "Admin", blurb: "Teacher accounts and logins." },
];

export type RolesPhase = "idle" | "loading" | "ready" | "unknown";

/** The staff areas to offer: Teacher for teachers and admins, Admin for admins; both while the roles are unknown. */
export function areasFor(phase: RolesPhase, roles: MyRoles): Area[] {
  if (phase === "unknown") return ["teacher", "admin"];
  return [...(roles.teacher || roles.admin ? ["teacher" as const] : []), ...(roles.admin ? ["admin" as const] : [])];
}

/** Where to go after sign-in: the last area used (if still allowed), else Teacher when allowed. null = ask (or not staff). */
export function startArea(offered: readonly Area[], last: Area | null, known: boolean): Area | null {
  if (last && offered.includes(last)) return last;
  if (!known) return null;
  return offered.includes("teacher") ? "teacher" : offered[0] ?? null;
}

/** Parent logins are custom-token users "parent_<familyId>" (backend logic/lessons.ts). */
export const isParentUid = (uid: string | null | undefined): boolean => !!uid && uid.startsWith("parent_");
