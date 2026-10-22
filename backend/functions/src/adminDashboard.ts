// Admin (owner) dashboard backend (contract: packages/shared/src/admin.ts). Admins are Auth users of the STUDENT project with an
// admins/{uid} doc (backend/scripts/add-admin.mjs). Named adminDashboard.ts because src/admin.ts is the Firebase Admin SDK setup.
// Class and roster work is NOT copied from the teacher callables: it reuses the helpers exported by classroom.ts
// (deleteClassCascade, addStudentToClassByCode, removeStudentFromClass, touchClass, ...), just without the ownership check.
//
// Reads per call (Firestore documents; Auth lookups are not Firestore reads). Caches are per server instance (TtlCache).
// ┌──────────────────────────┬──────────────────────────────────────────────┬───────────────────────────────────────────┐
// │ call                     │ cold                                         │ warm                                      │
// ├──────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────┤
// │ (every call) requireAdmin│ 1 admins/{uid}                               │ 0 (60 s)                                  │
// │ adminGetOverview         │ 1 + all teachers + all classes               │ 0 (60 s; every admin write clears it)     │
// │ adminSaveTeacher         │ 1 + 1 teacher doc (+ Auth lookup/create)     │ 1 teacher doc                             │
// │ adminSetTeacherActive    │ 1 + 1 teacher doc (+ Auth update)            │ 1 teacher doc                             │
// │ adminResetPassword       │ 1 (+ Auth lookup/update)                     │ 0                                         │
// │ adminFindUser            │ 1 + (friend code: 1 code doc) + 1 user       │ 1 user + 1 teacher doc (+ friend code)    │
// │                          │ + 1 teacher doc                              │                                           │
// │ adminSetUserDisabled     │ 1 (+ Auth update)                            │ 0                                         │
// │ adminSaveClass           │ new: 1 + 1 teacher + N classes of that       │ new: 1 teacher + 0 (limit cached 60 s);   │
// │                          │ teacher (limit); edit: 1 + 1 class           │ edit: 1 class (+ 1 teacher, + N when moved)│
// │ adminDeleteClass         │ 1 + 1 class + docs deleted (posts, tasks, …) │ same                                      │
// │ adminAddStudent          │ 1 + 1 class + 1 friend code + 1 user + 1 txn │ same                                      │
// │ adminRemoveStudent       │ 1 + 1 class + 1 txn                          │ same                                      │
// │ (every write) adminLog   │ 1 write                                      │ 1 write                                   │
// └──────────────────────────┴──────────────────────────────────────────────┴───────────────────────────────────────────┘
// There is deliberately no "list all users" call.
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  ADMIN_LIMITS, type AdminClassRow, type AdminDoc, type AdminLogEntry, type AdminUserRow, type ClassDoc, type ClassStudent, type TeacherDoc,
} from "./shared/index.js";
import { auth, col, db, requireUid, throwFail } from "./admin.js";
import {
  addStudentToClassByCode, classRef, deleteClassCascade, forgetTeacher, removeStudentFromClass, teacherClasses, touchClass, userRef,
} from "./classroom.js";
import { MAX_CLASSES_PER_TEACHER, validId } from "./logic/classroom.js";
import { TtlCache } from "./logic/ttlCache.js";
import {
  buildUserRow, checkAdmin, checkAssignableTeacher, checkNotSelf, hasPasswordLogin, logDetail, makePassword, parseUserQuery, validateAdminSaveClass,
  validateSaveTeacher, validateUidFlag,
} from "./logic/admin.js";

const obj = (v: unknown): Record<string, unknown> => ((v && typeof v === "object" ? v : {}) as Record<string, unknown>);
const idOf = (v: unknown, what: string): string => {
  if (!validId(v)) throw new HttpsError("invalid-argument", `bad ${what}`);
  return v;
};

const teacherRef = (uid: string) => db.collection(col.teachers).doc(uid);

// ---------------------------------------------------------------- access
const adminCache = new TtlCache<AdminDoc | null>(60_000, 50);
const overviewCache = new TtlCache<{ teachers: TeacherDoc[]; classes: ClassDoc[] }>(60_000, 2);

async function requireAdmin(req: Parameters<typeof requireUid>[0]): Promise<{ uid: string; admin: AdminDoc }> {
  const uid = requireUid(req);
  let a = adminCache.get(uid);
  if (a === undefined) {
    const snap = await db.collection(col.admins).doc(uid).get();
    a = snap.exists ? ({ ...(snap.data() as AdminDoc), uid }) : null;
    adminCache.set(uid, a);
  }
  const ok = checkAdmin(a);
  if (!ok.ok) throwFail(ok);
  return { uid, admin: a! };
}

/** Appends one adminLog doc. A failure to log is reported on the server but never undoes or fails the change that already happened. */
async function logAdmin(adminUid: string, action: string, target: string, detail?: string): Promise<void> {
  const entry: AdminLogEntry = { at: Date.now(), adminUid, action, target, ...(detail ? { detail: logDetail(detail) } : {}) };
  try {
    await db.collection(col.adminLog).add(entry);
  } catch (e) {
    console.error("adminLog write failed", action, e);
  }
}

