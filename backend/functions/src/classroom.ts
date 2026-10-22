// Classroom backend (contract: packages/shared/src/classroom.ts). Teachers and classes live in the STUDENT project; every
// read and write goes through these callables (rules: server only).
//
// Reads per call (Firestore documents read; caches are per server instance, TtlCache). "cold" = nothing cached.
// ┌──────────────────────────┬──────────────────────────────────────────────┬───────────────────────────────────────────┐
// │ call                     │ cold                                         │ warm                                      │
// ├──────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────┤
// │ teacherGetDashboard      │ 1 teacher + N classes (query)                │ 0 (60 s; any class write here clears it)  │
// │ teacherSaveClass         │ new: 1 teacher + N classes (limit check)     │ new: 0; edit: 0 (class doc cached 60 s)   │
// │ teacherDeleteClass       │ 1 + docs deleted (posts, tasks, marks)       │ same                                      │
// │ teacherAddStudent        │ 1 teacher + 1 class + 1 friend code + 1 user │ 1 friend code + 1 user + 1 class (txn)    │
// │                          │ + 1 class (txn)                              │                                           │
// │ teacherRemoveStudent     │ 1 teacher + 1 class + 1 class (txn)          │ 1 (txn)                                   │
// │ teacherSetBirthday       │ same as remove                               │ 1 (txn)                                   │
// │ teacherPost / DeletePost │ 1 teacher + 1 class                          │ 0                                         │
// │ teacherUploadSignature   │ 1 teacher + 1 class                          │ 0                                         │
// │ teacherCreateTask        │ 1 teacher + 1 class (+ edits: see patches)   │ 0                                         │
// │ teacherListTasks         │ 1 + 1 + up to 100 tasks                      │ 0 (60 s, cleared by task writes here)     │
// │ teacherGetTaskMarks      │ 1 + 1 + up to 60 marks docs                  │ up to 60 (not cached: marking screen)     │
// │ teacherMarkTask          │ 1 + 1 class + 1 task + 1 marks + <=1 levelStars│ 1 task + 1 marks + levelStars per level  │
// │                          │ per level touched (+1 wallet when stars)     │ (a worksheet = 1, a diagnostic <= 12)     │
// │ teacherGetAnalytics      │ 1 + 1 + one qstats doc per student (<= 60)   │ 0 (5 min per class; marks here clear it)  │
// │ getMyClassroom           │ 1 user + 1 qstats + per class: 1 class,      │ 1 qstats (homework is always fresh)       │
// │                          │ <=30 posts, <=50 in-app tasks, 1 teacher     │ + new posts since the last refresh        │
// │ submitTaskAnswers        │ 1 user + 1 class + 1 task + 1 marks +        │ 1 task + 1 marks + levelStars per level   │
// │                          │ levelStars per level touched                 │                                           │
// │ submitLevelResult (+)    │ unchanged, +0 reads (qstats is a blind merge)│ + on the FIRST completion of a level, for │
// │                          │                                              │ a student in a class: 1 user, 1 qstats,   │
// │                          │                                              │ 1 progress doc (only to find a level-up)  │
// │ nightly birthdays        │ 1 read per class (all classes) at 00:00 SGT  │ -                                         │
// └──────────────────────────┴──────────────────────────────────────────────┴───────────────────────────────────────────┘
// Feed refresh after the 60 s TTL reads only posts newer than the newest cached (0 when none); a full re-read every 10 min.
import { randomBytes } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  ACTIVE_GRADES, CLASS_LIMITS, activeLevelIds, levelKey, type ClassDoc, type ClassPost, type ClassStudent, type ClassTask, type Grade, type LevelNo,
  type MarkValue, type StudentAnalytics, type TaskMarks, type TeacherDoc, tidyName,
} from "./shared/index.js";
import { col, db, FieldValue, REGION, requireUid, SCHEDULE_TZ, throwFail } from "./admin.js";
import { CONTENT, type ServerContent } from "./content/index.js";
import { patchView } from "./patches.js";
import { lb } from "./leaderboard.js";
import { isCorrect } from "./logic/marking.js";
import { sgtDate, sgtMonth, startOfSgtDay } from "./logic/dates.js";
import { TtlCache } from "./logic/ttlCache.js";
import { FeedCache } from "./logic/feedCache.js";
import { buildQstatsPatch, mapQuestionSet, type FieldOps } from "./logic/qstats.js";
import { type LevelStarsDoc } from "./logic/levelStars.js";
import { birthdayPost, groupOpened, isLevelDone, milestonePosts } from "./logic/milestones.js";
import { classAnalytics, studentAnalytics } from "./logic/classAnalytics.js";
import { isFriendCode, normalizeFriendCode } from "./logic/rules.js";
import {
  MAX_CLASSES_PER_TEACHER, birthdaysToday, checkClassOwner, checkRosterMember, checkTeacher, cloudinarySignature, firstName, pickDiagnostic,
  planMarks, QID_RE, safePublicId, settleStars, touchedLevels, taskOpen, validBirthday, validId, validateCreateTask, validateMarks, validatePost, validateSaveClass,
} from "./logic/classroom.js";

