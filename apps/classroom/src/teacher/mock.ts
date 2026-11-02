// Dev mock for the teacher dashboard (?mock=1 / EXPO_PUBLIC_TEACHER_MOCK=1): two classes with rosters, posts, tasks,
// marks and analytics built from the real bundled questions, so every section can be tried (and screenshotted) without
// the backend. State lives in memory and, on the web, in localStorage so the print view in a new tab sees the same tasks.
import type { ClassDoc, ClassPost, ClassStudent, ClassTask, Grade, LevelNo, QuestionStat, TaskMarks } from "@p6/shared";
import { getLevelIds, getQuestion, getTopics } from "../content";
import { ApiError } from "../services/api";
import { classAnalytics, mapQuestions, studentAnalytics, type StatsByQuestion } from "./analytics";
import { defaultTaskTitle, normalizeBirthday, type UploadSignature } from "./helpers";
import type { TeacherBackend } from "./types";

const GRADE: Grade = "P6";
const TEACHER = { uid: "t-mock", name: "Ms Tan", email: "ms.tan@example.sg", active: true, createdAt: 0 };
const KEY = "p6.teacherMock.v1";

interface State { classes: ClassDoc[]; posts: Record<string, ClassPost[]>; tasks: Record<string, ClassTask[]>; marks: Record<string, TaskMarks[]>; seq: number }

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

const NAMES_A = ["Aisha Rahman", "Zach Lim", "Mei Ling Tan", "Daniel Ong", "Priya Nair", "Ethan Goh", "Sofia Chen", "Hakim Yusof", "Chloe Wong", "Arjun Menon", "Ivy Koh", "Marcus Lee"];
const NAMES_B = ["Nur Aini", "Jun Wei Teo", "Grace Tay", "Rohan Das", "Bella Sim", "Kai Ng", "Hana Ismail", "Lucas Ho"];

function seedState(now: number): State {
  const day = 86_400_000, h = 3_600_000;
  const mk = (prefix: string, names: string[]): ClassStudent[] => names.map((n, i) => ({ uid: `${prefix}${i + 1}`, displayName: n, birthday: i % 3 === 1 ? `${String(1 + ((i * 5) % 12)).padStart(2, "0")}-${String(3 + ((i * 7) % 24)).padStart(2, "0")}` : undefined }));
  const classes: ClassDoc[] = [
    { id: "c1", name: "6 Courage", grade: GRADE, teacherUid: TEACHER.uid, students: mk("a", NAMES_A), createdAt: now - 60 * day },
    { id: "c2", name: "6 Honesty", grade: GRADE, teacherUid: TEACHER.uid, students: mk("b", NAMES_B), createdAt: now - 45 * day },
  ];
  const topics = getTopics(GRADE);
  const t0 = topics[0], t1 = topics[1] ?? topics[0];
  const s0 = t0?.subtopics[0], s1 = t1?.subtopics[0];
  const lv = (sub: string | undefined, level: LevelNo) => (sub ? getLevelIds(GRADE, sub, level).ids : []);
  const tasks: Record<string, ClassTask[]> = {
    c1: [
      { id: "tk3", kind: "diagnostic", title: defaultTaskTitle("diagnostic", { topic: t1?.name }), grade: GRADE, topicId: t1?.id, questionIds: pickDiagnostic(t1?.id), createdAt: now - 1 * day, dueAt: now + 6 * day, inApp: false },
      { id: "tk2", kind: "worksheet", title: defaultTaskTitle("worksheet", { subtopic: s1?.name }, 2), grade: GRADE, subtopicId: s1?.id, level: 2, questionIds: lv(s1?.id, 2), createdAt: now - 4 * day, inApp: false },
      { id: "tk1", kind: "worksheet", title: defaultTaskTitle("worksheet", { subtopic: s0?.name }, 1), grade: GRADE, subtopicId: s0?.id, level: 1, questionIds: lv(s0?.id, 1), createdAt: now - 9 * day, inApp: false },
    ],
    c2: [
      { id: "tk4", kind: "worksheet", title: defaultTaskTitle("worksheet", { subtopic: s0?.name }, 1), grade: GRADE, subtopicId: s0?.id, level: 1, questionIds: lv(s0?.id, 1), createdAt: now - 3 * day, inApp: false },
    ],
  };
  const posts: Record<string, ClassPost[]> = {
    c1: [
      { id: "p1", kind: "birthday", text: "Happy birthday, Aisha!", createdAt: now - 2 * h, authorUid: "a1", studentUid: "a1" },
      { id: "p2", kind: "teacher", text: "Next class: Friday 8:30 am in Room 4-12. Please bring your calculators and the Fractions worksheet.", createdAt: now - 5 * h, authorUid: TEACHER.uid },
      { id: "p3", kind: "milestone", text: `Zach completed ${s0?.name ?? "Fractions"} · Level 1`, createdAt: now - 26 * h, authorUid: "a2", studentUid: "a2" },
      { id: "p4", kind: "teacher", text: `Answers for ${tasks.c1[2].title} are attached. Check your own work, then try the ones you got wrong again in the app.`, createdAt: now - 7 * day, authorUid: TEACHER.uid, taskId: "tk1",
        attachments: [{ name: "Fractions L1 answers.pdf", url: "https://example.com/answers.pdf", kind: "pdf" }] },
      { id: "p5", kind: "milestone", text: `Mei Ling levelled up to LV2 in ${s0?.name ?? "Fractions"}!`, createdAt: now - 8 * day, authorUid: "a3", studentUid: "a3" },
    ],
    c2: [{ id: "p6", kind: "teacher", text: "Well done on the first worksheet, 6 Honesty. Keep it up!", createdAt: now - 2 * day, authorUid: TEACHER.uid }],
  };
  const marks: Record<string, TaskMarks[]> = {};
  const rnd = mulberry32(7);
  for (const c of classes) for (const t of tasks[c.id]) {
    if (t.id === "tk3") continue; // the newest test is not marked yet
    marks[`${c.id}/${t.id}`] = c.students.slice(0, Math.ceil(c.students.length * 0.7)).map((s) => ({
      studentUid: s.uid, markedAt: now - 2 * day, source: "teacher" as const,
      marks: Object.fromEntries(t.questionIds.map((q) => [q, rnd() < 0.68 ? "right" as const : "wrong" as const])),
    }));
  }
  return { classes, posts, tasks, marks, seq: 100 };
}

