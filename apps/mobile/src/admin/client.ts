// The admin dashboard's backend: the real admin callables (services/api.ts), or the dev mock when the page is opened with
// ?mock=1 (or EXPO_PUBLIC_ADMIN_MOCK=1). The flag is read once at load (in-app navigation drops the query string).
import { adminApi } from "../services/api";
import type { AdminBackend } from "./types";
import { mockBackend } from "./mock";

export { friendlyError, isPermissionDenied } from "../teacher/client";

function readMock(): boolean {
  let v: string | null | undefined = process.env.EXPO_PUBLIC_ADMIN_MOCK;
  try {
    if (typeof window !== "undefined" && window.location?.search) v = new URLSearchParams(window.location.search).get("mock") ?? v;
  } catch { /* no window */ }
  return !!v && v !== "0";
}
export const ADMIN_MOCK = readMock();

const realBackend: AdminBackend = {
  getOverview: () => adminApi.getOverview(),
  saveTeacher: (email, name, uid) => adminApi.saveTeacher(email, name, uid),
  setTeacherActive: async (uid, active) => { await adminApi.setTeacherActive(uid, active); },
  resetPassword: async (uid) => (await adminApi.resetPassword(uid)).password,
  findUser: async (query) => (await adminApi.findUser(query)).users,
  setUserDisabled: async (uid, disabled) => { await adminApi.setUserDisabled(uid, disabled); },
  saveClass: (r) => adminApi.saveClass(r),
  deleteClass: async (classId) => { await adminApi.deleteClass(classId); },
  addStudent: async (classId, code) => (await adminApi.addStudent(classId, code)).student,
  removeStudent: async (classId, uid) => { await adminApi.removeStudent(classId, uid); },
};

export const backend: AdminBackend = ADMIN_MOCK ? mockBackend : realBackend;