const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v) throw new HttpsError("invalid-argument", `${what} required`);
  return v;
};
const idOf = (v: unknown, what: string): string => {
  if (!validId(v)) throw new HttpsError("invalid-argument", `bad ${what}`);
  return v;
};
const obj = (v: unknown): Record<string, unknown> => ((v && typeof v === "object" ? v : {}) as Record<string, unknown>);

// ---------------------------------------------------------------- refs and caches
export const classRef = (id: string) => db.collection(col.classes).doc(id);
const postsRef = (classId: string) => classRef(classId).collection("posts");
const tasksRef = (classId: string) => classRef(classId).collection("tasks");
const marksRef = (classId: string, taskId: string, uid: string) => tasksRef(classId).doc(taskId).collection("marks").doc(uid);
export const userRef = (uid: string) => db.collection(col.users).doc(uid);
const levelStarsRef = (uid: string, grade: string, key: string) => userRef(uid).collection("levelStars").doc(`${grade}_${key}`);
export const qstatsRef = (uid: string, grade: string) => userRef(uid).collection("qstats").doc(grade);

/** Firestore field operations for buildQstatsPatch. */
export const qstatsOps = (now: number): FieldOps => ({
  increment: (n) => FieldValue.increment(n), arrayUnion: (...v) => FieldValue.arrayUnion(...v), del: () => FieldValue.delete(), now,
});

const TTL = 60_000;
const teacherCache = new TtlCache<TeacherDoc | null>(TTL, 200);
const teacherNameCache = new TtlCache<string>(10 * 60_000, 200);
const classCache = new TtlCache<ClassDoc | null>(TTL, 500);
const teacherClassesCache = new TtlCache<ClassDoc[]>(TTL, 200); // teacher uid → classes
const tasksCache = new TtlCache<ClassTask[]>(TTL, 300); // class id → newest 100 tasks (teacher list)
const inAppTasksCache = new TtlCache<ClassTask[]>(TTL, 300); // class id → in-app tasks (students)
const analyticsCache = new TtlCache<Map<string, Record<string, unknown>>>(5 * 60_000, 100); // class id → qstats.stats per student
interface UserInfo { classIds: string[]; grade: Grade; first: string }
const userInfoCache = new TtlCache<UserInfo>(TTL, 2000);
const FEED_PAGE = CLASS_LIMITS.feedPage;
const feed = new FeedCache({
  async newest(classId, limit) {
    const s = await postsRef(classId).orderBy("createdAt", "desc").limit(limit).get();
    return s.docs.map((d) => d.data() as ClassPost);
  },
  async since(classId, since) {
    const s = await postsRef(classId).where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(FEED_PAGE).get();
    return s.docs.map((d) => d.data() as ClassPost);
  },
}, FEED_PAGE);

export async function loadClass(classId: string): Promise<ClassDoc | null> {
  const hit = classCache.get(classId);
  if (hit !== undefined) return hit;
  const snap = await classRef(classId).get();
  const c = snap.exists ? (snap.data() as ClassDoc) : null;
  classCache.set(classId, c);
  return c;
}
/** Teacher-side writes to a class clear what this instance cached about it. */
export function touchClass(c: Pick<ClassDoc, "id" | "teacherUid"> & { students?: ClassStudent[] }): void {
  classCache.delete(c.id);
  teacherClassesCache.delete(c.teacherUid);
  analyticsCache.delete(c.id);
  for (const s of c.students ?? []) userInfoCache.delete(s.uid);
}

/** Admin writes to a teacher record: this instance forgets what it cached (other instances catch up within the 60 s TTL). */
export function forgetTeacher(uid: string): void {
  teacherCache.delete(uid);
  teacherNameCache.delete(uid);
}

async function requireTeacher(req: Parameters<typeof requireUid>[0]): Promise<{ uid: string; teacher: TeacherDoc }> {
  const uid = requireUid(req);
  let t = teacherCache.get(uid);
  if (t === undefined) {
    const snap = await db.collection(col.teachers).doc(uid).get();
    t = snap.exists ? ({ ...(snap.data() as TeacherDoc), uid }) : null;
    teacherCache.set(uid, t);
  }
  const ok = checkTeacher(t);
  if (!ok.ok) throwFail(ok);
  return { uid, teacher: t! };
}
async function ownedClass(uid: string, classId: unknown): Promise<ClassDoc> {
  const id = idOf(classId, "classId");
  const c = await loadClass(id);
  const ok = checkClassOwner(c, uid);
  if (!ok.ok) throwFail(ok);
  return c!;
}
async function taskOf(classId: string, taskId: string): Promise<ClassTask> {
  const snap = await tasksRef(classId).doc(taskId).get();
  if (!snap.exists) throw new HttpsError("not-found", "No such task.");
  return snap.data() as ClassTask;
}
async function userInfo(uid: string): Promise<UserInfo> {
  const hit = userInfoCache.get(uid);
  if (hit) return hit;
  const d = (await userRef(uid).get()).data();
  const info: UserInfo = {
    classIds: Array.isArray(d?.classIds) ? (d!.classIds as string[]) : [], grade: ACTIVE_GRADES.includes(d?.grade) ? d!.grade : "P6",
    first: firstName(String(d?.fullName ?? "")),
  };
  userInfoCache.set(uid, info);
  return info;
}

