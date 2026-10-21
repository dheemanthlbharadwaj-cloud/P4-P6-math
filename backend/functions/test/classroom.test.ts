import { describe, expect, it } from "vitest";
import type { ClassDoc, ClassPost, MarkValue } from "../src/shared";
import { CONTENT } from "../src/content";
import {
  birthdayIsToday, birthdaysToday, checkClassOwner, checkRosterMember, checkTeacher, cloudinarySignature, firstName, pickDiagnostic, planMarks, safePublicId,
  settleStars, taskOpen, touchedLevels, validBirthday, validateCreateTask, validateMarks, validatePost, validateSaveClass, type LevelRef,
} from "../src/logic/classroom";
import { buildQstatsPatch, deltasFromAnswers, mapQuestionSet, type FieldOps } from "../src/logic/qstats";
import type { LevelStarsDoc } from "../src/logic/levelStars";
import { resolveLevelStars, levelNewlyComplete } from "../src/logic/levelStars";
import { birthdayPost, groupOpened, isLevelDone, milestonePosts } from "../src/logic/milestones";
import { classAnalytics, mapIndex, studentAnalytics, type AnalyticsContent } from "../src/logic/classAnalytics";
import { FeedCache } from "../src/logic/feedCache";
import { startOfSgtDay } from "../src/logic/dates";

// ---------- a tiny fake world: one level of 5 questions, in memory ----------
const LEVEL = ["q1", "q2", "q3", "q4", "q5"];
const KEY = "p6-frac#1";
const ref: LevelRef = { subtopicId: "p6-frac", level: 1, key: KEY };
const levels = { [KEY]: LEVEL };

/** What the teacherMarkTask transaction does to the student's data, minus Firestore. */
class Student {
  marks: Record<string, MarkValue> = {};
  levelDoc: LevelStarsDoc | undefined;
  stars = 0;
  qstats: Record<string, { a: number; w: number; c: boolean }> = {};
  homework = new Set<string>();
  wrong = new Map<string, boolean>(); // bookmark: id → active
  completions: string[] = [];
  mark(incoming: Record<string, MarkValue>, retired: string[] = []) {
    const plan = planMarks(this.marks, incoming);
    if (!plan.changed.length) return { stars: 0, duplicate: true };
    const touched = touchedLevels(plan, (q) => (LEVEL.includes(q) ? ref : undefined));
    const s = settleStars(touched, touched.map(() => this.levelDoc), plan.merged, levels, retired);
    for (const w of s.writes) this.levelDoc = w.write;
    this.stars += s.stars;
    this.marks = plan.merged;
    for (const d of plan.deltas) {
      const q = (this.qstats[d.questionId] ??= { a: 0, w: 0, c: false });
      q.a += d.attempts; q.w += d.wrong; q.c ||= d.correct;
      if (d.homework === "add") this.homework.add(d.questionId); else if (d.homework === "remove") this.homework.delete(d.questionId);
    }
    for (const q of plan.flagWrong) this.wrong.set(q, true);
    for (const q of plan.clearWrong) this.wrong.set(q, false);
    s.completed.forEach((c) => this.completions.push(`${c.subtopicId}#${c.level}`));
    return { stars: s.stars, duplicate: false };
  }
}

