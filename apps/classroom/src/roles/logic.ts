// Pure rules for the Classroom areas (no React, no network; tested in logic.test.ts).
import type { MyRoles } from "@p6/shared";

export type Area = "student" | "teacher" | "admin";
export const AREAS: { id: Area; label: string; blurb: string }[] = [
  { id: "student", label: "Student", blurb: "Your class news, tests from your teacher and homework." },
  { id: "teacher", label: "Teacher", blurb: "Classes, posts, worksheets and printing, marking and analytics." },
  { id: "admin", label: "Admin", blurb: "Teachers, every class and logins." },
];

export type RolesPhase = "idle" | "loading" | "ready" | "unknown";

/** The areas to offer: Student always; Teacher / Admin when the login has them (all of them when unknown). */
export function areasFor(phase: RolesPhase, roles: MyRoles): Area[] {
  if (phase === "unknown") return ["student", "teacher", "admin"];
  return ["student", ...(roles.teacher ? ["teacher" as const] : []), ...(roles.admin ? ["admin" as const] : [])];
}

/** Where to go straight after sign-in: the last area used (if still allowed), else the only / highest area. null = ask. */
export function startArea(offered: readonly Area[], last: Area | null, known: boolean): Area | null {
  if (last && offered.includes(last)) return last;
  if (!known) return null;
  if (offered.length === 1) return offered[0];
  return null;
}