// ---------------------------------------------------------------- content helpers
const contentOf = (grade: string): ServerContent => {
  const c = CONTENT[grade];
  if (!c) throw new HttpsError("failed-precondition", "No content for this grade.");
  return c;
};
const topicOfSubtopic = (c: ServerContent, subtopicId: string) => c.topics.find((t) => t.subtopics.includes(subtopicId));
const levelIndexCache = new WeakMap<object, Map<string, { subtopicId: string; level: LevelNo; key: string }>>();
/** question id → the level it belongs to */
function levelIndex(c: ServerContent) {
  let m = levelIndexCache.get(c);
  if (!m) {
    m = new Map();
    for (const [key, ids] of Object.entries(c.levels)) {
      const [subtopicId, lv] = key.split("#");
      for (const id of ids) if (!m.has(id)) m.set(id, { subtopicId, level: Number(lv) as LevelNo, key });
    }
    levelIndexCache.set(c, m);
  }
  return m;
}

// ================================================================ teacher callables
export const teacherGetDashboard = onCall(async (req): Promise<{ teacher: TeacherDoc; classes: ClassDoc[] }> => {
  const { uid, teacher } = await requireTeacher(req);
  return { teacher, classes: await teacherClasses(uid) };
});

export const teacherSaveClass = onCall(async (req): Promise<{ classId: string }> => {
  const { uid, teacher } = await requireTeacher(req);
  const v = validateSaveClass(req.data);
  if (!v.ok) throwFail(v);
  if (v.id) {
    const cur = await ownedClass(uid, v.id);
    if (cur.grade !== v.grade) throw new HttpsError("failed-precondition", "A class's grade can't be changed.");
    await classRef(cur.id).update({ name: v.name });
    touchClass({ ...cur, students: [] });
    return { classId: cur.id };
  }
  const mine = await teacherClasses(uid);
  if (mine.length >= MAX_CLASSES_PER_TEACHER) throw new HttpsError("failed-precondition", `At most ${MAX_CLASSES_PER_TEACHER} classes.`);
  const id = db.collection(col.classes).doc().id;
  const doc: ClassDoc & { teacherName: string } = { id, name: v.name, grade: v.grade, teacherUid: uid, students: [], createdAt: Date.now(), teacherName: teacher.name };
  await classRef(id).create(doc);
  touchClass(doc);
  return { classId: id };
});
export async function teacherClasses(uid: string): Promise<ClassDoc[]> {
  const hit = teacherClassesCache.get(uid);
  if (hit) return hit;
  const s = await db.collection(col.classes).where("teacherUid", "==", uid).limit(MAX_CLASSES_PER_TEACHER + 20).get();
  const classes = s.docs.map((d) => d.data() as ClassDoc).sort((a, b) => a.createdAt - b.createdAt);
  teacherClassesCache.set(uid, classes);
  for (const c of classes) classCache.set(c.id, c);
  return classes;
}

/**
 * Deletes a class for good (shared by teacherDeleteClass and adminDeleteClass). Students lose the class first (a failure half
 * way leaves them in a class that is still there, not in a missing one), then the doc and its posts / tasks / marks go.
 */
export async function deleteClassCascade(cls: ClassDoc): Promise<void> {
  for (let i = 0; i < cls.students.length; i += 400) {
    const batch = db.batch();
    for (const s of cls.students.slice(i, i + 400)) batch.set(userRef(s.uid), { classIds: FieldValue.arrayRemove(cls.id) }, { merge: true });
    await batch.commit();
  }
  await db.recursiveDelete(classRef(cls.id));
  touchClass(cls);
  feed.invalidate(cls.id);
  tasksCache.delete(cls.id);
  inAppTasksCache.delete(cls.id);
  classCache.set(cls.id, null);
}
export const teacherDeleteClass = onCall(async (req): Promise<{ ok: true }> => {
  const { uid } = await requireTeacher(req);
  await deleteClassCascade(await ownedClass(uid, obj(req.data).classId));
  return { ok: true };
});

/**
 * Adds the student with this friend code to a class (shared by teacherAddStudent and adminAddStudent; the caller has already
 * checked who may touch the class). Keeps users/{uid}.classIds in step. Already on the roster → returns that entry unchanged.
 */