describe("teacher marks apply like in-app answers", () => {
  it("right = a star each, once; sending the same marks again pays nothing", () => {
    const s = new Student();
    expect(s.mark({ q1: "right", q2: "right" }).stars).toBe(2);
    expect(s.mark({ q1: "right", q2: "right" })).toEqual({ stars: 0, duplicate: true });
    expect(s.stars).toBe(2);
    expect(s.qstats.q1).toEqual({ a: 1, w: 0, c: true });
  });
  it("right -> wrong -> right never double-counts the star", () => {
    const s = new Student();
    expect(s.mark({ q1: "right" }).stars).toBe(1);
    expect(s.mark({ q1: "wrong" }).stars).toBe(0); // the star stays: once ever
    expect(s.levelDoc?.correct).toEqual(["q1"]);
    expect(s.homework.has("q1")).toBe(true);
    expect(s.wrong.get("q1")).toBe(true);
    expect(s.mark({ q1: "right" }).stars).toBe(0); // already has it
    expect(s.stars).toBe(1);
    expect(s.homework.has("q1")).toBe(false);
    expect(s.wrong.get("q1")).toBe(false);
    // one attempt, wrong count back to 0 after the correction
    expect(s.qstats.q1).toEqual({ a: 1, w: 0, c: true });
  });
  it("wrong -> right awards the star once", () => {
    const s = new Student();
    expect(s.mark({ q2: "wrong" }).stars).toBe(0);
    expect(s.qstats.q2).toEqual({ a: 1, w: 1, c: false });
    expect(s.mark({ q2: "right" }).stars).toBe(1);
    expect(s.mark({ q2: "right" }).stars).toBe(0);
    expect(s.qstats.q2).toEqual({ a: 1, w: 0, c: true });
    expect(s.stars).toBe(1);
  });
  it("a student who already has the in-app star gets nothing more for the same question", () => {
    const s = new Student();
    s.levelDoc = { correct: ["q3"], bonus: false };
    expect(s.mark({ q3: "right", q4: "right" }).stars).toBe(1);
  });
  it("completing the level (5 right) reports a completion once, no bonus the first time", () => {
    const s = new Student();
    expect(s.mark({ q1: "right", q2: "right", q3: "right", q4: "right" }).stars).toBe(4);
    expect(s.completions).toEqual([]);
    expect(s.mark({ q5: "right" }).stars).toBe(1);
    expect(s.completions).toEqual([KEY]);
    expect(s.mark({ q5: "wrong" }).stars).toBe(0);
    expect(s.mark({ q5: "right" }).stars).toBe(0);
    expect(s.completions).toEqual([KEY]);
  });
  it("replaying a complete level, all 5 right on paper, pays the one-off bonus once", () => {
    const s = new Student();
    s.levelDoc = { correct: [...LEVEL], bonus: false };
    expect(s.mark({ q1: "right", q2: "right", q3: "right", q4: "right", q5: "right" }).stars).toBe(1);
    expect(s.levelDoc?.bonus).toBe(true);
    expect(s.mark({ q1: "wrong" }).stars).toBe(0);
    expect(s.mark({ q1: "right" }).stars).toBe(0);
  });
  it("a retired question does not block completion", () => {
    const s = new Student();
    s.mark({ q1: "right", q2: "right", q3: "right", q4: "right" }, ["q5"]);
    expect(s.completions).toEqual([KEY]);
  });
  it("planMarks: first mark is an attempt, a correction is not", () => {
    const p1 = planMarks({}, { a: "wrong", b: "right" });
    expect(p1.firstTime).toEqual(["a", "b"]);
    expect(p1.flagWrong).toEqual(["a"]);
    const p2 = planMarks(p1.merged, { a: "right", b: "right" });
    expect(p2.firstTime).toEqual([]);
    expect(p2.changed).toEqual([{ questionId: "a", prev: "wrong", next: "right" }]);
    expect(p2.clearWrong).toEqual(["a"]);
    expect(p2.deltas[0]).toMatchObject({ attempts: 0, wrong: -1, correct: true });
  });
  it("marks of questions not in the task are refused", () => {
    expect(validateMarks({ q1: "right" }, LEVEL).ok).toBe(true);
    expect(validateMarks({ zz: "right" }, LEVEL).ok).toBe(false);
    expect(validateMarks({ q1: "maybe" }, LEVEL).ok).toBe(false);
    expect(validateMarks({}, LEVEL).ok).toBe(false);
    expect(validateMarks([], LEVEL).ok).toBe(false);
  });
});