/** One question per subtopic of the topic, mixed LV1-LV3, at most 12 (what the server does). */
function pickDiagnostic(topicId: string | undefined): string[] {
  const t = getTopics(GRADE).find((x) => x.id === topicId);
  if (!t) return [];
  return t.subtopics.slice(0, 12).map((s, i) => (s.main[(((i % 3) + 1) as LevelNo)] ?? [])[i % 5]).filter((x): x is string => !!x);
}

let state: State | null = null;
function load(): State {
  if (state) return state;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) { state = JSON.parse(raw) as State; return state; }
  } catch { /* no storage */ }
  state = seedState(Date.now());
  save();
  return state;
}
function save() {
  try { if (typeof localStorage !== "undefined" && state) localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
const wait = <T>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms));
const cls = (id: string) => { const c = load().classes.find((x) => x.id === id); if (!c) throw new ApiError("not-found", "Class not found"); return c; };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---- stats: deterministic per student, from the bundled curriculum ----
const statsCache = new Map<string, StatsByQuestion>();
function statsOf(uid: string): StatsByQuestion {
  const hit = statsCache.get(uid);
  if (hit) return hit;
  const rnd = mulberry32(hash(uid));
  const ability = 0.35 + rnd() * 0.55;
  const reach = 2 + Math.floor(rnd() * 6); // how many topics this student has opened
  const out: StatsByQuestion = {};
  const topics = getTopics(GRADE);
  const now = Date.now();
  topics.slice(0, reach).forEach((t, ti) => {
    t.subtopics.forEach((s) => {
      for (const level of [1, 2, 3] as LevelNo[]) {
        const depth = level === 1 ? 1 : level === 2 ? 0.55 - ti * 0.03 : 0.25 - ti * 0.03;
        if (rnd() > depth) continue;
        for (const id of s.main[level] ?? []) {
          if (rnd() > 0.92) continue;
          const hard = hash(id) % 100 / 100; // some questions are hard for everybody
          const p = Math.min(0.97, Math.max(0.08, ability + 0.25 - hard * 0.5 - (level - 1) * 0.12));
          let a = 0, w = 0, c = false;
          while (a < 8) { a++; if (rnd() < p) { c = true; break; } w++; if (rnd() < 0.22) break; }
          const st: QuestionStat = { a, c, w, t: now - Math.floor(rnd() * 20) * 86_400_000 };
          out[id] = st;
        }
      }
    });
  });
  statsCache.set(uid, out);
  return out;
}

