// Catapult Classroom backend: families (one parent code each), children, the shared lesson library, lesson sessions with
// one report per child, and the parent view. Contract: packages/shared/src/lessons.ts. Pure rules: logic/lessons.ts.
//
// Reads per call (Firestore documents; staff check = teachers/{uid} + admins/{uid}, both cached 60 s):
//   teacherGetStudents      families of the teacher (all for admins) + their children (+ teachers list for admins)
//   teacherSaveFamily       new: 0 (+1 code check); edit: 1 family + its children
//   teacherResetFamilyCode  1 family (+1 code check)          teacherDeleteFamily  1 family + its reports (deleted)
//   teacherGetChild         1 child + 1 family + its reports (query)
//   teacherListLessons      all lessons (cached 60 s per instance; every lesson write clears it)
//   teacherSaveLesson       edit: 1 lesson                    teacherDeleteLesson  1 lesson
//   teacherSaveSession      1 lesson + the children named (+ 1 session when editing)
//   parentSignIn            1 code doc + 1 family              parentGetHome        1 family + children + reports + lessons named
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { randomInt } from "node:crypto";
import { auth, col, db, requireUid, throwFail } from "./admin.js";
import { teacherRecord } from "./classroom.js";
import { adminRecord } from "./adminDashboard.js";
import { TtlCache } from "./logic/ttlCache.js";
import {
  canTouch, codeDocId, familyIdOfUid, makeFamilyCode, parentUid, staffOf, toParentReport, validDocId, validateFamily, validateLesson, validateSession,
} from "./logic/lessons.js";
import {
  isFamilyCode, normalizeFamilyCode, type Child, type Family, type Lesson, type LessonReport, type LessonSession, type ParentHome, type TeacherDoc,
} from "./shared/index.js";

const obj = (v: unknown): Record<string, unknown> => ((v && typeof v === "object" ? v : {}) as Record<string, unknown>);
const idOf = (v: unknown, what: string): string => { if (!validDocId(v)) throw new HttpsError("invalid-argument", `bad ${what}`); return v; };
const families = () => db.collection(col.families);
const childrenCol = () => db.collection(col.children);
const lessonsCol = () => db.collection(col.lessons);
const sessionsCol = () => db.collection(col.sessions);
const reportsCol = () => db.collection(col.reports);
const docs = <T>(s: FirebaseFirestore.QuerySnapshot) => s.docs.map((d) => d.data() as T);
/** Firestore "in" queries take at most 30 values. */
async function byIds<T>(c: FirebaseFirestore.CollectionReference, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snaps = await db.getAll(...ids.slice(i, i + 30).map((id) => c.doc(id)));
    for (const s of snaps) if (s.exists) out.push(s.data() as T);
  }
  return out;
}

// ---------------------------------------------------------------- access
type Staff = { uid: string; admin: boolean };
async function requireStaff(req: Parameters<typeof requireUid>[0]): Promise<Staff> {
  const uid = requireUid(req);
  const [t, a] = await Promise.all([teacherRecord(uid), adminRecord(uid)]);
  const ok = staffOf(t, a);
  if (!ok.ok) throwFail(ok);
  return { uid, admin: ok.admin };
}
async function familyFor(staff: Staff, familyId: string): Promise<Family> {
  const snap = await families().doc(familyId).get();
  const f = snap.exists ? (snap.data() as Family) : null;
  if (!f) throw new HttpsError("not-found", "No such family.");
  if (!canTouch(staff, f.teacherUid)) throw new HttpsError("permission-denied", "That family isn't yours.");
  return f;
}

/** A fresh code no other family has (a clash is astronomically unlikely; checked anyway). */
async function newCode(familyId: string, tx?: FirebaseFirestore.Transaction): Promise<string> {
  for (;;) {
    const code = makeFamilyCode();
    const ref = db.collection(col.familyCodes).doc(codeDocId(code));
    if ((await ref.get()).exists) continue;
    if (tx) tx.set(ref, { familyId, createdAt: Date.now() }); else await ref.set({ familyId, createdAt: Date.now() });
    return code;
  }
}
async function dropCodes(familyId: string) {
  const s = await db.collection(col.familyCodes).where("familyId", "==", familyId).get();
  await Promise.all(s.docs.map((d) => d.ref.delete()));
}

