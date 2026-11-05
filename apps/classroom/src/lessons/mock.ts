// Demo backend for ?mock=1 (and ?mock=parent): same shapes and rules as the real callables (backend/functions/src/lessons.ts),
// kept in localStorage "p6c.lessonsMock.v1". Starts with Teacher Lisa's demo: the Lee family (Zimo, Ziqiao), the Tan
// family (Ann) and one science lesson already run.
import type { Child, Family, Lesson, LessonReport, LessonSession, ParentHome } from "@p6/shared";
import { feedbackText } from "@p6/shared";
import { ApiError, type lessonsApi } from "../services/api";
import { readLocal, writeLocal } from "../store/storage";

interface Db { families: Family[]; children: Child[]; lessons: Lesson[]; sessions: LessonSession[]; reports: LessonReport[]; codes: Record<string, string> }
const KEY = "p6c.lessonsMock.v1";
const ME = "mock-teacher";
const id = () => Math.random().toString(36).slice(2, 10);
const code = () => Array.from({ length: 10 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
export const MOCK_PARENT_CODE = "DEMOF4M1LY".replace(/[01]/g, "A"); // fixed code of the demo Lee family

function seed(): Db {
  const now = Date.now(), day = 86_400_000;
  const lesson: Lesson = {
    id: "l1", title: "Science end-year paper practice", subject: "science", level: "P5",
    intro: "Today, {names} completed their science papers to test their understanding and experience the difficulty of their end-year papers.",
    goals: [
      { id: "g1", text: "MCQ accuracy", scripts: { good: "{name} received full marks for the MCQ.", ok: "{name} did fairly well for the MCQ.", bad: "{name} found the MCQ challenging today." } },
      { id: "g2", text: "Keywords and CER answers", scripts: { good: "{name} used keywords well and answered fully with the CER method.", ok: "{name} is applying more keywords and attempts to answer fully using the CER method; she still needs help with her phrasing.", bad: "{name} has forgotten a few keywords, so we will go through them again." } },
      { id: "g3", text: "Time management", scripts: { good: "{name} finished on time.", ok: "{name} didn't leave any question blank, but didn't manage to finish in time.", bad: "{name} ran out of time and left questions blank." } },
    ],
    parts: [{ id: "p1", title: "MCQ section" }, { id: "p2", title: "Open-ended section" }, { id: "p3", title: "Keyword review" }],
    createdBy: ME, createdAt: now - 30 * day, updatedAt: now - 30 * day,
  };
  const lesson2: Lesson = {
    id: "l2", title: "Fractions: adding unlike fractions", subject: "math", level: "P5", intro: "Today, {names} practised adding fractions with different denominators.",
    goals: [{ id: "h1", text: "Common denominators", scripts: { good: "{name} finds common denominators confidently.", ok: "{name} can find common denominators with some help.", bad: "{name} still mixes up numerators and denominators." } }],
    parts: [{ id: "q1", title: "Warm-up" }, { id: "q2", title: "Worksheet" }], createdBy: ME, createdAt: now - 20 * day, updatedAt: now - 20 * day,
  };
  const fam: Family = { id: "f1", parentName: "Ning Lee", teacherUid: ME, childIds: ["c1", "c2"], createdAt: now - 40 * day, codeSetAt: now - 40 * day };
  const fam2: Family = { id: "f2", parentName: "Mrs Tan", teacherUid: ME, childIds: ["c3"], createdAt: now - 10 * day, codeSetAt: now - 10 * day };
  const children: Child[] = [
    { id: "c1", familyId: "f1", teacherUid: ME, name: "Zimo Lee", level: "P5", createdAt: now - 40 * day },
    { id: "c2", familyId: "f1", teacherUid: ME, name: "Ziqiao Lee", level: "P5", createdAt: now - 40 * day },
    { id: "c3", familyId: "f2", teacherUid: ME, name: "Ann Tan", level: "P5", createdAt: now - 10 * day },
  ];
  const date = now - 1 * day;
  const reports: LessonReport[] = [
    { id: "s1_c1", sessionId: "s1", lessonId: "l1", lessonTitle: lesson.title, childId: "c1", familyId: "f1", teacherUid: ME, date, createdAt: date, goals: { g1: "good", g2: "bad", g3: "ok" }, note: "She has improved her knowledge gaps.", partsDone: ["p1", "p2"] },
    { id: "s1_c2", sessionId: "s1", lessonId: "l1", lessonTitle: lesson.title, childId: "c2", familyId: "f1", teacherUid: ME, date, createdAt: date, goals: { g1: "good", g2: "ok" }, note: "She received bonus points for correctly answering topics she hasn't learnt.", partsDone: ["p1", "p2", "p3"] },
  ];
  const text = feedbackText({ parentName: fam.parentName, lesson, children: reports.map((r) => ({ name: children.find((c) => c.id === r.childId)!.name, goals: r.goals, note: r.note })) });
  const sessions: LessonSession[] = [{ id: "s1", lessonId: "l1", teacherUid: ME, date, childIds: ["c1", "c2"], familyTexts: { f1: text }, createdAt: date, updatedAt: date }];
  return { families: [fam, fam2], children, lessons: [lesson, lesson2], sessions, reports, codes: { [MOCK_PARENT_CODE]: "f1" } };
}
function load(): Db {
  try { const s = readLocal(KEY); if (s) return JSON.parse(s) as Db; } catch { /* reseed */ }
  const d = seed(); save(d); return d;
}
const save = (d: Db) => writeLocal(KEY, JSON.stringify(d));
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
const notFound = (m: string) => new ApiError("not-found", m);

export const mockLessons: typeof lessonsApi = {
  async getStudents() { const d = load(); return delay({ families: d.families, children: d.children, teachers: [{ uid: ME, name: "Teacher Lisa" }, { uid: "mock-t2", name: "Teacher Tom" }] }); },
  async saveFamily(r) {
    const d = load(); const now = Date.now();
    if (!r.parentName.trim() || !r.children.some((c) => c.name.trim())) throw new ApiError("invalid-argument", "Enter the parent's name and at least one child.");
    const fam: Family = r.id ? d.families.find((f) => f.id === r.id)! : { id: id(), parentName: "", teacherUid: r.teacherUid || ME, childIds: [], createdAt: now, codeSetAt: now };
    if (!fam) throw notFound("No such family.");
    const kids: Child[] = r.children.filter((c) => c.name.trim()).map((c) => {
      const old = c.id ? d.children.find((k) => k.id === c.id) : undefined;
      return old ? { ...old, name: c.name.trim(), level: c.level } : { id: id(), familyId: fam.id, teacherUid: fam.teacherUid, name: c.name.trim(), level: c.level || "P6", createdAt: now };
    });
    d.children = [...d.children.filter((k) => k.familyId !== fam.id), ...kids];
    const next = { ...fam, parentName: r.parentName.trim(), teacherUid: r.teacherUid || fam.teacherUid, childIds: kids.map((k) => k.id) };
    d.families = [...d.families.filter((f) => f.id !== fam.id), next];
    let newCode: string | undefined;
    if (!r.id) { newCode = code(); d.codes[newCode] = fam.id; }
    save(d);
    return delay({ family: next, children: kids, ...(newCode ? { code: newCode } : {}) });
  },
  async resetFamilyCode(familyId) {
    const d = load(); for (const k of Object.keys(d.codes)) if (d.codes[k] === familyId) delete d.codes[k];
    const c = code(); d.codes[c] = familyId; save(d); return delay({ code: c });
  },
  async deleteFamily(familyId) {
    const d = load();
    d.families = d.families.filter((f) => f.id !== familyId); d.children = d.children.filter((c) => c.familyId !== familyId);
    d.reports = d.reports.filter((r) => r.familyId !== familyId); for (const k of Object.keys(d.codes)) if (d.codes[k] === familyId) delete d.codes[k];
    save(d); return delay({ ok: true as const });
  },
  async getChild(childId) {
    const d = load(); const child = d.children.find((c) => c.id === childId); if (!child) throw notFound("No such student.");
    return delay({ child, family: d.families.find((f) => f.id === child.familyId)!, reports: d.reports.filter((r) => r.childId === childId).sort((a, b) => b.date - a.date) });
  },
  async listLessons() { return delay({ lessons: load().lessons.filter((l) => !l.archived).sort((a, b) => a.title.localeCompare(b.title)) }); },
  async saveLesson(r) {
    const d = load(); const now = Date.now();
    if (!r.title.trim()) throw new ApiError("invalid-argument", "Give the lesson a title.");
    const goals = r.goals.filter((g) => g.text.trim()).map((g) => ({ ...g, id: g.id || id() }));
    const parts = r.parts.filter((p) => p.title.trim()).map((p) => ({ ...p, id: p.id || id() }));
    const old = r.id ? d.lessons.find((l) => l.id === r.id) : undefined;
    const lesson: Lesson = { ...(old ?? { id: id(), createdBy: ME, createdAt: now }), title: r.title.trim(), subject: r.subject, level: r.level, intro: r.intro, goals, parts, updatedAt: now } as Lesson;
    d.lessons = [...d.lessons.filter((l) => l.id !== lesson.id), lesson]; save(d); return delay({ lesson });
  },
  async deleteLesson(lessonId) { const d = load(); d.lessons = d.lessons.map((l) => (l.id === lessonId ? { ...l, archived: true } : l)); save(d); return delay({ ok: true as const }); },
  async saveSession(r) {
    const d = load(); const now = Date.now(); const lesson = d.lessons.find((l) => l.id === r.lessonId);
    if (!lesson) throw notFound("No such lesson.");
    if (!r.reports.length) throw new ApiError("invalid-argument", "Pick the children who were in the lesson.");
    const old = r.id ? d.sessions.find((s) => s.id === r.id) : undefined;
    const session: LessonSession = { id: old?.id ?? id(), lessonId: r.lessonId, teacherUid: ME, date: r.date, childIds: r.reports.map((x) => x.childId), familyTexts: r.familyTexts, createdAt: old?.createdAt ?? now, updatedAt: now };
    const reports: LessonReport[] = r.reports.map((x) => ({ ...x, id: `${session.id}_${x.childId}`, sessionId: session.id, lessonId: lesson.id, lessonTitle: lesson.title,
      familyId: d.children.find((c) => c.id === x.childId)!.familyId, teacherUid: ME, date: r.date, createdAt: now }));
    d.sessions = [...d.sessions.filter((s) => s.id !== session.id), session];
    d.reports = [...d.reports.filter((x) => x.sessionId !== session.id), ...reports];
    save(d); return delay({ session, reports });
  },
  async parentSignIn() { return delay({ token: "mock" }); },
  async codeSignIn(c: string) { return delay({ token: "mock", kind: c.length === 12 ? ("staff" as const) : ("parent" as const) }); },
  async parentGetHome(): Promise<ParentHome> {
    const d = load(); const family = d.families.find((f) => f.id === "f1") ?? d.families[0];
    const reps = d.reports.filter((r) => r.familyId === family.id).sort((a, b) => b.date - a.date);
    const feedback: Record<string, string> = {};
    for (const s of d.sessions) if (s.familyTexts[family.id]) feedback[s.id] = s.familyTexts[family.id];
    return delay({
      family: { id: family.id, parentName: family.parentName },
      children: d.children.filter((c) => c.familyId === family.id).map((c) => ({ id: c.id, name: c.name, level: c.level })),
      reports: reps.map(({ partsDone: _p, teacherUid: _t, ...rest }) => rest),
      lessons: d.lessons.filter((l) => reps.some((r) => r.lessonId === l.id)).map((l) => ({ id: l.id, title: l.title, subject: l.subject, level: l.level, goals: l.goals.map((g) => ({ id: g.id, text: g.text })) })),
      feedback,
    });
  },
};