// ---------------------------------------------------------------- Auth helpers (never log passwords)
const authCode = (e: unknown) => (e as { code?: string }).code ?? "";
async function authUserByEmail(email: string) {
  try { return await auth.getUserByEmail(email); } catch (e) {
    if (authCode(e) === "auth/user-not-found") return null;
    if (authCode(e) === "auth/invalid-email") throw new HttpsError("invalid-argument", "That is not a valid email address.");
    throw e;
  }
}
async function authUserById(uid: string) {
  try { return await auth.getUser(uid); } catch (e) {
    if (authCode(e) === "auth/user-not-found") return null;
    throw e;
  }
}
async function mustAuthUser(uid: string) {
  const u = await authUserById(uid);
  if (!u) throw new HttpsError("not-found", "No such login.");
  return u;
}
/** Class read straight from Firestore (1 read): roster changes must start from the real roster, not a cached copy. */
async function freshClass(classId: unknown): Promise<ClassDoc> {
  const id = idOf(classId, "classId");
  const snap = await classRef(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "No such class.");
  return snap.data() as ClassDoc;
}
async function teacherDoc(uid: string): Promise<TeacherDoc | null> {
  const snap = await teacherRef(uid).get();
  return snap.exists ? ({ ...(snap.data() as TeacherDoc), uid }) : null;
}
const touchOverview = () => overviewCache.clear();

// ================================================================ overview
export const adminGetOverview = onCall(async (req): Promise<{ admin: AdminDoc; teachers: TeacherDoc[]; classes: AdminClassRow[] }> => {
  const { admin } = await requireAdmin(req);
  let data = overviewCache.get("all");
  if (!data) {
    const [t, c] = await Promise.all([db.collection(col.teachers).limit(1000).get(), db.collection(col.classes).limit(2000).get()]);
    data = {
      teachers: t.docs.map((d) => ({ ...(d.data() as TeacherDoc), uid: d.id })).sort((a, b) => a.name.localeCompare(b.name)),
      classes: c.docs.map((d) => d.data() as ClassDoc).sort((a, b) => a.createdAt - b.createdAt),
    };
    overviewCache.set("all", data);
  }
  const names = new Map(data.teachers.map((t) => [t.uid, t.name] as const));
  return { admin, teachers: data.teachers, classes: data.classes.map((c) => ({ ...c, teacherName: names.get(c.teacherUid) ?? "" })) };
});

// ================================================================ teachers
export const adminSaveTeacher = onCall(async (req): Promise<{ teacher: TeacherDoc; password?: string }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const v = validateSaveTeacher(req.data);
  if (!v.ok) throwFail(v);
  const existing = await authUserByEmail(v.email);
  let uid: string;
  let password: string | undefined;
  if (existing) {
    uid = existing.uid;
  } else {
    password = makePassword();
    try {
      uid = (await auth.createUser({ email: v.email, password, displayName: v.name, emailVerified: true })).uid;
    } catch (e) {
      if (authCode(e) === "auth/email-already-exists") throw new HttpsError("already-exists", "That email already has a login.");
      if (authCode(e) === "auth/invalid-email") throw new HttpsError("invalid-argument", "That is not a valid email address.");
      throw e;
    }
  }
  const cur = await teacherDoc(uid);
  const teacher: TeacherDoc = { uid, name: v.name, email: v.email, active: cur ? cur.active : true, createdAt: cur?.createdAt ?? Date.now() };
  try {
    await teacherRef(uid).set(teacher);
  } catch (e) {
    if (password) await auth.deleteUser(uid).catch(() => undefined); // don't leave a login with no teacher record behind
    throw e;
  }
  forgetTeacher(uid);
  touchOverview();
  await logAdmin(adminUid, cur ? "teacher.rename" : password ? "teacher.create" : "teacher.promote", uid, `${v.email} ${v.name}`);
  return { teacher, ...(password ? { password } : {}) };
});

export const adminSetTeacherActive = onCall(async (req): Promise<{ ok: true }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const v = validateUidFlag(req.data, "active");
  if (!v.ok) throwFail(v);
  const self = checkNotSelf(adminUid, v.uid);
  if (!self.ok) throwFail(self);
  if (!(await teacherDoc(v.uid))) throw new HttpsError("not-found", "No such teacher.");
  await mustAuthUser(v.uid);
  await teacherRef(v.uid).update({ active: v.value });
  await auth.updateUser(v.uid, { disabled: !v.value });
  if (!v.value) await auth.revokeRefreshTokens(v.uid);
  forgetTeacher(v.uid);
  touchOverview();
  await logAdmin(adminUid, v.value ? "teacher.enable" : "teacher.disable", v.uid);
  return { ok: true };
});

