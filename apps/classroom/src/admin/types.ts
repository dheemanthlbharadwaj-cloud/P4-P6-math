// The owner's Admin area: teacher accounts of Catapult Classroom (callables admin* in packages/shared/src/lessons.ts).
import type { TeacherDoc } from "@p6/shared";

export interface AdminOverview { admin: TeacherDoc; teachers: TeacherDoc[] }
export interface AdminBackend {
  getOverview(): Promise<AdminOverview>;
  /** `password` only when a new login was created. With `uid` it only renames that teacher. */
  saveTeacher(email: string, name: string, uid?: string): Promise<{ teacher: TeacherDoc; password?: string }>;
  setTeacherActive(uid: string, active: boolean): Promise<void>;
  resetPassword(uid: string): Promise<string>;
}