// ---------- qstats ----------
const ops = (now = 1000): FieldOps<unknown> => ({
  increment: (n) => ({ inc: n }), arrayUnion: (...v) => ({ union: v }), del: () => "DELETE", now,
});
describe("qstats patch", () => {
  const isMap = (id: string) => LEVEL.includes(id);
  it("one patch per call; unknown (pool) questions are dropped", () => {
    const d = deltasFromAnswers([
      { questionId: "q1", correct: false }, { questionId: "q1", correct: true }, { questionId: "pool9", correct: true }, { questionId: "q2", correct: false },
    ], isMap);
    expect(d.map((x) => x.questionId)).toEqual(["q1", "q2"]);
    const p = buildQstatsPatch("P6", d, ops())! as { stats: Record<string, Record<string, unknown>>; homework: Record<string, unknown> };
    expect(p.stats.q1).toEqual({ t: 1000, a: { inc: 2 }, w: { inc: 1 }, c: true });
    expect(p.stats.q2).toEqual({ t: 1000, a: { inc: 1 }, w: { inc: 1 } });
    expect(p.stats.q2.c).toBeUndefined(); // never written false: completion is sticky
    expect(p.homework).toEqual({ q1: "DELETE" });
  });
  it("nothing to write → null; app task adds tasksDone", () => {
    expect(buildQstatsPatch("P6", [], ops())).toBeNull();
    const p = buildQstatsPatch("P6", [{ questionId: "q1", attempts: 1, wrong: 0, correct: true }], ops(), { tasksDone: "t1" })!;
    expect(p.tasksDone).toEqual({ union: ["t1"] });
  });
  it("a teacher wrong mark goes onto the homework list, right takes it off", () => {
    const p = buildQstatsPatch("P6", planMarks({}, { q1: "wrong", q2: "right" }).deltas, ops())! as { homework: Record<string, unknown> };
    expect(p.homework).toEqual({ q1: true, q2: "DELETE" });
  });
  it("map question set comes from the levels", () => {
    expect([...mapQuestionSet({ levels: { a: ["x", "y"], b: ["y", "z"] } })].sort()).toEqual(["x", "y", "z"]);
  });
});

// ---------- diagnostic picking ----------
const idsOf = (sub: string, level: number) => Array.from({ length: 5 }, (_, i) => `${sub}-L${level}-${i}`);
describe("diagnostic picking", () => {
  const subs = ["a", "b", "c", "d", "e"];
  it("one question per subtopic, mixed levels, deterministic", () => {
    const x = pickDiagnostic(subs, idsOf);
    expect(x).toHaveLength(5);
    expect(x).toEqual(pickDiagnostic(subs, idsOf));
    expect(x.map((q) => q.split("-")[0])).toEqual(subs);
    expect(new Set(x.map((q) => q.split("-")[1])).size).toBe(3); // LV1, LV2 and LV3 all appear
  });
  it("max 12, spread over a long topic", () => {
    const many = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const x = pickDiagnostic(many, idsOf);
    expect(x).toHaveLength(12);
    expect(new Set(x).size).toBe(12);
    expect(x[0].startsWith("s0-")).toBe(true);
    expect(x[11].startsWith("s18-") || x[11].startsWith("s17-") || x[11].startsWith("s19-")).toBe(true);
  });
  it("a subtopic without a question at its level falls back to the next level; none at all is skipped", () => {
    const only = (sub: string, level: number) => (sub === "b" ? (level === 3 ? ["b3"] : []) : sub === "c" ? [] : [`${sub}${level}`]);
    const x = pickDiagnostic(["a", "b", "c", "d"], only);
    expect(x).toHaveLength(3);
    expect(x[1]).toBe("b3");
  });
  it("works on the real bundle: every topic gives <= 12 auto-markable level questions", () => {
    const c = CONTENT.P6!;
    for (const t of c.topics) {
      const x = pickDiagnostic(t.subtopics, (s, l) => c.levels[`${s}#${l}`] ?? []);
      expect(x.length).toBeGreaterThan(0);
      expect(x.length).toBeLessThanOrEqual(12);
      expect(x.every((q) => !!c.answers[q])).toBe(true);
    }
  });
});

