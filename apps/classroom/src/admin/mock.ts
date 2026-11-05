// Demo admin backend (?mock=1): teachers in localStorage "p6c.adminMock.v2". Access codes are made up and shown once, like the real ones.
import type { TeacherDoc } from "@p6/shared";
import { ApiError } from "../services/api";
import { readLocal, writeLocal } from "../store/storage";
import type { AdminBackend } from "./types";

const KEY = "p6c.adminMock.v2";
const ME: TeacherDoc = { uid: "mock-teacher", name: "Teacher Lisa", email: "lisa@example.sg", active: true, createdAt: Date.now() - 40 * 86_400_000 };
const seed = (): TeacherDoc[] => [ME, { uid: "mock-t2", name: "Teacher Tom", email: "tom@example.sg", active: true, createdAt: Date.now() - 9 * 86_400_000 }];
const load = (): TeacherDoc[] => { try { const s = readLocal(KEY); if (s) return JSON.parse(s) as TeacherDoc[]; } catch { /* reseed */ } return seed(); };
const save = (t: TeacherDoc[]) => writeLocal(KEY, JSON.stringify(t));
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
const code = () => Array.from({ length: 12 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

export const mockBackend: AdminBackend = {
  getOverview: () => wait({ admin: ME, teachers: load() }),
  async saveTeacher(name, email, uid) {
    const all = load();
    if (uid) { const t = all.find((x) => x.uid === uid); if (!t) throw new ApiError("not-found", "No such teacher."); const n = { ...t, name }; save(all.map((x) => (x.uid === uid ? n : x))); return wait({ teacher: n }); }
    const teacher: TeacherDoc = { uid: Math.random().toString(36).slice(2, 10), name, email: (email ?? "").toLowerCase(), active: true, createdAt: Date.now() };
    save([...all, teacher]);
    return wait({ teacher, code: code() });
  },
  async setTeacherActive(uid, active) { save(load().map((t) => (t.uid === uid ? { ...t, active } : t))); await wait(null); },
  resetAccessCode: () => wait(code()),
};
