// The owner's Admin area: teacher accounts of Catapult Classroom (callables admin* in packages/shared/src/lessons.ts).
import type { TeacherDoc } from "@p6/shared";

export interface AdminOverview { admin: TeacherDoc; teachers: TeacherDoc[] }
export interface AdminBackend {
  getOverview(): Promise<AdminOverview>;
  /** A new teacher (no uid): email is optional and a new access `code` (raw, shown once) always comes back. With `uid` it only renames that teacher. */
  saveTeacher(name: string, email?: string, uid?: string): Promise<{ teacher: TeacherDoc; code?: string }>;
  setTeacherActive(uid: string, active: boolean): Promise<void>;
  /** A new access code (raw); the old one stops working. */
  resetAccessCode(uid: string): Promise<string>;
}