// ---------- analytics ----------
const AC: AnalyticsContent = {
  levels: { "s1#1": ["a", "b"], "s1#2": ["c"], "s1#3": [], "s2#1": ["d"], "s2#2": [], "s2#3": [] },
  answers: { a: { t: "mcq" }, b: { t: "open" }, c: { t: "mcq" }, d: { t: "open" } },
  topics: [{ id: "t1", name: "Topic One", subtopics: ["s1"] }, { id: "t2", name: "Topic Two", subtopics: ["s2"] }],
};
describe("analytics aggregation", () => {
  const stats = {
    amy: { a: { a: 1, c: true, w: 0, t: 1 }, b: { a: 3, c: false, w: 3, t: 1 } },
    bob: { a: { a: 2, c: true, w: 1, t: 1 }, d: { a: 1, c: true, w: 0, t: 1 } },
    cat: {},
  };
  const roster = [{ uid: "amy", displayName: "Amy" }, { uid: "bob", displayName: "Bob" }, { uid: "cat", displayName: "Cat" }];
  const byUid = new Map(Object.entries(stats));
  it("index: topic, level and type per map question", () => {
    const i = mapIndex(AC);
    expect(i.questions.map((q) => [q.questionId, q.topicId, q.level, q.type])).toEqual([["a", "t1", 1, "mcq"], ["b", "t1", 1, "open"], ["c", "t1", 2, "mcq"], ["d", "t2", 1, "open"]]);
  });
  it("student view", () => {
    const s = studentAnalytics(AC, "amy", "Amy", "P6", stats.amy);
    expect(s.topics[0]).toMatchObject({ topicId: "t1", title: "Topic One", total: 3, completed: 1, attempted: 2, byType: { mcq: { total: 2, completed: 1 }, open: { total: 1, completed: 0 } } });
    expect(s.topics[1]).toMatchObject({ total: 1, completed: 0, attempted: 0 });
    expect(s.questions).toEqual([
      { questionId: "a", subtopicId: "s1", level: 1, attempts: 1, completed: true, wrong: 0 },
      { questionId: "b", subtopicId: "s1", level: 1, attempts: 3, completed: false, wrong: 3 },
    ]);
    expect(studentAnalytics(AC, "amy", "Amy", "P6", stats.amy, "t2").topics.map((t) => t.topicId)).toEqual(["t2"]);
  });
  it("class view: sums over students, hardest first", () => {
    const c = classAnalytics(AC, "c1", roster, byUid);
    expect(c.topics[0]).toMatchObject({ topicId: "t1", students: 3, total: 3, completed: 2, attempted: 3 });
    expect(c.topics[1]).toMatchObject({ topicId: "t2", completed: 1, attempted: 1 });
    expect(c.questions[0]).toMatchObject({ questionId: "b", studentsAttempted: 1, studentsCompleted: 0, totalAttempts: 3, avgAttempts: 3 });
    expect(c.questions.find((q) => q.questionId === "a")).toMatchObject({ studentsAttempted: 2, studentsCompleted: 2, totalAttempts: 3, avgAttempts: 1.5 });
    expect(c.questions.some((q) => q.questionId === "c")).toBe(false); // nobody tried it
    expect(c.students).toEqual([
      { uid: "amy", displayName: "Amy", completed: 1, attempted: 2 }, { uid: "bob", displayName: "Bob", completed: 2, attempted: 2 }, { uid: "cat", displayName: "Cat", completed: 0, attempted: 0 },
    ]);
  });
  it("class view with a topic filter keeps that topic's questions and student counts", () => {
    const c = classAnalytics(AC, "c1", roster, byUid, "t2");
    expect(c.topics.map((t) => t.topicId)).toEqual(["t2"]);
    expect(c.questions.map((q) => q.questionId)).toEqual(["d"]);
    expect(c.students.map((s) => s.completed)).toEqual([0, 1, 0]);
  });
  it("real bundle: every map question is counted once and typed", () => {
    const c = CONTENT.P6!;
    const i = mapIndex(c);
    expect(new Set(i.questions.map((q) => q.questionId)).size).toBe(i.questions.length);
    expect(i.questions.every((q) => q.type === "mcq" || q.type === "open")).toBe(true);
    expect(c.topics.every((t) => !!t.name)).toBe(true);
  });
});

