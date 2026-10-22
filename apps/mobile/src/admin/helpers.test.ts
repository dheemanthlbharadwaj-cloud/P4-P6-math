import { describe, expect, it } from "vitest";
import type { AdminClassRow } from "@p6/shared";
import {
  canResetPassword, canSaveTeacher, canSearch, classNamesFor, filterClasses, formatDate, isEmail, joinableClasses, matchesClassName,
  signInMethods, sortTeachers, teacherClassCount, teacherNameOf,
} from "./helpers";

const cls = (id: string, name: string, teacherUid: string): AdminClassRow => ({ id, name, grade: "P6", teacherUid, teacherName: teacherUid, students: [], createdAt: 0 });
const classes = [cls("c2", "6 Honesty", "t1"), cls("c1", "6 Courage", "t1"), cls("c3", "5 Grace", "t2")];

describe("admin helpers", () => {
  it("counts and filters classes per teacher, sorted by name", () => {
    expect(teacherClassCount(classes, "t1")).toBe(2);
    expect(teacherClassCount(classes, "zz")).toBe(0);
    expect(filterClasses(classes, "t1").map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(filterClasses(classes, "").map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
  });
  it("sorts teachers and names them", () => {
    const t = [{ uid: "b", name: "mr lim", email: "", active: true, createdAt: 0 }, { uid: "a", name: "Ms Ang", email: "", active: true, createdAt: 0 }];
    expect(sortTeachers(t).map((x) => x.uid)).toEqual(["b", "a"]);
    expect(teacherNameOf(t, "b")).toBe("mr lim");
    expect(teacherNameOf(t, "q")).toBe("Unknown teacher");
  });
  it("maps class ids to names, falling back to the id", () => {
    expect(classNamesFor(["c1", "gone"], classes)).toEqual([{ id: "c1", name: "6 Courage" }, { id: "gone", name: "gone" }]);
  });
  it("validates emails, searches and teacher input", () => {
    expect(isEmail(" a@b.sg ")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(canSearch("  ab ")).toBe(false);
    expect(canSearch("ABC123")).toBe(true);
    expect(canSaveTeacher("Ms Tan", "tan@x.sg")).toBe(true);
    expect(canSaveTeacher(" ", "tan@x.sg")).toBe(false);
    expect(canSaveTeacher("Ms Tan", "nope")).toBe(false);
  });
  it("labels sign-in methods and allows password reset only for email logins", () => {
    expect(signInMethods(["password", "google.com"])).toBe("Email + password, Google");
    expect(signInMethods([])).toBe("None");
    expect(canResetPassword({ providers: ["password"] })).toBe(true);
    expect(canResetPassword({ providers: ["google.com"] })).toBe(false);
  });
  it("lists the classes a login can still join", () => {
    expect(joinableClasses({ classIds: ["c1"] }, classes).map((c) => c.id)).toEqual(["c3", "c2"]);
  });
  it("requires the exact class name to delete", () => {
    expect(matchesClassName(" 6 Courage ", "6 Courage")).toBe(true);
    expect(matchesClassName("6 courage", "6 Courage")).toBe(false);
    expect(matchesClassName("", "")).toBe(false);
  });
  it("formats dates in Singapore time", () => {
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate(Date.UTC(2026, 9, 21, 17, 0))).toBe("22 Oct 2026"); // 01:00 SGT next day
    expect(formatDate(Date.UTC(2026, 0, 5, 3, 0))).toBe("5 Jan 2026");
  });
});
