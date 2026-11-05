// The Admin area's backend: the classroom backend's admin* callables, or (?mock=1) a demo in localStorage.
import { MOCK_AREAS } from "../roles/mock";
import { adminApi } from "../services/api";
import type { AdminBackend } from "./types";
import { mockBackend } from "./mock";

export { friendlyError, isPermissionDenied } from "../services/errors";
export const ADMIN_MOCK = MOCK_AREAS;

const realBackend: AdminBackend = {
  getOverview: () => adminApi.getOverview(),
  saveTeacher: (name, email, uid) => adminApi.saveTeacher(name, email, uid),
  setTeacherActive: async (uid, active) => { await adminApi.setTeacherActive(uid, active); },
  resetAccessCode: async (uid) => (await adminApi.resetAccessCode(uid)).code,
};
export const backend: AdminBackend = ADMIN_MOCK ? mockBackend : realBackend;