export async function addStudentToClassByCode(cls: ClassDoc, friendCode: unknown): Promise<ClassStudent> {
  const code = normalizeFriendCode(friendCode);
  if (!isFriendCode(code)) throw new HttpsError("not-found", "No student has this friend code.");
  const codeSnap = await db.collection(col.friendCodes).doc(code).get();
  const studentUid = codeSnap.exists ? (codeSnap.data()!.uid as string) : null;
  if (!studentUid) throw new HttpsError("not-found", "No student has this friend code.");
  const existing = cls.students.find((s) => s.uid === studentUid);
  if (existing) return existing;
  const u = (await userRef(studentUid).get()).data();
  if (!u) throw new HttpsError("not-found", "No student has this friend code.");
  const student: ClassStudent = { uid: studentUid, displayName: tidyName(String(u.fullName ?? "Student")) || "Student", ...(validBirthday(u.birthday) ? { birthday: u.birthday } : {}) };
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(classRef(cls.id));
    const cur = snap.data() as ClassDoc | undefined;
    if (!cur || cur.teacherUid !== cls.teacherUid) throw new HttpsError("not-found", "No such class.");
    const there = cur.students.find((s) => s.uid === studentUid);
    if (there) return { student: there, added: false };
    if (cur.students.length >= CLASS_LIMITS.maxStudents) throw new HttpsError("failed-precondition", `A class holds at most ${CLASS_LIMITS.maxStudents} students.`);
    tx.update(classRef(cls.id), { students: [...cur.students, student] });
    return { student, added: true };
  });
  if (res.added) await userRef(studentUid).set({ classIds: FieldValue.arrayUnion(cls.id) }, { merge: true });
  touchClass({ ...cls, students: [student] });
  return res.student;
}
export const teacherAddStudent = onCall(async (req): Promise<{ student: ClassStudent }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  return { student: await addStudentToClassByCode(cls, d.friendCode) };
});

/** Takes a student off a class roster and the class off users/{uid}.classIds (shared by teacherRemoveStudent and adminRemoveStudent). */
export async function removeStudentFromClass(cls: ClassDoc, studentUid: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(classRef(cls.id))).data() as ClassDoc | undefined;
    if (!cur || cur.teacherUid !== cls.teacherUid) throw new HttpsError("not-found", "No such class.");
    if (cur.students.some((s) => s.uid === studentUid)) tx.update(classRef(cls.id), { students: cur.students.filter((s) => s.uid !== studentUid) });
  });
  await userRef(studentUid).set({ classIds: FieldValue.arrayRemove(cls.id) }, { merge: true });
  touchClass({ ...cls, students: [{ uid: studentUid, displayName: "" }] });
}
export const teacherRemoveStudent = onCall(async (req): Promise<{ ok: true }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  await removeStudentFromClass(cls, idOf(d.studentUid, "studentUid"));
  return { ok: true };
});

export const teacherSetBirthday = onCall(async (req): Promise<{ ok: true }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  const studentUid = idOf(d.studentUid, "studentUid");
  const b = d.birthday;
  if (b !== null && !validBirthday(b)) throw new HttpsError("invalid-argument", "birthday must be MM-DD or null");
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(classRef(cls.id))).data() as ClassDoc | undefined;
    if (!cur || cur.teacherUid !== uid) throw new HttpsError("not-found", "No such class.");
    if (!cur.students.some((s) => s.uid === studentUid)) throw new HttpsError("not-found", "This student is not in the class.");
    tx.update(classRef(cls.id), {
      students: cur.students.map((s) => {
        if (s.uid !== studentUid) return s;
        const { birthday: _old, ...rest } = s;
        void _old;
        return b === null ? rest : { ...rest, birthday: b as string };
      }),
    });
  });
  await userRef(studentUid).set({ birthday: b === null ? FieldValue.delete() : b }, { merge: true });
  touchClass(cls);
  return { ok: true };
});

export const teacherPost = onCall(async (req): Promise<{ post: ClassPost }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  const v = validatePost(d);
  if (!v.ok) throwFail(v);
  const id = postsRef(cls.id).doc().id;
  const post: ClassPost = {
    id, kind: "teacher", text: v.text, createdAt: Date.now(), authorUid: uid,
    ...(v.attachments.length ? { attachments: v.attachments } : {}), ...(v.taskId ? { taskId: v.taskId } : {}),
  };
  await postsRef(cls.id).doc(id).create(post);
  feed.invalidate(cls.id);
  return { post };
});

export const teacherDeletePost = onCall(async (req): Promise<{ ok: true }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  await postsRef(cls.id).doc(idOf(d.postId, "postId")).delete();
  feed.invalidate(cls.id);
  return { ok: true };
});

/** A class's feed for the dashboard, newest first, one page (CLASS_LIMITS.feedPage reads); `before` = createdAt cursor. */
export const teacherListPosts = onCall(async (req): Promise<{ posts: ClassPost[] }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  let q = postsRef(cls.id).orderBy("createdAt", "desc");
  if (typeof d.before === "number") q = q.startAfter(d.before);
  const snap = await q.limit(CLASS_LIMITS.feedPage).get();
  return { posts: snap.docs.map((x) => x.data() as ClassPost) };
});

