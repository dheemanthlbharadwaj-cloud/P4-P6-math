// Pure rules for the Classroom areas (no React, no network; tested in logic.test.ts). Teachers and admins share ONE staff
// area (/teacher; admins also get a Teachers menu item there). Parents sign in with their family code and only ever see
// /parent (the staff area is never shown to them).
import type { MyRoles } from "@p6/shared";

export type Area = "teacher";

export type RolesPhase = "idle" | "loading" | "ready" | "unknown";

/** The staff area to offer: Teacher for any teacher or admin, and while the roles are unknown (the area checks access itself). */
export function areasFor(phase: RolesPhase, roles: MyRoles): Area[] {
  if (phase === "unknown") return ["teacher"];
  return roles.teacher || roles.admin ? ["teacher"] : [];
}

/** Parent logins are custom-token users "parent_<familyId>" (backend logic/lessons.ts). */
export const isParentUid = (uid: string | null | undefined): boolean => !!uid && uid.startsWith("parent_");