// ================================================================ students (families + children)
export const teacherGetStudents = onCall(async (req): Promise<{ families: Family[]; children: Child[]; teachers?: { uid: string; name: string }[] }> => {
  const staff = await requireStaff(req);
  const fams = docs<Family>(await (staff.admin ? families().get() : families().where("teacherUid", "==", staff.uid).get()));
  const kids = docs<Child>(await (staff.admin ? childrenCol().get() : childrenCol().where("teacherUid", "==", staff.uid).get()));
  if (!staff.admin) return { families: fams, children: kids };
  const teachers = docs<TeacherDoc>(await db.collection(col.teachers).get()).filter((t) => t.active).map((t) => ({ uid: t.uid, name: t.name }));
  return { families: fams, children: kids, teachers };
});

export const teacherSaveFamily = onCall(async (req): Promise<{ family: Family; children: Child[]; code?: string }> => {
  const staff = await requireStaff(req);
  const d = obj(req.data);
  const v = validateFamily(d);
  if (!v.ok) throwFail(v);
  const now = Date.now();
  let teacherUid = staff.uid;
  if (staff.admin && typeof d.teacherUid === "string" && d.teacherUid) {
    const t = await teacherRecord(d.teacherUid);
    if (!t?.active && d.teacherUid !== staff.uid) throw new HttpsError("failed-precondition", "That teacher isn't active.");
    teacherUid = d.teacherUid;
  }
  if (d.id !== undefined) {
    const id = idOf(d.id, "familyId");
    const fam = await familyFor(staff, id);
    if (!staff.admin) teacherUid = fam.teacherUid;
    const oldKids = await byIds<Child>(childrenCol(), fam.childIds);
    const keep = new Map(oldKids.map((c) => [c.id, c]));
    const batch = db.batch();
    const kids: Child[] = v.value.children.map((c) => {
      const old = c.id ? keep.get(c.id) : undefined;
      const child: Child = old ? { ...old, name: c.name, level: c.level, teacherUid } : { id: childrenCol().doc().id, familyId: id, teacherUid, name: c.name, level: c.level, createdAt: now };
      batch.set(childrenCol().doc(child.id), child);
      return child;
    });
    const gone = oldKids.filter((c) => !kids.some((k) => k.id === c.id));
    for (const c of gone) batch.delete(childrenCol().doc(c.id)); // their old reports stay (the lesson history), unreachable from parents
    const family: Family = { ...fam, parentName: v.value.parentName, teacherUid, childIds: kids.map((k) => k.id) };
    batch.set(families().doc(id), family);
    await batch.commit();
    return { family, children: kids };
  }
  const ref = families().doc();
  const kids: Child[] = v.value.children.map((c) => ({ id: childrenCol().doc().id, familyId: ref.id, teacherUid, name: c.name, level: c.level, createdAt: now }));
  const family: Family = { id: ref.id, parentName: v.value.parentName, teacherUid, childIds: kids.map((k) => k.id), createdAt: now, codeSetAt: now };
  const code = await newCode(ref.id);
  const batch = db.batch();
  batch.set(ref, family);
  for (const k of kids) batch.set(childrenCol().doc(k.id), k);
  await batch.commit();
  return { family, children: kids, code };
});

export const teacherResetFamilyCode = onCall(async (req): Promise<{ code: string }> => {
  const staff = await requireStaff(req);
  const id = idOf(obj(req.data).familyId, "familyId");
  await familyFor(staff, id);
  await dropCodes(id);
  const code = await newCode(id);
  await families().doc(id).update({ codeSetAt: Date.now() });
  // the old code's sign-ins stop at once (the parent signs in again with the new code)
  await auth.revokeRefreshTokens(parentUid(id)).catch((e: { code?: string }) => { if (e?.code !== "auth/user-not-found") throw e; });
  return { code };
});