const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME || "n9gn4u6k";
const CLOUDINARY_KEY = process.env.CLOUDINARY_KEY || "465242564664612";
/** Signed Cloudinary upload parameters for an answer sheet: the secret never leaves the server (CLOUDINARY_SECRET). */
export const teacherUploadSignature = onCall(async (req): Promise<{ cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string; publicId: string }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  const fileName = str(d.fileName, "fileName");
  if (fileName.length > 200) throw new HttpsError("invalid-argument", "fileName too long");
  const secret = process.env.CLOUDINARY_SECRET;
  if (!secret) throw new HttpsError("failed-precondition", "Uploads are not set up on the server.");
  const folder = `p6maths/classroom/${cls.id}`;
  const publicId = safePublicId(fileName, randomBytes(3).toString("hex"));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinarySignature({ folder, public_id: publicId, timestamp }, secret);
  return { cloudName: CLOUDINARY_CLOUD, apiKey: CLOUDINARY_KEY, timestamp, signature, folder, publicId };
});

export const teacherCreateTask = onCall(async (req): Promise<{ task: ClassTask }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  const v = validateCreateTask(d, Date.now());
  if (!v.ok) throwFail(v);
  const { req: r } = v;
  const content = contentOf(cls.grade);
  const edits = await patchView(cls.grade);
  const retired = edits?.retired ?? [];
  const id = tasksRef(cls.id).doc().id;
  let task: ClassTask;
  if (r.kind === "worksheet") {
    const ids = activeLevelIds(content.levels[levelKey(r.subtopicId!, r.level!)] ?? [], retired);
    if (!content.levels[levelKey(r.subtopicId!, r.level!)]?.length) throw new HttpsError("not-found", "No such level.");
    task = {
      id, kind: "worksheet", grade: cls.grade, subtopicId: r.subtopicId, level: r.level, questionIds: ids, createdAt: Date.now(), inApp: false,
      title: r.title ?? `Worksheet: ${content.names[r.subtopicId!] ?? r.subtopicId} · Level ${r.level}`,
    };
  } else {
    const topic = content.topics.find((t) => t.id === r.topicId);
    if (!topic) throw new HttpsError("not-found", "No such topic.");
    const inApp = r.inApp !== false;
    const markable = (qid: string) => (edits?.answers.has(qid) ? edits.answers.get(qid) !== null : !!content.answers[qid]);
    const ids = pickDiagnostic(topic.subtopics, (s, l) => {
      const level = activeLevelIds(content.levels[levelKey(s, l)] ?? [], retired);
      return inApp ? level.filter(markable) : level;
    }, CLASS_LIMITS.maxDiagnostic);
    if (!ids.length) throw new HttpsError("failed-precondition", "This topic has no questions for a diagnostic.");
    task = { id, kind: "diagnostic", grade: cls.grade, topicId: topic.id, questionIds: ids, createdAt: Date.now(), inApp, title: r.title ?? `Diagnostic: ${topic.name}` };
  }
  if (r.dueAt !== undefined) task.dueAt = r.dueAt;
  await tasksRef(cls.id).doc(id).create(task);
  tasksCache.delete(cls.id);
  inAppTasksCache.delete(cls.id);
  return { task };
});

export const teacherListTasks = onCall(async (req): Promise<{ tasks: ClassTask[] }> => {
  const { uid } = await requireTeacher(req);
  const cls = await ownedClass(uid, obj(req.data).classId);
  let tasks = tasksCache.get(cls.id);
  if (!tasks) {
    const s = await tasksRef(cls.id).orderBy("createdAt", "desc").limit(100).get();
    tasks = s.docs.map((d) => d.data() as ClassTask);
    tasksCache.set(cls.id, tasks);
  }
  return { tasks };
});

export const teacherGetTaskMarks = onCall(async (req): Promise<{ marks: TaskMarks[] }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  const s = await tasksRef(cls.id).doc(idOf(d.taskId, "taskId")).collection("marks").limit(CLASS_LIMITS.maxStudents + 5).get();
  return { marks: s.docs.map((x) => x.data() as TaskMarks) };
});

// ---------------------------------------------------------------- marking (teacher and in-app diagnostics)
interface ApplyArgs {
  classId: string;
  task: ClassTask;
  studentUid: string;
  incoming: Record<string, MarkValue>;
  source: "teacher" | "app";
  /** in-app diagnostics: a second submission changes nothing and returns the stored marks */
  onlyIfAbsent?: boolean;
}
interface ApplyResult { starsAwarded: number; marks: Record<string, MarkValue>; duplicate: boolean }

/**
 * Marks count exactly like answers in the app. Per question, once, however often the same marks are sent (idempotent per
 * task + student + question):
 *  - right: the question's star by stars.ts (resolveLevelStars, same as submitLevelResult: once ever, plus the replay bonus),
 *    qstats completed, taken off the homework list, the "previously wrong" bookmark switched off if a mark had set it
 *  - wrong: users/{uid}/wrong/{id} bookmark (active, what Unlimited Mistakes reads), qstats wrong, homework list
 *  - the first mark of a question is an attempt (qstats a+1, attempted/{grade}_{id} so mini-game stars treat it as seen,
 *    leaderboard questionsDone); correcting a mark later is not
 * One transaction: marks doc, levelStars per level, wallet and leaderboard entries when stars were paid, one qstats merge.
 */
