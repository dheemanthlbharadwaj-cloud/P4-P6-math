import { describe, expect, it } from "vitest";
import {
  canTouch, codeDocId, familyIdOfUid, makeFamilyCode, parentUid, staffOf, toParentReport, validateFamily, validateLesson, validateSession,
} from "../src/logic/lessons";
import { isFamilyCode, type LessonReport } from "../src/shared/index";

const seq = () => { let i = 0; return (max: number) => (i++ * 7) % max; };

describe("access", () => {
  it("admins see everything, active teachers their own, others nothing", () => {
    expect(staffOf(null, { active: true })).toEqual({ ok: true, admin: true });
    expect(staffOf({ active: true }, null)).toEqual({ ok: true, admin: false });
    expect(staffOf({ active: false }, { active: false })).toMatchObject({ ok: false, code: "permission-denied" });
    expect(canTouch({ uid: "t1", admin: false }, "t1")).toBe(true);
    expect(canTouch({ uid: "t1", admin: false }, "t2")).toBe(false);
    expect(canTouch({ uid: "a", admin: true }, "t2")).toBe(true);
  });
  it("parent logins are parent_<familyId>; nobody else maps to a family", () => {
    expect(familyIdOfUid(parentUid("abc123"))).toBe("abc123");
    expect(familyIdOfUid("abc123")).toBeNull();
    expect(familyIdOfUid("parent_../x")).toBeNull();
  });
  it("codes: 10 chars from the safe alphabet; stored only as a hash", () => {
    const c = makeFamilyCode();
    expect(isFamilyCode(c)).toBe(true);
    expect(codeDocId(c)).toMatch(/^[a-f0-9]{64}$/);
    expect(codeDocId(c)).not.toContain(c);
  });
});

describe("validateLesson", () => {
  it("needs a title, drops empty goals/parts, gives every goal and part a unique id", () => {
    expect(validateLesson({ title: " ", goals: [], parts: [] })).toMatchObject({ ok: false });
    const r = validateLesson({ title: "Fractions", subject: "math", level: "P5", intro: "Today {names}…",
      goals: [{ id: "g1", text: "Add fractions", scripts: { good: "{name} adds well", ok: "", bad: "x" } }, { text: "" }, { id: "g1", text: "Dup id" }],
      parts: [{ title: "Warm-up" }, { title: "" }] }, seq());
    if (!r.ok) throw new Error(r.message);
    expect(r.value.goals.map((g) => g.text)).toEqual(["Add fractions", "Dup id"]);
    expect(new Set(r.value.goals.map((g) => g.id)).size).toBe(2);
    expect(r.value.parts.map((p) => p.title)).toEqual(["Warm-up"]);
    expect(validateLesson({ title: "x", subject: "nope", goals: [], parts: [] })).toMatchObject({ ok: true, value: { subject: "other", level: "P6" } });
  });
});

describe("validateFamily", () => {
  it("needs a parent name and at least one named child", () => {
    expect(validateFamily({ parentName: "", children: [{ name: "A" }] })).toMatchObject({ ok: false });
    expect(validateFamily({ parentName: "Ning", children: [{ name: " " }] })).toMatchObject({ ok: false });
    expect(validateFamily({ parentName: "Ning", children: [{ name: "Zimo", level: "P5" }, { name: "Ziqiao" }] }))
      .toMatchObject({ ok: true, value: { children: [{ name: "Zimo", level: "P5" }, { name: "Ziqiao", level: "P6" }] } });
  });
});

describe("validateSession", () => {
  const lesson = { goals: [{ id: "g1", text: "x", scripts: { good: "", ok: "", bad: "" } }], parts: [{ id: "p1", title: "A" }] };
  const kids = new Map([["c1", { familyId: "f1" }], ["c2", { familyId: "f1" }]]);
  const base = { lessonId: "l1", date: Date.UTC(2026, 10, 1) };
  it("keeps only known goals, faces and parts; texts only for the families in the lesson", () => {
    const r = validateSession({ ...base, reports: [{ childId: "c1", goals: { g1: "good", gX: "ok", g2: "meh" }, note: " hi ", partsDone: ["p1", "pX", "p1"] }],
      familyTexts: { f1: "Hi!", f9: "no" } }, lesson, kids);
    if (!r.ok) throw new Error(r.message);
    expect(r.value.reports[0]).toEqual({ childId: "c1", goals: { g1: "good" }, note: "hi", partsDone: ["p1"] });
    expect(r.value.familyTexts).toEqual({ f1: "Hi!" });
  });
  it("refuses children the teacher can't see, a missing lesson, no date, nobody picked", () => {
    expect(validateSession({ ...base, reports: [{ childId: "c9" }] }, lesson, kids)).toMatchObject({ ok: false, code: "permission-denied" });
    expect(validateSession({ ...base, reports: [{ childId: "c1" }] }, null, kids)).toMatchObject({ ok: false, code: "not-found" });
    expect(validateSession({ ...base, date: 0, reports: [{ childId: "c1" }] }, lesson, kids)).toMatchObject({ ok: false });
    expect(validateSession({ ...base, reports: [] }, lesson, kids)).toMatchObject({ ok: false });
  });
});

describe("parents", () => {
  it("never see which parts were done or which teacher", () => {
    const r = { id: "s_c", sessionId: "s", lessonId: "l", lessonTitle: "L", childId: "c", familyId: "f", teacherUid: "t", date: 1, createdAt: 1, goals: {}, note: "", partsDone: ["p1"] } as LessonReport;
    const p = toParentReport(r) as Record<string, unknown>;
    expect(p.partsDone).toBeUndefined();
    expect(p.teacherUid).toBeUndefined();
    expect(p.lessonTitle).toBe("L");
  });
});

describe("callable wiring (lessons)", () => {
  it("every lessons callable is exported, served and in the contract", async () => {
    const fs = await import("node:fs");
    const url = await import("node:url");
    const here = url.fileURLToPath(new URL(".", import.meta.url));
    const names = ["teacherGetStudents", "teacherSaveFamily", "teacherResetFamilyCode", "teacherDeleteFamily", "teacherGetChild", "teacherListLessons", "teacherSaveLesson", "teacherDeleteLesson", "teacherSaveSession", "parentSignIn", "parentGetHome"];
    const handler = fs.readFileSync(here + "../../netlify/handler.mjs", "utf8");
    const index = fs.readFileSync(here + "../src/index.ts", "utf8");
    const api = fs.readFileSync(here + "../../../packages/shared/src/api.ts", "utf8");
    for (const n of names) {
      expect(handler, n).toMatch(new RegExp(`"${n}"`));
      expect(index, n).toMatch(new RegExp(`\\b${n}\\b`));
      expect(api, n).toMatch(new RegExp(`"${n}"`));
    }
  });
});