// ---------- milestones ----------
describe("milestones", () => {
  const subs = ["s1", "s2", "s3"];
  it("a level group opens when the last subtopic completes that level", () => {
    const done = new Set(["s1#1", "s2#1"]);
    const isDone = (s: string, l: number) => done.has(`${s}#${l}`);
    expect(groupOpened(subs, 1, "s3", isDone)).toBe(2);
    expect(groupOpened(subs, 1, "s3", (s, l) => s !== "s2" && isDone(s, l))).toBeNull();
    expect(groupOpened(subs, 3, "s3", () => true)).toBeNull(); // nothing above LV3
  });
  it("level done: flag, qstats stars or synced progress", () => {
    expect(isLevelDone({ ids: ["a", "b"], starred: new Set(["a", "b"]) })).toBe(true);
    expect(isLevelDone({ ids: ["a", "b"], starred: new Set(["a"]) })).toBe(false);
    expect(isLevelDone({ ids: ["a", "b"], starred: new Set(["a"]), progress: { correctIds: ["b"] } })).toBe(true);
    expect(isLevelDone({ ids: ["a", "b"], starred: new Set(), progress: { completed: true } })).toBe(true);
    expect(isLevelDone({ ids: [], starred: new Set() })).toBe(false);
  });
  it("only the first completion of a level is a milestone", () => {
    const ids = ["q1", "q2"];
    const first = resolveLevelStars(undefined, ids, ids, ids);
    expect(levelNewlyComplete(ids, first.correctBefore, first)).toBe(true);
    const replay = resolveLevelStars({ correct: ids, bonus: false }, ids, ids, ids);
    expect(levelNewlyComplete(ids, replay.correctBefore, replay)).toBe(false);
    const partial = resolveLevelStars(undefined, ids, ids, ["q1"]);
    expect(levelNewlyComplete(ids, partial.correctBefore, partial)).toBe(false);
    const finishing = resolveLevelStars({ correct: ["q1"] }, ids, ids, ["q2"]);
    expect(levelNewlyComplete(ids, finishing.correctBefore, finishing)).toBe(true);
  });
  it("level stars helper keeps the stars of retired questions on record (as submitLevelResult always did)", () => {
    const u = resolveLevelStars({ correct: ["q1", "q5"], bonus: false }, LEVEL, ["q1", "q2", "q3", "q4"], ["q2"]);
    expect(u.correctBefore).toEqual(["q1"]);
    expect(u.write).toEqual({ correct: ["q1", "q2", "q5"], bonus: false });
    expect(resolveLevelStars(undefined, LEVEL, LEVEL, []).write).toBeNull(); // nothing new: no write
  });
  it("post texts and idempotent ids", () => {
    const [a, b] = milestonePosts("u1", "Zach", "P6", "p6-frac", { subtopicName: "Fractions", topicId: "t-frac", topicName: "Fractions", level: 1, opened: 2 }, 5);
    expect(a).toMatchObject({ id: "ms_u1_P6_p6-frac_1", kind: "milestone", text: "Zach completed Fractions · Level 1", authorUid: "u1", studentUid: "u1" });
    expect(b).toMatchObject({ id: "lu_u1_P6_t-frac_2", text: "Zach levelled up to LV2 in Fractions!" });
    expect(milestonePosts("u1", "Zach", "P6", "p6-frac", { subtopicName: "F", topicId: "t", topicName: "T", level: 3, opened: null }, 5)).toHaveLength(1);
  });
});

// ---------- birthdays ----------
describe("birthdays", () => {
  it("matches MM-DD of the SGT date", () => {
    expect(birthdayIsToday("10-21", "2026-10-21")).toBe(true);
    expect(birthdayIsToday("10-22", "2026-10-21")).toBe(false);
    expect(birthdayIsToday(undefined, "2026-10-21")).toBe(false);
    expect(birthdayIsToday("13-40", "2026-10-21")).toBe(false);
  });
  it("29 Feb is celebrated on 28 Feb in a non-leap year only", () => {
    expect(birthdayIsToday("02-29", "2027-02-28")).toBe(true);
    expect(birthdayIsToday("02-29", "2028-02-28")).toBe(false);
    expect(birthdayIsToday("02-29", "2028-02-29")).toBe(true);
  });
  it("validBirthday", () => {
    for (const ok of ["01-31", "02-29", "12-01"]) expect(validBirthday(ok)).toBe(true);
    for (const bad of ["02-30", "04-31", "00-10", "1-1", "2026-10-21", 5, null]) expect(validBirthday(bad)).toBe(false);
  });
  it("roster scan picks today's students, one post id per student per year", () => {
    const cls = { students: [{ uid: "a", displayName: "Amy Tan", birthday: "10-21" }, { uid: "b", displayName: "Bob" }, { uid: "c", displayName: "Cat", birthday: "03-02" }] };
    expect(birthdaysToday(cls, "2026-10-21")).toEqual([{ uid: "a", displayName: "Amy Tan" }]);
    const p = birthdayPost("a", firstName("Amy Tan"), "2026-10-21", 9);
    expect(p).toMatchObject({ id: "bd_a_2026", kind: "birthday", text: "Happy birthday, Amy!" });
  });
});