export const teacherDeleteFamily = onCall(async (req): Promise<{ ok: true }> => {
  const staff = await requireStaff(req);
  const id = idOf(obj(req.data).familyId, "familyId");
  const fam = await familyFor(staff, id);
  await dropCodes(id);
  const reps = await reportsCol().where("familyId", "==", id).get();
  const refs = [...reps.docs.map((d) => d.ref), ...fam.childIds.map((c) => childrenCol().doc(c)), families().doc(id)];
  for (let i = 0; i < refs.length; i += 400) {
    const b = db.batch();
    for (const r of refs.slice(i, i + 400)) b.delete(r);
    await b.commit();
  }
  await auth.deleteUser(parentUid(id)).catch(() => {}); // the parent login, if it was ever used
  return { ok: true };
});

export const teacherGetChild = onCall(async (req): Promise<{ child: Child; family: Family; reports: LessonReport[] }> => {
  const staff = await requireStaff(req);
  const id = idOf(obj(req.data).childId, "childId");
  const snap = await childrenCol().doc(id).get();
  const child = snap.exists ? (snap.data() as Child) : null;
  if (!child || !canTouch(staff, child.teacherUid)) throw new HttpsError("not-found", "No such student.");
  const family = (await families().doc(child.familyId).get()).data() as Family;
  const reports = docs<LessonReport>(await reportsCol().where("childId", "==", id).get()).sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  return { child, family, reports };
});

// ================================================================ lesson library (shared by every teacher)
const lessonCache = new TtlCache<Lesson[]>(60_000, 1);
async function allLessons(): Promise<Lesson[]> {
  const hit = lessonCache.get("all");
  if (hit) return hit;
  const list = docs<Lesson>(await lessonsCol().get());
  lessonCache.set("all", list);
  return list;
}

export const teacherListLessons = onCall(async (req): Promise<{ lessons: Lesson[] }> => {
  await requireStaff(req);
  return { lessons: (await allLessons()).filter((l) => !l.archived).sort((a, b) => a.title.localeCompare(b.title)) };
});

export const teacherSaveLesson = onCall(async (req): Promise<{ lesson: Lesson }> => {
  const staff = await requireStaff(req);
  const d = obj(req.data);
  const v = validateLesson(d, randomInt);
  if (!v.ok) throwFail(v);
  const now = Date.now();
  let lesson: Lesson;
  if (d.id !== undefined) {
    const id = idOf(d.id, "lessonId");
    const snap = await lessonsCol().doc(id).get();
    if (!snap.exists) throw new HttpsError("not-found", "No such lesson.");
    lesson = { ...(snap.data() as Lesson), ...v.value, updatedAt: now };
  } else {
    lesson = { id: lessonsCol().doc().id, ...v.value, createdBy: staff.uid, createdAt: now, updatedAt: now };
  }
  await lessonsCol().doc(lesson.id).set(lesson);
  lessonCache.clear();
  return { lesson };
});

export const teacherDeleteLesson = onCall(async (req): Promise<{ ok: true }> => {
  await requireStaff(req);
  const id = idOf(obj(req.data).lessonId, "lessonId");
  const ref = lessonsCol().doc(id);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "No such lesson.");
  await ref.update({ archived: true, updatedAt: Date.now() }); // reports keep pointing at it
  lessonCache.clear();
  return { ok: true };
});