export async function applyTaskMarks(a: ApplyArgs): Promise<ApplyResult> {
  const { task, studentUid, classId } = a;
  const grade = task.grade;
  const content = contentOf(grade);
  const edits = await patchView(grade);
  const retired = edits?.retired ?? [];
  const lvIdx = levelIndex(content);
  const now = Date.now();
  const mRef = marksRef(classId, task.id, studentUid);
  const qs = qstatsRef(studentUid, grade);
  const walletRef = db.collection(col.wallets).doc(studentUid);
  const completed: { subtopicId: string; level: LevelNo; levelIds: string[] }[] = [];

  const res = await db.runTransaction(async (tx): Promise<ApplyResult> => {
    completed.length = 0; // the body may run more than once
    const prevSnap = await tx.get(mRef);
    const prevDoc = prevSnap.data() as TaskMarks | undefined;
    const prev = prevDoc?.marks ?? {};
    if (a.onlyIfAbsent && prevSnap.exists) return { starsAwarded: 0, marks: prev, duplicate: true };
    const plan = planMarks(prev, a.incoming);
    if (!plan.changed.length) return { starsAwarded: 0, marks: prev, duplicate: true };

    // stars: every level that has a changed question, judged with all its questions that are right after this call
    const touched = touchedLevels(plan, (q) => lvIdx.get(q));
    const levelDocs = await Promise.all(touched.map((l) => tx.get(levelStarsRef(studentUid, grade, l.key))));
    const settled = settleStars(touched, levelDocs.map((x) => x.data() as LevelStarsDoc | undefined), plan.merged, content.levels, retired);
    const { stars } = settled;
    completed.push(...settled.completed);
    const wallet = stars > 0 ? await tx.get(walletRef) : null;

    // ---- writes
    tx.set(mRef, { studentUid, marks: plan.merged, markedAt: now, source: prevDoc?.source === "teacher" ? "teacher" : a.source } satisfies TaskMarks);
    for (const w of settled.writes) tx.set(levelStarsRef(studentUid, grade, w.key), { ...w.write, updatedAt: FieldValue.serverTimestamp() });
    for (const q of plan.firstTime) tx.set(userRef(studentUid).collection("attempted").doc(`${grade}_${q}`), { at: FieldValue.serverTimestamp() }, { merge: true });
    for (const q of plan.flagWrong) tx.set(userRef(studentUid).collection("wrong").doc(q), { grade, active: true, flaggedAt: now, updatedAt: now });
    for (const q of plan.clearWrong) tx.set(userRef(studentUid).collection("wrong").doc(q), { grade, active: false, updatedAt: now }, { merge: true });
    const qpatch = buildQstatsPatch(grade, plan.deltas.filter((x) => mapQuestionSet(content).has(x.questionId)), qstatsOps(now), a.source === "app" ? { tasksDone: task.id } : undefined);
    if (qpatch) tx.set(qs, qpatch, { merge: true });
    if (stars > 0 || plan.firstTime.length) {
      const inc = { uid: studentUid, stars: FieldValue.increment(stars), questionsDone: FieldValue.increment(plan.firstTime.length), updatedAt: FieldValue.serverTimestamp() };
      tx.set(db.collection(col.leaderboards).doc(`monthly-${sgtMonth(now)}`).collection("entries").doc(studentUid), inc, { merge: true });
      tx.set(db.collection(col.leaderboards).doc(`daily-${sgtDate(now)}`).collection("entries").doc(studentUid), inc, { merge: true });
    }
    if (stars > 0) {
      const balance = (wallet!.data()?.starBalance as number | undefined) ?? 0;
      const total = (wallet!.data()?.totalStars as number | undefined) ?? 0;
      tx.set(walletRef, { starBalance: balance + stars, totalStars: total + stars, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(userRef(studentUid).collection("ledger").doc(), {
        type: "teacher-mark", delta: stars, balanceAfter: balance + stars, classId, taskId: task.id, grade, createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { starsAwarded: stars, marks: plan.merged, duplicate: false };
  });
  if (!res.duplicate) {
    analyticsCache.delete(classId);
    lb.invalidateUser(studentUid);
    for (const c of completed) await levelCompleted(studentUid, grade, c.subtopicId, c.level, c.levelIds);
  }
  return res;
}

export const teacherMarkTask = onCall(async (req): Promise<{ starsAwarded: number }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  const studentUid = idOf(d.studentUid, "studentUid");
  const ok = checkRosterMember(cls, studentUid);
  if (!ok.ok) throwFail({ ...ok, code: "not-found", message: "This student is not in the class." });
  const task = await taskOf(cls.id, idOf(d.taskId, "taskId"));
  const v = validateMarks(d.marks, task.questionIds);
  if (!v.ok) throwFail(v);
  const r = await applyTaskMarks({ classId: cls.id, task, studentUid, incoming: v.marks, source: "teacher" });
  return { starsAwarded: r.starsAwarded };
});

// ---------------------------------------------------------------- analytics
export const teacherGetAnalytics = onCall(async (req): Promise<{ class: ReturnType<typeof classAnalytics>; student?: StudentAnalytics }> => {
  const { uid } = await requireTeacher(req);
  const d = obj(req.data);
  const cls = await ownedClass(uid, d.classId);
  const content = contentOf(cls.grade);
  const topicId = d.topicId === undefined ? undefined : String(d.topicId);
  if (topicId !== undefined && !content.topics.some((t) => t.id === topicId)) throw new HttpsError("not-found", "No such topic.");
  let statsByUid = analyticsCache.get(cls.id) as Map<string, Record<string, never>> | undefined;
  if (!statsByUid) {
    statsByUid = new Map();
    const refs = cls.students.map((s) => qstatsRef(s.uid, cls.grade));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    snaps.forEach((s, i) => statsByUid!.set(cls.students[i].uid, (s.data()?.stats ?? {}) as Record<string, never>));
    analyticsCache.set(cls.id, statsByUid);
  }
  const out: { class: ReturnType<typeof classAnalytics>; student?: StudentAnalytics } = { class: classAnalytics(content, cls.id, cls.students, statsByUid, topicId) };
  if (d.studentUid !== undefined) {
    const sid = idOf(d.studentUid, "studentUid");
    const s = cls.students.find((x) => x.uid === sid);
    if (!s) throw new HttpsError("not-found", "This student is not in the class.");
    out.student = studentAnalytics(content, s.uid, s.displayName, cls.grade, statsByUid.get(s.uid), topicId);
  }
  return out;
});

// ================================================================ student callables
export const getMyClassroom = onCall(async (req): Promise<{
  classes: { id: string; name: string; teacherName: string }[]; posts: ClassPost[]; tasks: ClassTask[]; homework: string[];
}> => {
  const uid = requireUid(req);
  const info = await userInfo(uid);
  if (!info.classIds.length) return { classes: [], posts: [], tasks: [], homework: [] };
  const loaded = await Promise.all(info.classIds.map(loadClass));
  const classes = loaded.filter((c): c is ClassDoc => !!c && c.students.some((s) => s.uid === uid));
  if (!classes.length) return { classes: [], posts: [], tasks: [], homework: [] };
  const now = Date.now();
  const [qSnap, feeds, taskLists, names] = await Promise.all([
    qstatsRef(uid, info.grade).get(),
    Promise.all(classes.map((c) => feed.get(c.id))),
    Promise.all(classes.map((c) => inAppTasks(c.id))),
    Promise.all(classes.map((c) => teacherName(c.teacherUid))),
  ]);
  const done = new Set((qSnap.data()?.tasksDone as string[] | undefined) ?? []);
  const posts = [...new Map(feeds.flat().map((p) => [`${p.id}`, p] as const)).values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, CLASS_LIMITS.feedPage);
  const tasks = taskLists.flat().filter((t) => !done.has(t.id) && taskOpen(t, now, startOfSgtDay)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  const homework = Object.keys((qSnap.data()?.homework as Record<string, unknown> | undefined) ?? {});
  return { classes: classes.map((c, i) => ({ id: c.id, name: c.name, teacherName: names[i] })), posts, tasks, homework };
});

async function inAppTasks(classId: string): Promise<ClassTask[]> {
  const hit = inAppTasksCache.get(classId);
  if (hit) return hit;
  const s = await tasksRef(classId).where("inApp", "==", true).limit(50).get(); // one equality filter: no composite index
  const tasks = s.docs.map((d) => d.data() as ClassTask).sort((a, b) => b.createdAt - a.createdAt);
  inAppTasksCache.set(classId, tasks);
  return tasks;
}
async function teacherName(teacherUid: string): Promise<string> {
  const hit = teacherNameCache.get(teacherUid);
  if (hit !== undefined) return hit;
  const name = String((await db.collection(col.teachers).doc(teacherUid).get()).data()?.name ?? "Teacher");
  teacherNameCache.set(teacherUid, name);
  return name;
}

export const submitTaskAnswers = onCall(async (req): Promise<{ marks: Record<string, MarkValue> }> => {
  const uid = requireUid(req);
  const d = obj(req.data);
  const classId = idOf(d.classId, "classId");
  const cls = await loadClass(classId);
  const ok = checkRosterMember(cls, uid);
  if (!ok.ok) throwFail(ok);
  const task = await taskOf(classId, idOf(d.taskId, "taskId"));
  if (!task.inApp) throw new HttpsError("failed-precondition", "This task is done on paper.");
  if (!Array.isArray(d.answers) || d.answers.length > CLASS_LIMITS.maxDiagnostic * 2) throw new HttpsError("invalid-argument", "bad answers");
  const given = new Map<string, string[]>();
  for (const a of d.answers as { questionId?: unknown; responses?: unknown }[]) {
    if (typeof a?.questionId !== "string" || !QID_RE.test(a.questionId) || !task.questionIds.includes(a.questionId)) throw new HttpsError("invalid-argument", "bad answer entry");
    if (!Array.isArray(a.responses) || a.responses.length < 1 || a.responses.length > 10 || !a.responses.every((x) => typeof x === "string" && x.length <= 200)) throw new HttpsError("invalid-argument", "bad answer entry");
    if (!given.has(a.questionId)) given.set(a.questionId, a.responses as string[]);
  }
  if (!taskOpen(task, Date.now(), startOfSgtDay)) throw new HttpsError("failed-precondition", "This test is closed.");
  const content = contentOf(task.grade);
  const edits = await patchView(task.grade);
  // every question of the test is marked; one left unanswered is wrong
  const incoming: Record<string, MarkValue> = {};
  for (const q of task.questionIds) {
    const r = given.get(q);
    incoming[q] = r && isCorrect(content, q, r, edits?.answers) ? "right" : "wrong";
  }
  const r = await applyTaskMarks({ classId, task, studentUid: uid, incoming, source: "app", onlyIfAbsent: true });
  return { marks: r.marks };
});

// ================================================================ automatic posts
/** Writes posts into every class of the student; ids are fixed so a retry or a replay never duplicates them. */
async function writePosts(classIds: readonly string[], posts: readonly ClassPost[]): Promise<void> {
  for (const classId of classIds) {
    for (const p of posts) {
      try { await postsRef(classId).doc(p.id).create(p); } catch (e) { if ((e as { code?: number }).code !== 6) throw e; } // 6 = ALREADY_EXISTS
    }
    feed.invalidate(classId);
  }
}

/**
 * A level was completed for the first time (in the app, or by a teacher's mark): post "X completed Fractions · Level 1" and,
 * when it was the last Level N of its map, "X levelled up to LV(N+1) in <topic>!" to every class of the student.
 * Best effort: a failure here never fails the answer. Reads (only when the student is in a class): 1 user (cached), and for
 * a possible level-up 1 qstats + 1 progress doc.
 */
export async function levelCompleted(uid: string, grade: Grade, subtopicId: string, level: LevelNo, levelIds: readonly string[]): Promise<void> {
  try {
    const info = await userInfo(uid);
    if (!info.classIds.length) return;
    const content = CONTENT[grade];
    if (!content) return;
    const topic = topicOfSubtopic(content, subtopicId);
    let opened: LevelNo | null = null;
    if (topic && level < 3) {
      const [q, p] = await Promise.all([qstatsRef(uid, grade).get(), userRef(uid).collection("progress").doc(grade).get()]);
      const stats = (q.data()?.stats ?? {}) as Record<string, { c?: boolean }>;
      const starred = new Set(Object.keys(stats).filter((id) => stats[id]?.c === true));
      const levels = (p.data()?.levels ?? {}) as Record<string, { completed?: boolean; correctIds?: string[] }>;
      opened = groupOpened(topic.subtopics, level, subtopicId, (s, l) => isLevelDone({ ids: s === subtopicId ? levelIds : content.levels[levelKey(s, l)] ?? [], starred, progress: levels[levelKey(s, l)] }));
    }
    const posts = milestonePosts(uid, info.first, grade, subtopicId, {
      subtopicName: content.names[subtopicId] ?? subtopicId, topicId: topic?.id ?? "", topicName: topic?.name ?? "", level, opened,
    }, Date.now());
    await writePosts(info.classIds, posts);
  } catch (e) {
    console.error("classroom milestone failed", e);
  }
}

/** deleteAccount: the student leaves every class roster. */
export async function leaveAllClasses(uid: string, classIds: readonly string[] | undefined): Promise<void> {
  for (const classId of classIds ?? []) {
    try {
      await db.runTransaction(async (tx) => {
        const cur = (await tx.get(classRef(classId))).data() as ClassDoc | undefined;
        if (cur?.students.some((s) => s.uid === uid)) tx.update(classRef(classId), { students: cur.students.filter((s) => s.uid !== uid) });
      });
      classCache.delete(classId);
      analyticsCache.delete(classId);
    } catch (e) { console.error("leave class failed", classId, e); }
  }
  userInfoCache.delete(uid);
}

/**
 * 00:00 SGT: birthday posts. Reads every class once (the roster carries the birthdays), never the users. Safe to run twice.
 * @returns the number of posts written
 */
export async function postBirthdays(now = Date.now()): Promise<number> {
  const date = sgtDate(now);
  const all = await db.collection(col.classes).get();
  let n = 0;
  for (const doc of all.docs) {
    const cls = doc.data() as ClassDoc;
    for (const b of birthdaysToday(cls, date)) {
      try { await postsRef(cls.id).doc(birthdayPost(b.uid, firstName(b.displayName), date, now).id).create(birthdayPost(b.uid, firstName(b.displayName), date, now)); n++; } catch (e) { if ((e as { code?: number }).code !== 6) throw e; }
    }
    feed.invalidate(cls.id);
  }
  return n;
}
export const classroomNightly = onSchedule({ region: REGION, timeZone: SCHEDULE_TZ, schedule: "0 0 * * *", timeoutSeconds: 120 }, async () => {
  console.log(`birthday posts: ${await postBirthdays()}`);
});