// ---------- access ----------
const cls = (over: Partial<ClassDoc> = {}): ClassDoc => ({ id: "c1", name: "6 Courage", grade: "P6", teacherUid: "t1", students: [{ uid: "s1", displayName: "S" }], createdAt: 1, ...over });
describe("access checks", () => {
  it("teacher must exist and be active", () => {
    expect(checkTeacher({ active: true }).ok).toBe(true);
    expect(checkTeacher({ active: false })).toMatchObject({ ok: false, code: "permission-denied" });
    expect(checkTeacher(undefined)).toMatchObject({ ok: false, code: "permission-denied" });
    expect(checkTeacher({})).toMatchObject({ ok: false });
  });
  it("class owner only", () => {
    expect(checkClassOwner(cls(), "t1").ok).toBe(true);
    expect(checkClassOwner(cls(), "t2")).toMatchObject({ ok: false, code: "permission-denied" });
    expect(checkClassOwner(null, "t1")).toMatchObject({ ok: false, code: "not-found" });
  });
  it("students may only act in classes they are on the roster of", () => {
    expect(checkRosterMember(cls(), "s1").ok).toBe(true);
    expect(checkRosterMember(cls(), "s2")).toMatchObject({ ok: false, code: "permission-denied" });
    expect(checkRosterMember(undefined, "s1")).toMatchObject({ ok: false, code: "not-found" });
  });
  it("in-app tasks stay open until the end of their due day (SGT)", () => {
    const due = Date.parse("2026-10-21T10:00:00Z"); // 18:00 SGT on the 21st
    expect(taskOpen({ dueAt: due }, Date.parse("2026-10-21T15:59:00Z"), startOfSgtDay)).toBe(true); // 23:59 SGT
    expect(taskOpen({ dueAt: due }, Date.parse("2026-10-21T16:00:00Z"), startOfSgtDay)).toBe(false);
    expect(taskOpen({}, Date.now(), startOfSgtDay)).toBe(true);
  });
});

// ---------- validators ----------
describe("validators", () => {
  it("class", () => {
    expect(validateSaveClass({ name: " 6 Courage ", grade: "P6" })).toMatchObject({ ok: true, name: "6 Courage" });
    expect(validateSaveClass({ name: "", grade: "P6" }).ok).toBe(false);
    expect(validateSaveClass({ name: "x".repeat(41), grade: "P6" }).ok).toBe(false);
    expect(validateSaveClass({ name: "A", grade: "P3" }).ok).toBe(false);
    expect(validateSaveClass({ name: "A", grade: "P6", id: "../x" }).ok).toBe(false);
  });
  it("post", () => {
    expect(validatePost({ text: "Hello" }).ok).toBe(true);
    expect(validatePost({ text: "" }).ok).toBe(false);
    expect(validatePost({ text: "x".repeat(2001) }).ok).toBe(false);
    expect(validatePost({ text: "", attachments: [{ name: "Answers", url: "https://res.cloudinary.com/n9gn4u6k/a.pdf", kind: "pdf" }] }).ok).toBe(true);
    expect(validatePost({ text: "a", attachments: [{ name: "x", url: "javascript:alert(1)", kind: "link" }] }).ok).toBe(false);
    expect(validatePost({ text: "a", attachments: [{ name: "x", url: "http://x.com", kind: "link" }] }).ok).toBe(false);
    expect(validatePost({ text: "a", attachments: [{ name: "x", url: "https://x.com", kind: "zip" }] }).ok).toBe(false);
    expect(validatePost({ text: "a", attachments: Array.from({ length: 11 }, () => ({ name: "x", url: "https://x.com", kind: "link" })) }).ok).toBe(false);
  });
  it("task", () => {
    const now = Date.now();
    expect(validateCreateTask({ kind: "worksheet", subtopicId: "p6-fractions-x", level: 1 }, now)).toMatchObject({ ok: true, req: { inApp: false } });
    expect(validateCreateTask({ kind: "worksheet", subtopicId: "p6-fractions-x", level: 1, inApp: true }, now)).toMatchObject({ req: { inApp: false } }); // paper
    expect(validateCreateTask({ kind: "worksheet", subtopicId: "p6-fractions-x" }, now).ok).toBe(false);
    expect(validateCreateTask({ kind: "diagnostic", topicId: "fractions" }, now)).toMatchObject({ ok: true, req: { inApp: true } });
    expect(validateCreateTask({ kind: "diagnostic", topicId: "fractions", inApp: false }, now)).toMatchObject({ req: { inApp: false } });
    expect(validateCreateTask({ kind: "diagnostic" }, now).ok).toBe(false);
    expect(validateCreateTask({ kind: "quiz" }, now).ok).toBe(false);
    expect(validateCreateTask({ kind: "diagnostic", topicId: "fractions", dueAt: "soon" }, now).ok).toBe(false);
  });
});