// ================================================================ lesson sessions → one report per child
export const teacherSaveSession = onCall(async (req): Promise<{ session: LessonSession; reports: LessonReport[] }> => {
  const staff = await requireStaff(req);
  const d = obj(req.data);
  const lessonId = idOf(d.lessonId, "lessonId");
  const lSnap = await lessonsCol().doc(lessonId).get();
  const lesson = lSnap.exists ? (lSnap.data() as Lesson) : null;
  const ids = Array.isArray(d.reports) ? d.reports.map((r) => obj(r).childId).filter(validDocId).slice(0, 60) : [];
  const kids = (await byIds<Child>(childrenCol(), [...new Set(ids)])).filter((c) => canTouch(staff, c.teacherUid));
  const v = validateSession(d, lesson, new Map(kids.map((c) => [c.id, c])));
  if (!v.ok) throwFail(v);
  const now = Date.now();
  let session: LessonSession;
  let dropped: string[] = [];
  if (d.id !== undefined) {
    const id = idOf(d.id, "sessionId");
    const sSnap = await sessionsCol().doc(id).get();
    const old = sSnap.exists ? (sSnap.data() as LessonSession) : null;
    if (!old || !canTouch(staff, old.teacherUid)) throw new HttpsError("not-found", "No such lesson session.");
    session = { ...old, lessonId, date: v.value.date, childIds: v.value.reports.map((r) => r.childId), familyTexts: v.value.familyTexts, updatedAt: now };
    dropped = old.childIds.filter((c) => !session.childIds.includes(c));
  } else {
    session = { id: sessionsCol().doc().id, lessonId, teacherUid: staff.uid, date: v.value.date, childIds: v.value.reports.map((r) => r.childId), familyTexts: v.value.familyTexts, createdAt: now, updatedAt: now };
  }
  const byId = new Map(kids.map((c) => [c.id, c]));
  const reports: LessonReport[] = v.value.reports.map((r) => ({
    ...r, id: `${session.id}_${r.childId}`, sessionId: session.id, lessonId, lessonTitle: lesson!.title, familyId: byId.get(r.childId)!.familyId,
    teacherUid: session.teacherUid, date: session.date, createdAt: now,
  }));
  const batch = db.batch();
  batch.set(sessionsCol().doc(session.id), session);
  for (const r of reports) batch.set(reportsCol().doc(r.id), r);
  for (const c of dropped) batch.delete(reportsCol().doc(`${session.id}_${c}`));
  await batch.commit();
  return { session, reports };
});

// ================================================================ parents
export const parentSignIn = onCall(async (req): Promise<{ token: string }> => {
  const code = normalizeFamilyCode(String(obj(req.data).code ?? ""));
  const wrong = new HttpsError("not-found", "That code doesn't work. Check it with your teacher.");
  if (!isFamilyCode(code)) throw wrong;
  const c = await db.collection(col.familyCodes).doc(codeDocId(code)).get();
  const familyId = c.exists ? String(c.data()?.familyId ?? "") : "";
  if (!familyId || !(await families().doc(familyId).get()).exists) throw wrong;
  return { token: await auth.createCustomToken(parentUid(familyId), { role: "parent", familyId }) };
});

export const parentGetHome = onCall(async (req): Promise<ParentHome> => {
  const familyId = familyIdOfUid(requireUid(req));
  if (!familyId) throw new HttpsError("permission-denied", "Sign in with your family code.");
  const fSnap = await families().doc(familyId).get();
  if (!fSnap.exists) throw new HttpsError("permission-denied", "This family code no longer works. Ask your teacher for a new one.");
  const family = fSnap.data() as Family;
  const kids = await byIds<Child>(childrenCol(), family.childIds);
  const reps = docs<LessonReport>(await reportsCol().where("familyId", "==", familyId).get())
    .filter((r) => family.childIds.includes(r.childId)).sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  const lessons = await byIds<Lesson>(lessonsCol(), [...new Set(reps.map((r) => r.lessonId))]);
  const sessions = await byIds<LessonSession>(sessionsCol(), [...new Set(reps.map((r) => r.sessionId))]);
  const feedback: Record<string, string> = {};
  for (const s of sessions) if (s.familyTexts?.[familyId]) feedback[s.id] = s.familyTexts[familyId];
  return {
    family: { id: family.id, parentName: family.parentName },
    children: kids.map((k) => ({ id: k.id, name: k.name, level: k.level })),
    reports: reps.map(toParentReport),
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, subject: l.subject, level: l.level, goals: l.goals.map((g) => ({ id: g.id, text: g.text })) })),
    feedback,
  };
});
