// The Admin area's backend: the classroom backend's admin* callables, or (?mock=1) a demo in localStorage.
import { MOCK_AREAS } from "../roles/mock";
import { adminApi } from "../services/api";
import type { AdminBackend } from "./types";
import { mockBackend } from "./mock";

export { friendlyError, isPermissionDenied } from "../services/errors";
export const ADMIN_MOCK = MOCK_AREAS;

const realBackend: AdminBackend = {
  getOverview: () => adminApi.getOverview(),
  saveTeacher: (email, name, uid) => adminApi.saveTeacher(email, name, uid),
  setTeacherActive: async (uid, active) => { await adminApi.setTeacherActive(uid, active); },
  resetPassword: async (uid) => (await adminApi.resetPassword(uid)).password,
};
export const backend: AdminBackend = ADMIN_MOCK ? mockBackend : realBackend;
