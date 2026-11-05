// Staff: roles, teacher records and the owner's admin calls (Admin > Teachers). Admins are made only by
// scripts/add-admin.mjs. Reads: requireStaff / getMyRoles = teachers/{uid} + admins/{uid}, both cached 60 s per instance;
// adminGetOverview = all teachers; adminSaveTeacher = 1 teacher doc (+ Auth, + 1 code query and write); the others 1 doc (+ Auth).
import { auth, col, db } from "./firebase.js";
import { HttpsError, onCall, requireUid, throwFail, type CallableRequest } from "./errors.js";
import { TtlCache } from "./logic/ttlCache.js";
import { checkAdmin, makeStaffCode, rolesOf, staffCodeDocId, validateTeacher, type StaffDoc } from "./logic/staff.js";
import { staffOf } from "./logic/lessons.js";
import type { MyRoles } from "./shared/index.js";

const teacherCache = new TtlCache<StaffDoc | null>(60_000, 200);
const adminCache = new TtlCache<StaffDoc | null>(60_000, 50);
async function record(c: TtlCache<StaffDoc | null>, collection: string, uid: string): Promise<StaffDoc | null> {
  let r = c.get(uid);
  if (r === undefined) {
    const snap = await db.collection(collection).doc(uid).get();
    r = snap.exists ? ({ ...(snap.data() as StaffDoc), uid }) : null;
    c.set(uid, r);
  }
  return r;
}
export const teacherRecord = (uid: string) => record(teacherCache, col.teachers, uid);
export const adminRecord = (uid: string) => record(adminCache, col.admins, uid);

/** Gives a teacher / admin a NEW access code (the old one stops working: one code per uid). Returns the raw 12 characters. */
export async function issueStaffCode(uid: string): Promise<string> {
  const old = await db.collection(col.staffCodes).where("uid", "==", uid).get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));
  for (;;) {
    const code = makeStaffCode();
    try { await db.collection(col.staffCodes).doc(staffCodeDocId(code)).create({ uid, createdAt: Date.now() }); return code; }
    catch (e) { if ((e as { code?: number }).code !== 6) throw e; } // 6 = ALREADY_EXISTS: draw another code
  }
}

export type Staff = { uid: string; admin: boolean };
/** An active teacher (own families) or admin (everything). */
export async function requireStaff(req: CallableRequest): Promise<Staff> {
  const uid = requireUid(req);
  const [t, a] = await Promise.all([teacherRecord(uid), adminRecord(uid)]);
  const ok = staffOf(t, a);
  if (!ok.ok) throwFail(ok);
  return { uid, admin: ok.admin };
}
async function requireAdmin(req: CallableRequest): Promise<{ uid: string; admin: StaffDoc }> {
  const uid = requireUid(req);
  const a = await adminRecord(uid);
  const ok = checkAdmin(a);
  if (!ok.ok) throwFail(ok);
  return { uid, admin: a! };
}
async function log(adminUid: string, action: string, target: string) {
  try { await db.collection(col.adminLog).add({ at: Date.now(), adminUid, action, target }); } catch (e) { console.error("adminLog write failed", action, e); }
}
const obj = (v: unknown) => ((v && typeof v === "object" ? v : {}) as Record<string, unknown>);
const authCode = (e: unknown) => (e as { code?: string }).code ?? "";

export const getMyRoles = onCall(async (req): Promise<MyRoles> => {
  const uid = requireUid(req);
  const [t, a] = await Promise.all([teacherRecord(uid), adminRecord(uid)]);
  return rolesOf(t, a);
});

export const adminGetOverview = onCall(async (req): Promise<{ admin: StaffDoc; teachers: StaffDoc[] }> => {
  const { admin } = await requireAdmin(req);
  const teachers = (await db.collection(col.teachers).get()).docs.map((d) => ({ ...(d.data() as StaffDoc), uid: d.id })).sort((a, b) => a.name.localeCompare(b.name));
  return { admin, teachers };
});

export const adminSaveTeacher = onCall(async (req): Promise<{ teacher: StaffDoc; code?: string }> => {
  const { uid: me } = await requireAdmin(req);
  const v = validateTeacher(req.data);
  if (!v.ok) throwFail(v);
  if (v.uid) { // rename only: never creates or promotes a login, no code
    const ref = db.collection(col.teachers).doc(v.uid);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "No such teacher.");
    await ref.update({ name: v.name });
    teacherCache.delete(v.uid);
    await log(me, "renameTeacher", v.uid);
    return { teacher: { ...(snap.data() as StaffDoc), uid: v.uid, name: v.name } };
  }
  // an existing login with that email is reused; otherwise a login WITHOUT a password (staff sign in with their access code)
  let user = v.email ? await auth.getUserByEmail(v.email).catch((e) => { if (authCode(e) === "auth/user-not-found") return null; throw e; }) : null;
  if (user?.disabled) throw new HttpsError("failed-precondition", "That login is disabled. Enable it first.");
  if (!user) user = await auth.createUser({ displayName: v.name, ...(v.email ? { email: v.email } : {}) });
  const ref = db.collection(col.teachers).doc(user.uid);
  const old = (await ref.get()).data() as StaffDoc | undefined;
  const teacher: StaffDoc = { uid: user.uid, name: v.name, email: v.email, active: true, createdAt: old?.createdAt ?? Date.now() };
  await ref.set(teacher);
  teacherCache.delete(user.uid);
  const code = await issueStaffCode(user.uid);
  await log(me, "saveTeacher", user.uid);
  return { teacher, code };
});

export const adminSetTeacherActive = onCall(async (req): Promise<{ ok: true }> => {
  const { uid: me } = await requireAdmin(req);
  const d = obj(req.data);
  const uid = typeof d.uid === "string" ? d.uid : "";
  if (!uid || typeof d.active !== "boolean") throw new HttpsError("invalid-argument", "bad request");
  if (uid === me) throw new HttpsError("failed-precondition", "You can't switch off your own account.");
  const ref = db.collection(col.teachers).doc(uid);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "No such teacher.");
  await ref.update({ active: d.active });
  teacherCache.delete(uid);
  await auth.updateUser(uid, { disabled: !d.active });
  if (!d.active) await auth.revokeRefreshTokens(uid);
  await log(me, d.active ? "enableTeacher" : "disableTeacher", uid);
  return { ok: true };
});

export const adminResetAccessCode = onCall(async (req): Promise<{ code: string }> => {
  const { uid: me } = await requireAdmin(req);
  const uid = String(obj(req.data).uid ?? "");
  if (!uid || !(await db.collection(col.teachers).doc(uid).get()).exists) throw new HttpsError("not-found", "No such teacher.");
  if (uid !== me && (await adminRecord(uid))) throw new HttpsError("failed-precondition", "Other admins are managed with add-admin.mjs.");
  const code = await issueStaffCode(uid);
  await auth.revokeRefreshTokens(uid);
  await log(me, "resetAccessCode", uid);
  return { code };
});