export const mockBackend: TeacherBackend = {
  getDashboard: () => wait({ teacher: TEACHER, classes: clone(load().classes) }),
  async saveClass(r) {
    const s = load();
    if (!r.name.trim()) throw new ApiError("invalid-argument", "Give the class a name");
    if (r.id) { cls(r.id).name = r.name.trim(); save(); return wait({ classId: r.id }); }
    const id = `c${++s.seq}`;
    s.classes.push({ id, name: r.name.trim(), grade: r.grade, teacherUid: TEACHER.uid, students: [], createdAt: Date.now() });
    save();
    return wait({ classId: id });
  },
  async deleteClass(classId) { const s = load(); cls(classId); s.classes = s.classes.filter((c) => c.id !== classId); save(); await wait(0); },
  async addStudent(classId, code) {
    const c = cls(classId);
    const k = code.trim().toUpperCase();
    if (k === "ZZZZZZ" || k.length < 4) throw new ApiError("not-found", "No student has that friend code.");
    if (c.students.length >= 60) throw new ApiError("failed-precondition", "A class holds at most 60 students.");
    const pool = ["Lena Foo", "Omar Aziz", "Tara Singh", "Wen Hao", "Yuki Sato", "Nadia Lim"];
    const student: ClassStudent = { uid: `m${hash(k).toString(36)}`, displayName: pool[hash(k) % pool.length] };
    if (c.students.some((x) => x.uid === student.uid)) throw new ApiError("already-exists", "That student is already in this class.");
    c.students.push(student); save();
    return wait(clone(student));
  },
  async removeStudent(classId, uid) { const c = cls(classId); c.students = c.students.filter((s) => s.uid !== uid); save(); await wait(0); },
  async setBirthday(classId, uid, b) {
    const s = cls(classId).students.find((x) => x.uid === uid);
    if (!s) throw new ApiError("not-found", "Student not in this class");
    if (b === null) delete s.birthday; else { const n = normalizeBirthday(b); if (!n) throw new ApiError("invalid-argument", "Birthday must be MM-DD"); s.birthday = n; }
    save(); await wait(0);
  },
  async post(r) {
    const s = load(); cls(r.classId);
    const p: ClassPost = { id: `p${++s.seq}`, kind: "teacher", text: r.text.trim(), createdAt: Date.now(), authorUid: TEACHER.uid, attachments: r.attachments?.length ? r.attachments : undefined, taskId: r.taskId };
    (s.posts[r.classId] ??= []).unshift(p); save();
    return wait(clone(p));
  },
  async deletePost(classId, postId) { const s = load(); s.posts[classId] = (s.posts[classId] ?? []).filter((p) => p.id !== postId); save(); await wait(0); },
  listPosts: ({ classId }) => wait(clone(load().posts[classId] ?? [])),
  async uploadSignature(classId, fileName) {
    return wait<UploadSignature>({ cloudName: "mock", apiKey: "mock", timestamp: Math.floor(Date.now() / 1000), signature: "mock", folder: `p6maths/classroom/${classId}`, publicId: fileName.replace(/\.[^.]+$/, "") });
  },
  async uploadFile(_sig, file) { await wait(0, 350); return typeof URL !== "undefined" && "createObjectURL" in URL ? URL.createObjectURL(file) : `https://example.com/${file.name}`; },
  async createTask(r) {
    const s = load(); cls(r.classId);
    let questionIds: string[] = [], title = r.title?.trim();
    if (r.kind === "worksheet") {
      if (!r.subtopicId || !r.level) throw new ApiError("invalid-argument", "Pick a level");
      questionIds = getLevelIds(GRADE, r.subtopicId, r.level).ids;
      const sub = getTopics(GRADE).flatMap((t) => t.subtopics).find((x) => x.id === r.subtopicId);
      title ||= defaultTaskTitle("worksheet", { subtopic: sub?.name }, r.level);
    } else {
      if (!r.topicId) throw new ApiError("invalid-argument", "Pick a topic");
      questionIds = pickDiagnostic(r.topicId);
      title ||= defaultTaskTitle("diagnostic", { topic: getTopics(GRADE).find((t) => t.id === r.topicId)?.name });
    }
    const t: ClassTask = { id: `tk${++s.seq}`, kind: r.kind, title, grade: GRADE, subtopicId: r.subtopicId, level: r.level, topicId: r.topicId, questionIds, createdAt: Date.now(), dueAt: r.dueAt, inApp: r.kind === "diagnostic" && !!r.inApp };
    (s.tasks[r.classId] ??= []).unshift(t); save();
    return wait(clone(t));
  },
  listTasks: (classId) => wait(clone(load().tasks[classId] ?? [])),
  getTaskMarks: (classId, taskId) => wait(clone(load().marks[`${classId}/${taskId}`] ?? [])),
  async markTask(r) {
    const s = load(); cls(r.classId);
    const task = (s.tasks[r.classId] ?? []).find((t) => t.id === r.taskId);
    if (!task) throw new ApiError("not-found", "Task not found");
    const list = (s.marks[`${r.classId}/${r.taskId}`] ??= []);
    const prev = list.find((m) => m.studentUid === r.studentUid);
    const before = prev ? Object.values(prev.marks).filter((v) => v === "right").length : 0;
    const now = Object.values(r.marks).filter((v) => v === "right").length;
    const rec: TaskMarks = { studentUid: r.studentUid, marks: { ...r.marks }, markedAt: Date.now(), source: "teacher" };
    if (prev) Object.assign(prev, rec); else list.push(rec);
    save();
    return wait({ starsAwarded: Math.max(0, now - before) });
  },
  async getAnalytics({ classId, studentUid, topicId }) {
    const c = cls(classId);
    const topics = getTopics(c.grade);
    const qs = mapQuestions(topics, (id) => getQuestion(c.grade, id)?.type);
    const cl = classAnalytics(classId, c.students, statsOf, topics, qs, topicId);
    const st = studentUid ? c.students.find((s) => s.uid === studentUid) : undefined;
    return wait({ class: cl, student: st ? studentAnalytics(st.uid, st.displayName, c.grade, topics, qs, statsOf(st.uid)) : undefined }, 200);
  },
};
