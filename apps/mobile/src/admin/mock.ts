// Dev mock for the admin dashboard (?mock=1 / EXPO_PUBLIC_ADMIN_MOCK=1): three teachers, five classes and a handful of
// logins, kept in memory and (web) in localStorage so every screen can be tried and screenshotted without the backend.
// Passwords it hands out are random placeholders and exist only in the mock.
import type { AdminClassRow, AdminUserRow, ClassStudent, Grade, TeacherDoc } from "@p6/shared";
import { CLASS_LIMITS } from "@p6/shared";
import { ApiError } from "../services/api";
import type { AdminBackend } from "./types";

const KEY = "p6.adminMock.v1";
const ADMIN = { uid: "a-mock", name: "Owner", email: "owner@example.sg", active: true, createdAt: 0 };

interface MockUser extends Omit<AdminUserRow, "classIds"> { teacherUidFor?: string }
interface State { teachers: TeacherDoc[]; classes: AdminClassRow[]; users: MockUser[]; seq: number }

function seed(now: number): State {
  const day = 86_400_000;
  const teachers: TeacherDoc[] = [
    { uid: "t1", name: "Ms Tan", email: "ms.tan@example.sg", active: true, createdAt: now - 80 * day },
    { uid: "t2", name: "Mr Lim", email: "mr.lim@example.sg", active: true, createdAt: now - 60 * day },
    { uid: "t3", name: "Mdm Rahim", email: "mdm.rahim@example.sg", active: false, createdAt: now - 40 * day },
  ];
  const st = (uid: string, displayName: string): ClassStudent => ({ uid, displayName });
  const mkClass = (id: string, name: string, grade: Grade, t: TeacherDoc, students: ClassStudent[], age: number): AdminClassRow =>
    ({ id, name, grade, teacherUid: t.uid, teacherName: t.name, students, createdAt: now - age * day });
  const classes: AdminClassRow[] = [
    mkClass("c1", "6 Courage", "P6", teachers[0], [st("s1", "Aisha Rahman"), st("s2", "Zach Lim"), st("s3", "Mei Ling Tan"), st("s4", "Daniel Ong")], 70),
    mkClass("c2", "6 Honesty", "P6", teachers[0], [st("s5", "Priya Nair"), st("s6", "Ethan Goh")], 55),
    mkClass("c3", "5 Grace", "P5", teachers[1], [st("s7", "Sofia Chen")], 50),
    mkClass("c4", "6 Integrity", "P6", teachers[1], [], 30),
    mkClass("c5", "4 Harmony", "P4", teachers[2], [st("s8", "Hakim Yusof")], 25),
  ];
  const u = (uid: string, displayName: string, email: string | undefined, providers: string[], friendCode: string | undefined, extra: Partial<MockUser> = {}): MockUser =>
    ({ uid, displayName, email, providers, friendCode, grade: "P6", disabled: false, isTeacher: false, createdAt: now - 40 * day, lastSignInAt: now - 2 * day, ...extra });
  const users: MockUser[] = [
    u("s1", "Aisha Rahman", "aisha.r@example.com", ["password"], "AISHA123"),
    u("s2", "Zach Lim", "zach.lim@example.com", ["google.com"], "ZACH2026"),
    u("s3", "Mei Ling Tan", "meiling@example.com", ["password"], "MEILING7"),
    u("s4", "Daniel Ong", "daniel.o@example.com", ["password"], "DANIEL42", { disabled: true }),
    u("s5", "Priya Nair", "priya.n@example.com", ["google.com"], "PRIYA555"),
    u("s6", "Ethan Goh", "ethan.g@example.com", ["password"], "ETHAN808"),
    u("s7", "Sofia Chen", "sofia.c@example.com", ["password"], "SOFIA909", { grade: "P5" }),
    u("s8", "Hakim Yusof", "hakim.y@example.com", ["password"], "HAKIM404", { grade: "P4" }),
    u("s9", "Lena Foo", "lena.foo@example.com", ["password", "google.com"], "LENA0001", { lastSignInAt: now - 20 * 60_000 }),
    u("s10", "Guest Player", undefined, ["anonymous"], "GUEST999", { lastSignInAt: now - 9 * day }),
    u("t1", "Ms Tan", "ms.tan@example.sg", ["password"], undefined, { isTeacher: true, teacherActive: true, grade: undefined, createdAt: now - 80 * day }),
    u("t2", "Mr Lim", "mr.lim@example.sg", ["password"], undefined, { isTeacher: true, teacherActive: true, grade: undefined, createdAt: now - 60 * day }),
    u("t3", "Mdm Rahim", "mdm.rahim@example.sg", ["password"], undefined, { isTeacher: true, teacherActive: false, disabled: true, grade: undefined, createdAt: now - 40 * day }),
  ];
  return { teachers, classes, users, seq: 100 };
}

