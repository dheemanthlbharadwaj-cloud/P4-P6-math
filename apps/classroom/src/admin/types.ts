// Request/response types of the admin callables (packages/shared/src/admin.ts, "Callables"), and the backend interface
// the dashboard talks to (real callables or the dev mock).
import type { AdminClassRow, AdminDoc, AdminUserRow, ClassStudent, Grade, TeacherDoc } from "@p6/shared";

export interface AdminOverview { admin: AdminDoc; teachers: TeacherDoc[]; classes: AdminClassRow[] }
export interface SaveAdminClassReq { id?: string; name: string; grade: Grade; teacherUid: string }

export interface AdminBackend {
  getOverview(): Promise<AdminOverview>;
  /** `password` is present only when a new login was created. With `uid` it only renames that teacher (never creates a login). */
  saveTeacher(email: string, name: string, uid?: string): Promise<{ teacher: TeacherDoc; password?: string }>;
  setTeacherActive(uid: string, active: boolean): Promise<void>;
  resetPassword(uid: string): Promise<string>;
  findUser(query: string): Promise<AdminUserRow[]>;
  setUserDisabled(uid: string, disabled: boolean): Promise<void>;
  saveClass(r: SaveAdminClassReq): Promise<{ classId: string }>;
  deleteClass(classId: string): Promise<void>;
  addStudent(classId: string, friendCode: string): Promise<ClassStudent>;
  removeStudent(classId: string, studentUid: string): Promise<void>;
}
