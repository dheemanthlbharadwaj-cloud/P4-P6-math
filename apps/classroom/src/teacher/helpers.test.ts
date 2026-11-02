import { describe, expect, it } from "vitest";
import type { ClassQuestionRow, TaskMarks } from "@p6/shared";
import {
  attachmentKind, canPost, classTopicPct, columnSummary, cycleMark, formatBirthday, gridFromMarks, hardestQuestions, keyToMark, markSummary, marksPayload, moveCell,
  normalizeBirthday, parseDueDate, pct, sameMarks, setCell, setRow, sortRoster, studentQuestions, typeRows, uploadFields, cloudinaryUploadUrl, formatDate, partTag,
} from "./helpers";

describe("birthdays", () => {
  it("normalises and validates", () => {
    expect(normalizeBirthday("3-7")).toBe("03-07");
    expect(normalizeBirthday(" 12/31 ")).toBe("12-31");
    expect(normalizeBirthday("02-29")).toBe("02-29");
    expect(normalizeBirthday("02-30")).toBeNull();
    expect(normalizeBirthday("13-01")).toBeNull();
    expect(normalizeBirthday("abc")).toBeNull();
  });
  it("formats", () => { expect(formatBirthday("03-07")).toBe("7 Mar"); expect(formatBirthday(undefined)).toBe(""); });
  it("sorts the roster by name", () => {
    expect(sortRoster([{ uid: "b", displayName: "zach" }, { uid: "a", displayName: "Aisha" }]).map((s) => s.uid)).toEqual(["a", "b"]);
  });
});

describe("dates", () => {
  it("parses a due date as the end of that Singapore day", () => {
    const ms = parseDueDate("2026-11-05")!;
    expect(new Date(ms).toISOString()).toBe("2026-11-05T15:59:00.000Z");
    expect(parseDueDate("5/11/2026")).toBe(ms);
    expect(parseDueDate("2026-02-30")).toBeNull();
    expect(parseDueDate("soon")).toBeNull();
  });
  it("formats in Singapore time", () => { expect(formatDate(Date.UTC(2026, 9, 21, 17, 0))).toBe("22 Oct 2026"); });
});

describe("posts", () => {
  it("detects the attachment kind", () => {
    expect(attachmentKind("a.PDF")).toBe("pdf");
    expect(attachmentKind("x", "image/png")).toBe("image");
    expect(attachmentKind("pic.jpeg")).toBe("image");
    expect(attachmentKind("notes.docx")).toBe("link");
  });
  it("validates a post", () => {
    expect(canPost("  ", [], 2000).ok).toBe(false);
    expect(canPost("", [{ name: "a", url: "u", kind: "pdf" }], 2000).ok).toBe(true);
    expect(canPost("x".repeat(2001), [], 2000).ok).toBe(false);
    expect(canPost("hi", [], 2000).ok).toBe(true);
  });
  it("builds the Cloudinary upload request", () => {
    expect(cloudinaryUploadUrl("n9gn4u6k")).toBe("https://api.cloudinary.com/v1_1/n9gn4u6k/auto/upload");
    expect(uploadFields({ cloudName: "c", apiKey: "k", timestamp: 5, signature: "s", folder: "f", publicId: "p" })).toEqual({ api_key: "k", timestamp: "5", signature: "s", folder: "f", public_id: "p" });
  });
});