let state: State | null = null;
function save() { try { if (typeof localStorage !== "undefined" && state) localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
function load(): State {
  if (state) return state;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) { state = JSON.parse(raw) as State; return state; }
  } catch { /* no storage */ }
  state = seed(Date.now());
  save();
  return state;
}
const wait = <T>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const klass = (id: string) => { const c = load().classes.find((x) => x.id === id); if (!c) throw new ApiError("not-found", "Class not found"); return c; };
const teacher = (uid: string) => { const t = load().teachers.find((x) => x.uid === uid); if (!t) throw new ApiError("not-found", "Teacher not found"); return t; };
const user = (uid: string) => { const x = load().users.find((y) => y.uid === uid); if (!x) throw new ApiError("not-found", "User not found"); return x; };
const row = (u: MockUser): AdminUserRow => ({ ...u, classIds: load().classes.filter((c) => c.students.some((s) => s.uid === u.uid)).map((c) => c.id) });
function fakePassword(): string {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += a[Math.floor(Math.random() * a.length)];
  return out;
}

export const mockBackend: AdminBackend = {
  getOverview: () => wait({ admin: ADMIN, teachers: clone(load().teachers), classes: clone(load().classes) }),
  async saveTeacher(email, name, uid) {
    const s = load();
    if (uid) {
      const t = s.teachers.find((x) => x.uid === uid);
      if (!t) throw new ApiError("not-found", "No such teacher.");
      if (!name.trim()) throw new ApiError("invalid-argument", "Name and email are required");
      t.name = name.trim();
      s.classes.forEach((c) => { if (c.teacherUid === uid) c.teacherName = t.name; });
      save();
      return wait({ teacher: clone(t) });
    }
    const e = email.trim().toLowerCase();
    if (!name.trim() || !e) throw new ApiError("invalid-argument", "Name and email are required");
    const have = s.teachers.find((t) => t.email.toLowerCase() === e);
    if (have) {
      have.name = name.trim();
      s.classes.forEach((c) => { if (c.teacherUid === have.uid) c.teacherName = have.name; });
      save();
      return wait({ teacher: clone(have) });
    }
    const existing = s.users.find((x) => x.email?.toLowerCase() === e);
    if (existing?.disabled) throw new ApiError("failed-precondition", "Enable this login first");
    const t: TeacherDoc = { uid: existing?.uid ?? `t${++s.seq}`, name: name.trim(), email: e, active: true, createdAt: Date.now() };
    s.teachers.push(t);
    if (existing) { existing.isTeacher = true; existing.teacherActive = true; save(); return wait({ teacher: clone(t) }); }
    s.users.push({ uid: t.uid, displayName: t.name, email: e, providers: ["password"], disabled: false, isTeacher: true, teacherActive: true, createdAt: Date.now() });
    save();
    return wait({ teacher: clone(t), password: fakePassword() });
  },
  async setTeacherActive(uid, active) {
    const t = teacher(uid); t.active = active;
    const u = load().users.find((x) => x.uid === uid); if (u) { u.teacherActive = active; u.disabled = !active; }
    save(); await wait(0);
  },
  async resetPassword(uid) {
    const u = user(uid);
    if (!u.providers.includes("password")) throw new ApiError("failed-precondition", "This account signs in with Google, so it has no password to reset.");
    return wait(fakePassword());
  },
  async findUser(query) {
    const q = query.trim().toLowerCase();
    return wait(load().users.filter((u) => u.uid.toLowerCase() === q || u.email?.toLowerCase() === q || u.friendCode?.toLowerCase() === q).slice(0, 5).map(row));
  },
  async setUserDisabled(uid, disabled) { user(uid).disabled = disabled; save(); await wait(0); },
  async saveClass(r) {
    const s = load();
    if (!r.name.trim()) throw new ApiError("invalid-argument", "Give the class a name");
    const t = teacher(r.teacherUid);
    if (r.id) { const c = klass(r.id); c.name = r.name.trim(); c.grade = r.grade; c.teacherUid = t.uid; c.teacherName = t.name; save(); return wait({ classId: r.id }); }
    const id = `c${++s.seq}`;
    s.classes.push({ id, name: r.name.trim(), grade: r.grade, teacherUid: t.uid, teacherName: t.name, students: [], createdAt: Date.now() });
    save();
    return wait({ classId: id });
  },
  async deleteClass(classId) { const s = load(); klass(classId); s.classes = s.classes.filter((c) => c.id !== classId); save(); await wait(0); },
  async addStudent(classId, code) {
    const c = klass(classId);
    const u = load().users.find((x) => x.friendCode?.toLowerCase() === code.trim().toLowerCase());
    if (!u) throw new ApiError("not-found", "No student has that friend code.");
    if (c.students.some((x) => x.uid === u.uid)) throw new ApiError("already-exists", "That student is already in this class.");
    if (c.students.length >= CLASS_LIMITS.maxStudents) throw new ApiError("failed-precondition", "A class holds at most 60 students.");
    const student: ClassStudent = { uid: u.uid, displayName: u.displayName };
    c.students.push(student); save();
    return wait(clone(student));
  },
  async removeStudent(classId, uid) { const c = klass(classId); c.students = c.students.filter((s) => s.uid !== uid); save(); await wait(0); },
};
