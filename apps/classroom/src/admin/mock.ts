// Demo admin backend (?mock=1): teachers in localStorage "p6c.adminMock.v2". Passwords are made up and shown once, like the real one.
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
const pw = () => Array.from({ length: 16 }, () => "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 55)]).join("");

export const mockBackend: AdminBackend = {
  getOverview: () => wait({ admin: ME, teachers: load() }),
  async saveTeacher(email, name, uid) {
    const all = load();
    if (uid) { const t = all.find((x) => x.uid === uid); if (!t) throw new ApiError("not-found", "No such teacher."); const n = { ...t, name }; save(all.map((x) => (x.uid === uid ? n : x))); return wait({ teacher: n }); }
    const old = all.find((x) => x.email === email.toLowerCase());
    const teacher: TeacherDoc = old ? { ...old, name, active: true } : { uid: Math.random().toString(36).slice(2, 10), name, email: email.toLowerCase(), active: true, createdAt: Date.now() };
    save([...all.filter((x) => x.uid !== teacher.uid), teacher]);
    return wait({ teacher, ...(old ? {} : { password: pw() }) });
  },
  async setTeacherActive(uid, active) { save(load().map((t) => (t.uid === uid ? { ...t, active } : t))); await wait(null); },
  resetPassword: () => wait(pw()),
};