export const adminResetPassword = onCall(async (req): Promise<{ password: string }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const uid = idOf(obj(req.data).uid, "uid");
  const user = await mustAuthUser(uid);
  if (!hasPasswordLogin(user.providerData.map((p) => p.providerId))) {
    throw new HttpsError("failed-precondition", "This account signs in with Google, it has no password to reset.");
  }
  const password = makePassword();
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  await logAdmin(adminUid, "user.resetPassword", uid); // the password itself is never logged
  return { password };
});

// ================================================================ users
export const adminFindUser = onCall(async (req): Promise<{ users: AdminUserRow[] }> => {
  await requireAdmin(req);
  const q = parseUserQuery(obj(req.data).query);
  if (!q.ok) throwFail(q);
  const { kind, value } = q.query;
  let uid: string | null = null;
  let record = null;
  if (kind === "friendCode") {
    const snap = await db.collection(col.friendCodes).doc(value).get();
    uid = snap.exists ? ((snap.data()?.uid as string | undefined) ?? null) : null;
    if (uid) record = await authUserById(uid);
  } else if (kind === "email") {
    record = await authUserByEmail(value);
  } else {
    record = await authUserById(value);
  }
  if (!record) return { users: [] };
  const [u, t] = await Promise.all([userRef(record.uid).get(), teacherRef(record.uid).get()]);
  const row = buildUserRow(record, u.data(), t.exists ? (t.data() as Partial<TeacherDoc>) : undefined);
  return { users: [row].slice(0, ADMIN_LIMITS.findResults) };
});

export const adminSetUserDisabled = onCall(async (req): Promise<{ ok: true }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const v = validateUidFlag(req.data, "disabled");
  if (!v.ok) throwFail(v);
  const self = checkNotSelf(adminUid, v.uid);
  if (!self.ok) throwFail(self);
  await mustAuthUser(v.uid);
  await auth.updateUser(v.uid, { disabled: v.value });
  if (v.value) await auth.revokeRefreshTokens(v.uid);
  await logAdmin(adminUid, v.value ? "user.disable" : "user.enable", v.uid);
  return { ok: true };
});

// ================================================================ classes
export const adminSaveClass = onCall(async (req): Promise<{ classId: string }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const v = validateAdminSaveClass(req.data);
  if (!v.ok) throwFail(v);

  const assignTo = async () => {
    const t = await teacherDoc(v.teacherUid);
    const ok = checkAssignableTeacher(t);
    if (!ok.ok) throwFail(ok);
    if ((await teacherClasses(v.teacherUid)).length >= MAX_CLASSES_PER_TEACHER) {
      throw new HttpsError("failed-precondition", `A teacher can have at most ${MAX_CLASSES_PER_TEACHER} classes.`);
    }
    return t!;
  };

  if (v.id) {
    const cur = await freshClass(v.id);
    if (cur.grade !== v.grade) throw new HttpsError("failed-precondition", "A class's grade can't be changed.");
    const moved = cur.teacherUid !== v.teacherUid;
    const patch: Record<string, unknown> = { name: v.name };
    if (moved) {
      patch.teacherName = (await assignTo()).name;
      patch.teacherUid = v.teacherUid;
    }
    await classRef(cur.id).update(patch);
    touchClass({ ...cur, students: cur.students });
    if (moved) touchClass({ id: cur.id, teacherUid: v.teacherUid });
    touchOverview();
    await logAdmin(adminUid, moved ? "class.move" : "class.rename", cur.id, moved ? `${cur.teacherUid} -> ${v.teacherUid}; ${v.name}` : v.name);
    return { classId: cur.id };
  }
  const teacher = await assignTo();
  const id = db.collection(col.classes).doc().id;
  const doc: ClassDoc & { teacherName: string } = { id, name: v.name, grade: v.grade, teacherUid: v.teacherUid, students: [], createdAt: Date.now(), teacherName: teacher.name };
  await classRef(id).create(doc);
  touchClass(doc);
  touchOverview();
  await logAdmin(adminUid, "class.create", id, `${v.name} (${v.grade}) for ${v.teacherUid}`);
  return { classId: id };
});

export const adminDeleteClass = onCall(async (req): Promise<{ ok: true }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const cls = await freshClass(obj(req.data).classId);
  await deleteClassCascade(cls);
  touchOverview();
  await logAdmin(adminUid, "class.delete", cls.id, `${cls.name}, ${cls.students.length} students`);
  return { ok: true };
});

export const adminAddStudent = onCall(async (req): Promise<{ student: ClassStudent }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const d = obj(req.data);
  const cls = await freshClass(d.classId);
  const student = await addStudentToClassByCode(cls, d.friendCode);
  touchOverview();
  await logAdmin(adminUid, "class.addStudent", cls.id, student.uid);
  return { student };
});

export const adminRemoveStudent = onCall(async (req): Promise<{ ok: true }> => {
  const { uid: adminUid } = await requireAdmin(req);
  const d = obj(req.data);
  const cls = await freshClass(d.classId);
  const studentUid = idOf(d.studentUid, "studentUid");
  await removeStudentFromClass(cls, studentUid);
  touchOverview();
  await logAdmin(adminUid, "class.removeStudent", cls.id, studentUid);
  return { ok: true };
});