// ---------- Cloudinary ----------
describe("cloudinary signature", () => {
  it("matches the documented example (sorted params + secret, sha1)", () => {
    const sig = cloudinarySignature({ timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" }, "abcd");
    expect(sig).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });
  it("public ids are safe", () => {
    expect(safePublicId("Answers – Fractions L1 (v2).pdf", "ab12cd")).toBe("Answers-Fractions-L1-v2-ab12cd");
    expect(safePublicId("../../etc/passwd", "x")).toBe("etc-passwd-x");
    expect(safePublicId("....", "x")).toBe("file-x");
  });
});

// ---------- feed cache ----------
describe("feed cache", () => {
  const post = (id: string, createdAt: number): ClassPost => ({ id, kind: "teacher", text: id, createdAt, authorUid: "t" });
  it("a refresh reads only newer posts; a full re-read after the hard TTL or invalidate()", async () => {
    let now = 0;
    const db = [post("a", 1), post("b", 2)];
    const calls = { newest: 0, since: 0, sinceDocs: 0 };
    const feed = new FeedCache({
      async newest(_c, limit) { calls.newest++; return [...db].sort((x, y) => y.createdAt - x.createdAt).slice(0, limit); },
      async since(_c, since) { calls.since++; const r = db.filter((p) => p.createdAt >= since); calls.sinceDocs += r.length; return r; },
    }, 3, 60_000, 600_000, 10, () => now);
    expect((await feed.get("c")).map((p) => p.id)).toEqual(["b", "a"]);
    now = 30_000;
    await feed.get("c");
    expect(calls).toMatchObject({ newest: 1, since: 0 }); // fresh: no reads
    db.push(post("c", 3));
    now = 61_000;
    expect((await feed.get("c")).map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(calls).toMatchObject({ newest: 1, since: 1 });
    expect(calls.sinceDocs).toBe(2); // the newest cached post (same ms) + the new one, not the whole feed
    db.push(post("d", 4), post("e", 5));
    now = 130_000;
    expect((await feed.get("c")).map((p) => p.id)).toEqual(["e", "d", "c"]); // trimmed to 3
    feed.invalidate("c");
    await feed.get("c");
    expect(calls.newest).toBe(2);
    now = 800_000;
    await feed.get("c");
    expect(calls.newest).toBe(3); // hard TTL: deleted posts disappear
  });
});

describe("callable wiring", () => {
  it("every callable the Netlify handler serves is exported from index.ts", async () => {
    const fs = await import("node:fs");
    const url = await import("node:url");
    const here = url.fileURLToPath(new URL(".", import.meta.url));
    const handler = fs.readFileSync(here + "../../netlify/handler.mjs", "utf8");
    const set = handler.slice(handler.indexOf("const CALLABLES"), handler.indexOf("]);", handler.indexOf("const CALLABLES")));
    const names = [...set.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const index = fs.readFileSync(here + "../src/index.ts", "utf8");
    const missing = names.filter((n) => !new RegExp(`\\b${n}\\b`).test(index));
    expect(missing).toEqual([]);
  });
});