describe("marking grid", () => {
  const qs = ["q1", "q2", "q3"];
  it("cycles empty → right → wrong → empty", () => {
    expect(cycleMark(undefined)).toBe("right");
    expect(cycleMark("right")).toBe("wrong");
    expect(cycleMark("wrong")).toBeUndefined();
  });
  it("sets cells and rows immutably", () => {
    const g0 = {};
    const g1 = setCell(g0, "s1", "q1", "right");
    expect(g0).toEqual({});
    expect(g1).toEqual({ s1: { q1: "right" } });
    expect(setCell(g1, "s1", "q1", undefined)).toEqual({ s1: {} });
    expect(setRow(g1, "s1", qs, "wrong")).toEqual({ s1: { q1: "wrong", q2: "wrong", q3: "wrong" } });
    expect(setRow(g1, "s1", qs, undefined)).toEqual({ s1: {} });
  });
  it("loads saved marks, ignoring questions not in the task", () => {
    const saved: TaskMarks[] = [{ studentUid: "s1", marks: { q1: "right", zz: "wrong" }, markedAt: 1, source: "teacher" }];
    expect(gridFromMarks(saved, qs)).toEqual({ s1: { q1: "right" } });
  });
  it("builds the payload in task order, only marked", () => {
    expect(marksPayload({ q3: "wrong", q1: "right" }, qs)).toEqual({ q1: "right", q3: "wrong" });
    expect(Object.keys(marksPayload({ q3: "wrong", q1: "right" }, qs))).toEqual(["q1", "q3"]);
    expect(marksPayload(undefined, qs)).toEqual({});
  });
  it("compares and summarises", () => {
    expect(sameMarks({ q1: "right" }, { q1: "right" }, qs)).toBe(true);
    expect(sameMarks({ q1: "right" }, {}, qs)).toBe(false);
    expect(markSummary({ q1: "right", q2: "wrong" }, qs)).toEqual({ right: 1, wrong: 1, unmarked: 1 });
    expect(columnSummary({ a: { q1: "right" }, b: { q1: "wrong" }, c: {} }, ["a", "b", "c"], "q1")).toEqual({ right: 1, wrong: 1 });
  });
  it("maps keys", () => {
    expect(keyToMark("y")).toBe("right");
    expect(keyToMark("1")).toBe("right");
    expect(keyToMark("X")).toBe("wrong");
    expect(keyToMark("Backspace")).toBeNull();
    expect(keyToMark("q")).toBeUndefined();
  });
  it("moves with arrow keys inside the grid", () => {
    expect(moveCell(0, 0, "ArrowUp", 3, 4)).toEqual([0, 0]);
    expect(moveCell(0, 0, "ArrowRight", 3, 4)).toEqual([0, 1]);
    expect(moveCell(2, 3, "ArrowDown", 3, 4)).toEqual([2, 3]);
    expect(moveCell(1, 1, "a", 3, 4)).toBeNull();
  });
});

describe("analytics formatting", () => {
  it("percentages", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(1, 0)).toBe(0);
    expect(classTopicPct({ total: 10, completed: 25, students: 5 })).toBe(50);
  });
  it("splits by type with the class total", () => {
    const rows = typeRows({ topicId: "t", title: "T", total: 10, completed: 4, attempted: 6, students: 2, byType: { open: { total: 4, completed: 1 }, mcq: { total: 6, completed: 3 } } });
    expect(rows).toEqual([
      { type: "mcq", label: "Multiple choice", completed: 3, total: 12, pct: 25 },
      { type: "open", label: "Open-ended", completed: 1, total: 8, pct: 13 },
    ]);
  });
  const row = (questionId: string, subtopicId: string, level: 1 | 2 | 3, studentsAttempted: number, studentsCompleted: number, totalAttempts: number): ClassQuestionRow =>
    ({ questionId, subtopicId, level, studentsAttempted, studentsCompleted, totalAttempts, avgAttempts: studentsAttempted ? totalAttempts / studentsAttempted : 0 });
  const topicOf = (s: string) => (s.startsWith("f") ? "frac" : "geo");
  it("ranks the hardest questions and filters", () => {
    const rows = [row("a", "f1", 1, 10, 9, 12), row("b", "f1", 2, 10, 4, 30), row("c", "g1", 1, 8, 2, 40), row("d", "g1", 3, 0, 0, 0)];
    expect(hardestQuestions(rows, {}, topicOf).map((r) => r.questionId)).toEqual(["c", "b", "a"]);
    expect(hardestQuestions(rows, { topicId: "frac" }, topicOf).map((r) => r.questionId)).toEqual(["b", "a"]);
    expect(hardestQuestions(rows, { level: 1 }, topicOf).map((r) => r.questionId)).toEqual(["c", "a"]);
    expect(hardestQuestions(rows, {}, topicOf, 1)).toHaveLength(1);
  });
  it("orders a student's questions: not completed first", () => {
    const q = (questionId: string, attempts: number, completed: boolean) => ({ questionId, subtopicId: "f1", level: 1 as const, attempts, completed, wrong: 0 });
    expect(studentQuestions([q("a", 5, true), q("b", 1, false), q("c", 3, false)], {}, topicOf).map((r) => r.questionId)).toEqual(["c", "b", "a"]);
  });
});

describe("misc", () => { it("part tags", () => { expect(partTag(0)).toBe("(a)"); expect(partTag(1, "ii")).toBe("(ii)"); }); });
